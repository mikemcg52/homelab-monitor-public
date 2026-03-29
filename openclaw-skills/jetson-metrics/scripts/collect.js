#!/usr/bin/env node
/**
 * jetson-metrics/scripts/collect.js
 *
 * Collects CPU, GPU, memory, temperature, and disk metrics from
 * all Jetson devices via SSH. SSH config in ~/.ssh/config handles
 * key selection automatically via the openclaw_collector key.
 *
 * Usage:
 *   node scripts/collect.js
 *
 * Output: JSON array to stdout, one entry per device.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const HOSTS = [
  { name: 'orin-nx-16gb',    ip: '...', user: 'jetson' },
  { name: 'orin-nano-8gb',   ip: '...', user: 'jetson' },
  { name: 'jetson-nano-4gb', ip: '...', user: 'jetson' },
  { name: 'jetson-nano-2gb', ip: '...', user: 'jetson' },
];

const SSH_TIMEOUT_SECS = 10;
const EXEC_TIMEOUT_MS  = 15000;

// ── SSH helper ────────────────────────────────────────────────────────────────

async function ssh(host, command) {
  const target = `${host.user}@${host.ip}`;
  const cmd = `ssh -o ConnectTimeout=${SSH_TIMEOUT_SECS} -o BatchMode=yes ${target} "${command}"`;
  const { stdout } = await execAsync(cmd, { timeout: EXEC_TIMEOUT_MS });
  return stdout.trim();
}

// ── Parsers ───────────────────────────────────────────────────────────────────

/**
 * Parse tegrastats output line.
 * Example:
 *   RAM 2048/7772MB (lfb 512x1MB) SWAP 0/3886MB CPU [45%@1907,34%@1907,23%@1907,12%@1907] GR3D_FREQ 0% CPU@52C thermal@50.25C
 */
function parseTegrastats(line) {
  const result = {
    cpuPercent: null, gpuPercent: null,
    memoryUsedMB: null, memoryTotalMB: null,
    temperatureCelsius: null,
  };

  // RAM used/total
  const ramMatch = line.match(/RAM\s+(\d+)\/(\d+)MB/);
  if (ramMatch) {
    result.memoryUsedMB  = parseInt(ramMatch[1]);
    result.memoryTotalMB = parseInt(ramMatch[2]);
  }

  // CPU: average across all cores from [XX%@freq, XX%@freq, ...]
  const cpuMatch = line.match(/CPU\s+\[([^\]]+)\]/);
  if (cpuMatch) {
    const cores = cpuMatch[1].split(',').map(c => parseInt(c));
    result.cpuPercent = Math.round(cores.reduce((a, b) => a + b, 0) / cores.length);
  }

  // GPU: GR3D_FREQ XX%
  const gpuMatch = line.match(/GR3D_FREQ\s+(\d+)%/);
  if (gpuMatch) {
    result.gpuPercent = parseInt(gpuMatch[1]);
  }

  // Temperature: try multiple field names across JetPack versions
  // Nano 4GB/2GB: CPU@XXC
  // Orin NX/Nano: SOC2@XXC or Tboard@XXC or tj@XXC
  // Fallback: thermal@XX.XXC
  const tempPatterns = [
    /CPU@([\d.]+)C/,
    /SOC2@([\d.]+)C/,
    /tj@([\d.]+)C/,
    /Tboard@([\d.]+)C/,
    /thermal@([\d.]+)C/,
  ];
  for (const pattern of tempPatterns) {
    const match = line.match(pattern);
    if (match) {
      result.temperatureCelsius = Math.round(parseFloat(match[1]));
      break;
    }
  }

  return result;
}

/**
 * Parse `df -h / | tail -1` output.
 * Example: /dev/mmcblk0p1  59G  12G  44G  22% /
 */
function parseDf(line) {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 5) return { diskPercent: null, diskUsedGB: null, diskTotalGB: null };
  return {
    diskTotalGB: parseFloat(parts[1]) || null,
    diskUsedGB:  parseFloat(parts[2]) || null,
    diskPercent: parseInt(parts[4])   || null,
  };
}

/**
 * Parse `free -m | grep Mem` output.
 * Example: Mem:  7772  3500  4272  ...
 */
function parseFree(line) {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 3) return { memoryUsedMB: null, memoryTotalMB: null };
  return {
    memoryTotalMB: parseInt(parts[1]) || null,
    memoryUsedMB:  parseInt(parts[2]) || null,
  };
}

// ── Collector ─────────────────────────────────────────────────────────────────

async function collectHost(host) {
  const collectedAt = new Date().toISOString();
  try {
    // Run all three commands in one SSH session, delimited by ---
    const raw = await ssh(host,
      "timeout 2 tegrastats 2>/dev/null | tail -1; echo '---'; df -h / | tail -1; echo '---'; free -m | grep Mem"
    );

    const [tegrastatsLine = '', dfLine = '', freeLine = ''] = raw.split('---').map(s => s.trim());

    const teg  = parseTegrastats(tegrastatsLine);
    const df   = parseDf(dfLine);
    const free = parseFree(freeLine);

    // Memory: prefer tegrastats (Jetson-accurate), fall back to free
    const memUsed  = teg.memoryUsedMB  ?? free.memoryUsedMB;
    const memTotal = teg.memoryTotalMB ?? free.memoryTotalMB;
    const memPct   = (memUsed && memTotal)
      ? Math.round((memUsed / memTotal) * 100)
      : null;

    return {
      host:               host.name,
      ip:                 host.ip,
      reachable:          true,
      cpuPercent:         teg.cpuPercent,
      gpuPercent:         teg.gpuPercent,
      memoryPercent:      memPct,
      memoryUsedMB:       memUsed,
      memoryTotalMB:      memTotal,
      temperatureCelsius: teg.temperatureCelsius,
      diskPercent:        df.diskPercent,
      diskUsedGB:         df.diskUsedGB,
      diskTotalGB:        df.diskTotalGB,
      collectedAt,
    };
  } catch (err) {
    return {
      host:      host.name,
      ip:        host.ip,
      reachable: false,
      error:     err.message.includes('timed out') || err.message.includes('Connection')
        ? 'Connection timed out'
        : err.message.split('\n')[0],
      collectedAt,
    };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const results = await Promise.all(HOSTS.map(collectHost));
console.log(JSON.stringify(results, null, 2));
