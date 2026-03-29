#!/usr/bin/env node
/**
 * homelab-snapshot/scripts/snapshot.js
 *
 * Orchestrator — runs all collector skills in parallel, assembles
 * a unified MonitorSnapshot payload, and POSTs it to the backend.
 *
 * Required env vars (load from ~/openclaw-skills/.env):
 *   MONITOR_URL      — e.g. http://192.168.1.27:3010
 *   MONITOR_API_KEY  — shared secret for ingest endpoint
 *   PROXMOX_TOKEN    — Proxmox API token
 *   GITHUB_TOKEN     — GitHub PAT with repo scope
 *
 * Usage:
 *   set -a; source ~/openclaw-skills/.env; set +a
 *   node scripts/snapshot.js
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import http from 'http';

const execAsync = promisify(exec);
const __dir = dirname(fileURLToPath(import.meta.url));
// Use absolute path so script works regardless of where it's called from
const SKILLS_DIR = process.env.SKILLS_DIR || join(__dir, '../..');

const MONITOR_URL     = process.env.MONITOR_URL     || 'http://...:3010';
const MONITOR_API_KEY = process.env.MONITOR_API_KEY || '';

if (!MONITOR_API_KEY) {
  console.error('[snapshot] MONITOR_API_KEY is required');
  process.exit(1);
}

// ── Run a skill script and parse its JSON output ──────────────────────────────

// Per-skill timeouts in ms — log-scanner is slower due to SCP + remote execution
const SKILL_TIMEOUTS = {
  'log-scanner': 90000,
};
const DEFAULT_TIMEOUT = 30000;

async function runSkill(skillName, scriptFile) {
  const scriptPath = join(SKILLS_DIR, skillName, 'scripts', scriptFile);
  const timeout = SKILL_TIMEOUTS[skillName] || DEFAULT_TIMEOUT;
  try {
    const { stdout } = await execAsync(`node ${scriptPath}`, {
      timeout,
      env: process.env,
    });
    return JSON.parse(stdout.trim());
  } catch (err) {
    console.error(`[snapshot] ${skillName} failed: ${err.message.split('\n')[0]}`);
    return null;
  }
}

// ── POST snapshot to backend ──────────────────────────────────────────────────

function postSnapshot(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url = new URL(`${MONITOR_URL}/api/monitor/ingest`);

    const req = http.request({
      hostname: url.hostname,
      port:     url.port || 80,
      path:     url.pathname,
      method:   'POST',
      headers: {
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-api-key':     MONITOR_API_KEY,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(res.statusCode));
    });

    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('POST timed out')); });
    req.write(body);
    req.end();
  });
}

// ── Merge docker-stats and log-scanner results by host/container ──────────────

function mergeContainerData(dockerStats, logScanner) {
  if (!dockerStats) return [];

  // Build log error map: host -> containerName -> { errorCount, warnCount }
  const logMap = {};
  if (logScanner) {
    for (const host of logScanner) {
      logMap[host.host] = {};
      for (const c of (host.containers || [])) {
        logMap[host.host][c.name] = { errorCount: c.errorCount, warnCount: c.warnCount };
      }
    }
  }

  return dockerStats.map(host => ({
    host:      host.host,
    reachable: host.reachable,
    error:     host.error || null,
    containers: (host.containers || []).map(c => {
      const logs = logMap[host.host]?.[c.name] || { errorCount: 0, warnCount: 0 };
      return { ...c, ...logs };
    }),
  }));
}

// ── Merge github commits into container data ──────────────────────────────────

// Maps container name patterns to repo slugs
const CONTAINER_REPO_MAP = {
  // 'container-name': 'github-user/repo',
};

function repoForContainer(containerName) {
  const name = containerName.toLowerCase();
  for (const [pattern, repo] of Object.entries(CONTAINER_REPO_MAP)) {
    if (name.includes(pattern)) return repo;
  }
  return null;
}

function mergeGithubData(vms, githubCommits) {
  if (!githubCommits) return vms;

  // Build commit map: repo -> commit info
  const commitMap = {};
  for (const c of githubCommits) {
    if (c.committedAt) commitMap[c.repo] = c;
  }

  return vms.map(host => ({
    ...host,
    containers: (host.containers || []).map(c => {
      const repo = repoForContainer(c.name);
      const commit = repo ? commitMap[repo] : null;
      return {
        ...c,
        repo:              repo || null,
        lastCommitAt:      commit?.committedAt || null,
        lastCommitSha:     commit?.sha || null,
        lastCommitMessage: commit?.message || null,
      };
    }),
  }));
}

// ── Anomaly detection ───────────────────────────────────────────────────────

const COOLDOWN_FILE = '/tmp/openclaw-anomaly-cooldown.json';
const COOLDOWN_MS   = 5 * 60 * 1000; // 5 minutes — matches log scan window to prevent gaps

const THRESHOLDS = {
  containerErrors:  1,    // any errors in 5-min scan window
  containerWarns:   1,    // any warnings in 5-min scan window
  jetsonTempC:      70,   // degrees Celsius
  proxmoxCpuPct:    80,   // percent
  vmDiskPct:        85,   // percent — VM filesystem usage
};

function isCoolingDown(cooldowns, key) {
  const last = cooldowns[key];
  return last && (Date.now() - last) < COOLDOWN_MS;
}

async function postEvent(agent, type, description, metadata) {
  const body = JSON.stringify({ agent, type, description, metadata });
  return new Promise((resolve) => {
    const url = new URL(`${MONITOR_URL}/api/monitor/events`);
    const req = http.request({
      hostname: url.hostname,
      port:     url.port || 80,
      path:     url.pathname,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-api-key':      MONITOR_API_KEY,
      },
    }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', () => resolve(0));
    req.setTimeout(5000, () => { req.destroy(); resolve(0); });
    req.write(body);
    req.end();
  });
}

async function detectAndReportAnomalies(snapshot) {
  // Load cooldowns synchronously
  let cooldowns = {};
  try {
    const data = readFileSync(COOLDOWN_FILE, 'utf8');
    cooldowns = JSON.parse(data);
  } catch { /* no cooldown file yet */ }

  const anomalies = [];

  // Check container error counts
  for (const vm of (snapshot.vms || [])) {
    if (!vm.reachable) {
      const key = `unreachable:${vm.host}`;
      if (!isCoolingDown(cooldowns, key)) {
        anomalies.push({ key, type: 'host_unreachable', description: `${vm.host} is unreachable`, metadata: { host: vm.host } });
      }
      continue;
    }
    for (const c of (vm.containers || [])) {
      if (c.errorCount >= THRESHOLDS.containerErrors) {
        const key = `errors:${vm.host}:${c.name}`;
        if (!isCoolingDown(cooldowns, key)) {
          anomalies.push({
            key,
            type: 'container_errors',
            description: `${c.name} on ${vm.host}: ${c.errorCount} error(s) in last 5m`,
            metadata: { host: vm.host, container: c.name, errorCount: c.errorCount },
          });
        }
      } else if (c.warnCount >= THRESHOLDS.containerWarns) {
        const key = `warns:${vm.host}:${c.name}`;
        if (!isCoolingDown(cooldowns, key)) {
          anomalies.push({
            key,
            type: 'container_warnings',
            description: `${c.name} on ${vm.host}: ${c.warnCount} warning(s) in last 5m`,
            metadata: { host: vm.host, container: c.name, warnCount: c.warnCount },
          });
        }
      }
    }
  }

  // Check Jetson temperatures
  for (const j of (snapshot.jetsons || [])) {
    if (j.reachable && j.temperatureCelsius >= THRESHOLDS.jetsonTempC) {
      const key = `temp:${j.host}`;
      if (!isCoolingDown(cooldowns, key)) {
        anomalies.push({
          key,
          type: 'high_temperature',
          description: `${j.host} temperature critical: ${j.temperatureCelsius}°C`,
          metadata: { host: j.host, temperatureCelsius: j.temperatureCelsius },
        });
      }
    }
  }

  // Check VM disk usage
  for (const node of (snapshot.proxmox || [])) {
    for (const vm of (node.vms || [])) {
      if (vm.diskPercent != null && vm.diskPercent >= THRESHOLDS.vmDiskPct) {
        const key = `vm-disk:${vm.name}`;
        if (!isCoolingDown(cooldowns, key)) {
          anomalies.push({
            key,
            type: 'high_disk',
            description: `${vm.name} VM disk at ${vm.diskPercent}% (${vm.diskUsedGB}/${vm.diskTotalGB}GB)`,
            metadata: { vm: vm.name, diskPercent: vm.diskPercent, diskUsedGB: vm.diskUsedGB, diskTotalGB: vm.diskTotalGB },
          });
        }
      }
    }
  }

  // Check Proxmox CPU
  for (const node of (snapshot.proxmox || [])) {
    if (node.reachable && node.cpuPercent >= THRESHOLDS.proxmoxCpuPct) {
      const key = `proxmox-cpu:${node.node}`;
      if (!isCoolingDown(cooldowns, key)) {
        anomalies.push({
          key,
          type: 'high_cpu',
          description: `Proxmox node ${node.node} CPU at ${node.cpuPercent}%`,
          metadata: { node: node.node, cpuPercent: node.cpuPercent },
        });
      }
    }
  }

  if (anomalies.length === 0) return;

  console.log(`[snapshot] ${anomalies.length} anomaly/anomalies detected`);

  for (const anomaly of anomalies) {
    // Post the raw anomaly event immediately
    await postEvent(
      'openclaw-anomaly-detector',
      anomaly.type,
      anomaly.description,
      anomaly.metadata
    );
    console.log(`[snapshot] anomaly posted: ${anomaly.description}`);

    // Update cooldown
    cooldowns[anomaly.key] = Date.now();
  }

  // Save updated cooldowns
  try {
    writeFileSync(COOLDOWN_FILE, JSON.stringify(cooldowns));
  } catch { /* ignore */ }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const collectedAt = new Date().toISOString();
console.log(`[snapshot] collecting at ${collectedAt}`);

// Run all five skills in parallel
const [jetsonMetrics, proxmoxMetrics, dockerStats, logScanner, githubCommits] =
  await Promise.all([
    runSkill('jetson-metrics',      'collect.js'),
    runSkill('proxmox-metrics',     'collect.js'),
    runSkill('docker-stats',        'collect.js'),
    runSkill('log-scanner',         'scan.js'),
    runSkill('github-last-commit',  'collect.js'),
  ]);

// Merge container data
const vmsWithLogs    = mergeContainerData(dockerStats, logScanner);
const vmsWithCommits = mergeGithubData(vmsWithLogs, githubCommits);

// Assemble final snapshot
const snapshot = {
  collectedAt,
  proxmox: proxmoxMetrics || [],
  vms:     vmsWithCommits,
  jetsons: jetsonMetrics  || [],
};

// Log summary
console.log(`[snapshot] proxmox: ${snapshot.proxmox.length} node(s)`);
console.log(`[snapshot] vms: ${snapshot.vms.length} host(s), ${snapshot.vms.reduce((n, h) => n + (h.containers?.length || 0), 0)} container(s)`);
console.log(`[snapshot] jetsons: ${snapshot.jetsons.length} device(s)`);
console.log(`[snapshot] github: ${githubCommits?.length || 0} repo(s)`);

// POST to backend
try {
  const status = await postSnapshot(snapshot);
  console.log(`[snapshot] POST ${MONITOR_URL}/api/monitor/ingest → ${status}`);
} catch (err) {
  console.error(`[snapshot] POST failed: ${err.message}`);
}

// ── Anomaly detection ─────────────────────────────────────────────────────────
await detectAndReportAnomalies(snapshot);
