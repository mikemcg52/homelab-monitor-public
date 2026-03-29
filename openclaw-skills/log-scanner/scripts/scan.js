#!/usr/bin/env node
/**
 * log-scanner/scripts/scan.js
 *
 * Scans the last 5 minutes of logs for each running Docker container
 * across configured hosts. Returns error/warning counts per container.
 *
 * For remote hosts: SCPs scan.sh to the host and executes it via SSH.
 * For local host: runs scan.sh directly.
 *
 * Usage:
 *   node scripts/scan.js
 *
 * Output: JSON array to stdout, one entry per host.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const execAsync = promisify(exec);

const __dir = dirname(fileURLToPath(import.meta.url));
const SCAN_SH = join(__dir, 'scan.sh');

const HOSTS = [
  { name: 'apps-vm',  ip: '...', user: '...', local: false },
  { name: 'infra-vm', ip: null,  user: null,   local: true  },
];

const LOG_WINDOW       = '5m';
const SSH_TIMEOUT_SECS = 10;
const EXEC_TIMEOUT_MS  = 60000;

// ── Collector ─────────────────────────────────────────────────────────────────

async function collectHost(host) {
  const scannedAt = new Date().toISOString();
  try {
    let raw;

    if (host.local) {
      const { stdout } = await execAsync(`bash ${SCAN_SH} ${LOG_WINDOW}`, { timeout: EXEC_TIMEOUT_MS });
      raw = stdout.trim();
    } else {
      // SCP the script to remote, execute it, clean up
      const remoteScript = `/tmp/openclaw-scan-${Date.now()}.sh`;
      await execAsync(
        `scp -o ConnectTimeout=${SSH_TIMEOUT_SECS} -o BatchMode=yes ${SCAN_SH} ${host.user}@${host.ip}:${remoteScript}`,
        { timeout: EXEC_TIMEOUT_MS }
      );
      const { stdout } = await execAsync(
        `ssh -o ConnectTimeout=${SSH_TIMEOUT_SECS} -o BatchMode=yes ${host.user}@${host.ip} "bash ${remoteScript} ${LOG_WINDOW}; rm -f ${remoteScript}"`,
        { timeout: EXEC_TIMEOUT_MS }
      );
      raw = stdout.trim();
    }

    const containers = raw.split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); }
      catch { return null; }
    }).filter(Boolean);

    return {
      host:       host.name,
      reachable:  true,
      scannedAt,
      window:     LOG_WINDOW,
      containers,
    };

  } catch (err) {
    return {
      host:      host.name,
      reachable: false,
      error:     err.message.includes('timed out') || err.message.includes('Connection')
        ? 'Connection timed out'
        : err.message.split('\n')[0],
      scannedAt,
      window:    LOG_WINDOW,
      containers: [],
    };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const results = await Promise.all(HOSTS.map(collectHost));
console.log(JSON.stringify(results, null, 2));
