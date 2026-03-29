#!/usr/bin/env node
/**
 * proxmox-metrics/scripts/collect.js
 *
 * Queries the Proxmox VE REST API for node-level and per-VM metrics.
 * TLS verification is disabled for the self-signed homelab cert.
 *
 * Required env vars:
 *   PROXMOX_HOST  - e.g. 192.168.1.100
 *   PROXMOX_TOKEN - e.g. root@pam!homelab-monitor=<secret>
 */

import https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const PROXMOX_HOST  = process.env.PROXMOX_HOST  || '...';
const PROXMOX_TOKEN = process.env.PROXMOX_TOKEN || '';
const TIMEOUT_MS    = 10000;

if (!PROXMOX_TOKEN) {
  console.error('PROXMOX_TOKEN env var is required');
  process.exit(1);
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

function fetchJson(path) {
  const url = `https://${PROXMOX_HOST}:8006/api2/json${path}`;
  const headers = { 'Authorization': `PVEAPIToken=${PROXMOX_TOKEN}` };

  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers,
      rejectUnauthorized: false,
      timeout: TIMEOUT_MS,
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`Failed to parse JSON: ${body.slice(0, 100)}`)); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Connection timed out')); });
    req.on('error', reject);
  });
}

// ── Collectors ────────────────────────────────────────────────────────────────

async function collectNodes() {
  const response = await fetchJson('/nodes');
  const nodes = response.data || [];

  return nodes.map(node => {
    const memUsedGB  = node.mem    ? parseFloat((node.mem    / 1024 ** 3).toFixed(1)) : null;
    const memTotalGB = node.maxmem ? parseFloat((node.maxmem / 1024 ** 3).toFixed(1)) : null;
    const memPct     = (memUsedGB && memTotalGB) ? Math.round((memUsedGB / memTotalGB) * 100) : null;
    const diskUsedGB  = node.disk    ? parseFloat((node.disk    / 1024 ** 3).toFixed(1)) : null;
    const diskTotalGB = node.maxdisk ? parseFloat((node.maxdisk / 1024 ** 3).toFixed(1)) : null;
    const diskPct     = (diskUsedGB && diskTotalGB) ? Math.round((diskUsedGB / diskTotalGB) * 100) : null;

    return {
      node:          node.node,
      status:        node.status,
      reachable:     node.status === 'online',
      cpuPercent:    node.cpu != null ? Math.round(node.cpu * 100) : null,
      cpuCount:      node.maxcpu || null,
      memoryPercent: memPct,
      memoryUsedGB:  memUsedGB,
      memoryTotalGB: memTotalGB,
      diskPercent:   diskPct,
      diskUsedGB:    diskUsedGB,
      diskTotalGB:   diskTotalGB,
      uptimeSeconds: node.uptime || null,
    };
  });
}

// Maps VM name to SSH target for disk collection
const VM_SSH_MAP = {
  'apps':      '...@...',
  'infra':     'local',
  'ci-runner': '...@...',
};

async function getDiskUsage(vmName) {
  const target = VM_SSH_MAP[vmName];
  if (!target) return null;
  try {
    // Use local df for infra (this machine), SSH for others
    const cmd = target === 'local'
      ? 'df / | tail -1'
      : `ssh -o ConnectTimeout=5 -o BatchMode=yes ${target} "df / | tail -1"`;
    const { stdout } = await execAsync(cmd, { timeout: 8000 });
    const parts = stdout.trim().split(/\s+/);
    // df output: Filesystem 1K-blocks Used Available Use% Mountpoint
    if (parts.length >= 5) {
      const pct = parseInt(parts[4]);
      const usedGB  = parseFloat((parseInt(parts[2]) / 1024 / 1024).toFixed(1));
      const totalGB = parseFloat((parseInt(parts[1]) / 1024 / 1024).toFixed(1));
      return { diskUsedGB: usedGB, diskTotalGB: totalGB, diskPercent: isNaN(pct) ? null : pct };
    }
    return null;
  } catch { return null; }
}

async function collectVMs(nodeName) {
  const response = await fetchJson(`/nodes/${nodeName}/qemu`);
  const vms = response.data || [];

  // Fetch disk usage for running VMs in parallel
  const diskResults = await Promise.all(
    vms.map(vm => vm.status === 'running' ? getDiskUsage(vm.name) : Promise.resolve(null))
  );

  return vms.map((vm, i) => {
    const memUsedGB  = vm.mem    ? parseFloat((vm.mem    / 1024 ** 3).toFixed(1)) : null;
    const memTotalGB = vm.maxmem ? parseFloat((vm.maxmem / 1024 ** 3).toFixed(1)) : null;
    const memPct     = (memUsedGB && memTotalGB) ? Math.round((memUsedGB / memTotalGB) * 100) : null;
    const disk = diskResults[i];

    return {
      vmid:          vm.vmid,
      name:          vm.name,
      status:        vm.status,
      cpuPercent:    vm.cpu != null ? Math.round(vm.cpu * 100 * (vm.cpus || 1)) : null,
      cpuCount:      vm.cpus || null,
      memoryPercent: memPct,
      memoryUsedGB:  memUsedGB,
      memoryTotalGB: memTotalGB,
      diskAllocatedGB: vm.maxdisk ? parseFloat((vm.maxdisk / 1024 ** 3).toFixed(0)) : null,
      diskUsedGB:    disk?.diskUsedGB ?? null,
      diskTotalGB:   disk?.diskTotalGB ?? null,
      diskPercent:   disk?.diskPercent ?? null,
      uptimeSeconds: vm.uptime || null,
    };
  }).sort((a, b) => {
    if (a.status === b.status) return a.name.localeCompare(b.name);
    return a.status === 'running' ? -1 : 1;
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

const collectedAt = new Date().toISOString();

try {
  const nodes = await collectNodes();

  // Fetch VMs for each online node in parallel
  const nodesWithVMs = await Promise.all(nodes.map(async node => {
    if (!node.reachable) return { ...node, vms: [], collectedAt };
    try {
      const vms = await collectVMs(node.node);
      return { ...node, vms, collectedAt };
    } catch (err) {
      return { ...node, vms: [], vmError: err.message, collectedAt };
    }
  }));

  console.log(JSON.stringify(nodesWithVMs, null, 2));

} catch (err) {
  console.log(JSON.stringify([{
    node:      'proxmox',
    status:    'unknown',
    reachable: false,
    error:     err.message,
    vms:       [],
    collectedAt,
  }]));
}
