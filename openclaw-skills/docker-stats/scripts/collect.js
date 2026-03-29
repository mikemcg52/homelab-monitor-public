#!/usr/bin/env node
/**
 * docker-stats/scripts/collect.js
 *
 * Collects container status and resource metrics from Docker hosts.
 * Combines `docker ps` (status, uptime, restart count) with
 * `docker stats --no-stream` (CPU%, memory%) merged by container name.
 *
 * Runs locally for the infra VM, via SSH for remote hosts.
 *
 * Usage:
 *   node scripts/collect.js
 *
 * Output: JSON array to stdout, one entry per host.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const HOSTS = [
  { name: 'apps-vm',  ip: '...', user: '...', local: false },
  { name: 'infra-vm', ip: null,  user: null,   local: true  },
];

const SSH_TIMEOUT_SECS = 10;
const EXEC_TIMEOUT_MS  = 15000;

// ── Shell helpers ─────────────────────────────────────────────────────────────

async function runLocal(command) {
  const { stdout } = await execAsync(command, { timeout: EXEC_TIMEOUT_MS });
  return stdout.trim();
}

async function runRemote(host, command) {
  const target = `${host.user}@${host.ip}`;
  const cmd = `ssh -o ConnectTimeout=${SSH_TIMEOUT_SECS} -o BatchMode=yes ${target} "${command}"`;
  const { stdout } = await execAsync(cmd, { timeout: EXEC_TIMEOUT_MS });
  return stdout.trim();
}

async function run(host, command) {
  return host.local ? runLocal(command) : runRemote(host, command);
}

// ── Parsers ───────────────────────────────────────────────────────────────────

/**
 * Parse `docker ps -a --format '{{json .}}'` output (one JSON object per line).
 * Returns map of containerName -> { state, status, restartCount }
 */
function parsePsOutput(raw) {
  const map = {};
  for (const line of raw.split('\n').filter(Boolean)) {
    try {
      const c = JSON.parse(line);
      // Names may have leading slash e.g. "/fridaytennis-app"
      const name = (c.Names || c.Name || '').replace(/^\//, '');
      map[name] = {
        state:        c.State  || 'unknown',
        status:       c.Status || '',
        restartCount: parseInt(c.RunningFor) || 0, // RunningFor not restart count — see below
      };
    } catch { /* skip malformed lines */ }
  }
  return map;
}

/**
 * Parse `docker stats --no-stream --format '{{json .}}'` output.
 * Returns map of containerName -> { cpuPercent, memoryPercent }
 */
function parseStatsOutput(raw) {
  const map = {};
  for (const line of raw.split('\n').filter(Boolean)) {
    try {
      const s = JSON.parse(line);
      const name = (s.Name || '').replace(/^\//, '');
      map[name] = {
        cpuPercent:    parseFloat(s.CPUPerc)    || 0,
        memoryPercent: parseFloat(s.MemPerc)    || 0,
      };
    } catch { /* skip malformed lines */ }
  }
  return map;
}

/**
 * Parse uptime from Docker status string.
 * Examples: "Up 2 days", "Up 3 hours", "Up 45 minutes", "Exited (0) 2 hours ago"
 */
function parseUptimeSeconds(status) {
  if (!status.startsWith('Up ')) return 0;
  const s = status.replace('Up ', '');
  if (s.includes('day'))    return parseInt(s) * 86400;
  if (s.includes('hour'))   return parseInt(s) * 3600;
  if (s.includes('minute')) return parseInt(s) * 60;
  if (s.includes('second')) return parseInt(s);
  return 0;
}

// ── Collector ─────────────────────────────────────────────────────────────────

async function collectHost(host) {
  const collectedAt = new Date().toISOString();
  try {
    // Run both commands in parallel
    const [psRaw, statsRaw] = await Promise.all([
      run(host, 'docker ps -a --format \'{{json .}}\''),
      run(host, 'docker stats --no-stream --format \'{{json .}}\''),
    ]);

    const psMap    = parsePsOutput(psRaw);
    const statsMap = parseStatsOutput(statsRaw);

    // Merge by container name — ps has all containers, stats only has running ones
    const containers = Object.entries(psMap).map(([name, ps]) => {
      const stats = statsMap[name] || { cpuPercent: 0, memoryPercent: 0 };
      return {
        name,
        state:         ps.state,
        status:        ps.status,
        uptimeSeconds: parseUptimeSeconds(ps.status),
        cpuPercent:    stats.cpuPercent,
        memoryPercent: stats.memoryPercent,
      };
    });

    return {
      host:       host.name,
      reachable:  true,
      containers,
      collectedAt,
    };

  } catch (err) {
    return {
      host:      host.name,
      reachable: false,
      error:     err.message.includes('timed out') || err.message.includes('Connection')
        ? 'Connection timed out'
        : err.message.split('\n')[0],
      containers: [],
      collectedAt,
    };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const results = await Promise.all(HOSTS.map(collectHost));
console.log(JSON.stringify(results, null, 2));
