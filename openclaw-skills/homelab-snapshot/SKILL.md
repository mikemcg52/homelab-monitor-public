---
name: homelab-snapshot
description: Orchestrator skill — runs all five collector skills in parallel, assembles the combined homelab snapshot, and POSTs it to the homelab-monitor backend. This is the skill that runs on cron every 60 seconds.
metadata:
  openclaw:
    emoji: "📡"
  requires:
    bins:
      - node
      - ssh
---

# Homelab Snapshot Orchestrator

Runs all five collector skills in parallel and assembles a unified
`MonitorSnapshot` payload, then POSTs it to the homelab-monitor backend.

This is the skill registered with OpenClaw's cron system to run every 60 seconds.

## Required env vars (all in ~/openclaw-skills/.env)

| Variable | Purpose |
|---|---|
| `MONITOR_URL` | Backend URL e.g. `http://192.168.1.27:3010` |
| `MONITOR_API_KEY` | Shared secret for ingest endpoint |
| `PROXMOX_TOKEN` | Proxmox API token |
| `GITHUB_TOKEN` | GitHub PAT with repo scope |

## Usage

```bash
set -a; source ~/openclaw-skills/.env; set +a
node scripts/snapshot.js
```

## Output

Posts to backend and prints a summary to stdout:

```
[snapshot] collected at 2026-03-25T00:00:00.000Z
[snapshot] proxmox: 1 node(s)
[snapshot] vms: 2 host(s), 15 container(s)
[snapshot] jetsons: 4 device(s)
[snapshot] github: 6 repo(s)
[snapshot] POST http://192.168.1.27:3010/api/monitor/ingest → 201
```
