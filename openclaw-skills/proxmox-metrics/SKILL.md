---
name: proxmox-metrics
description: Collect CPU, memory, disk, and uptime metrics from Proxmox VE nodes via the REST API. Returns structured JSON per node.
metadata:
  openclaw:
    emoji: "🖥️"
  requires:
    bins:
      - node
---

# Proxmox Metrics Skill

Queries the Proxmox VE REST API for host-level node metrics.
Uses a Proxmox API token — no password needed.

## Configuration

Requires the following environment variables on the infra VM:

| Variable | Value |
|---|---|
| `PROXMOX_HOST` | `192.168.1.100` |
| `PROXMOX_TOKEN` | `root@pam!homelab-monitor=<secret>` |

The Proxmox API uses a self-signed TLS certificate — TLS verification
is disabled (`rejectUnauthorized: false`) for internal homelab use.

## Usage

```bash
PROXMOX_HOST=192.168.1.100 PROXMOX_TOKEN=root@pam!homelab-monitor=<secret> node scripts/collect.js
```

## Output

JSON array, one entry per Proxmox node:

```json
[
  {
    "node": "proxmox",
    "status": "online",
    "reachable": true,
    "cpuPercent": 1,
    "memoryPercent": 40,
    "memoryUsedGB": 12.4,
    "memoryTotalGB": 31.3,
    "diskPercent": 7,
    "diskUsedGB": 7.0,
    "diskTotalGB": 93.9,
    "uptimeSeconds": 258505,
    "collectedAt": "2026-03-24T20:00:00.000Z"
  }
]
```

## Troubleshooting

- **401 Unauthorized**: Check token format — must be `root@pam!homelab-monitor=<secret>`
- **Connection refused**: Proxmox is at port 8006, not 80/443
- **TLS error**: Script disables cert verification — should not occur
