---
name: docker-stats
description: Collect container status, uptime, CPU%, and memory% from Docker hosts. Combines docker ps (status/uptime) with docker stats (resource usage). Returns structured JSON per host.
metadata:
  openclaw:
    emoji: "🐳"
  requires:
    bins:
      - node
      - ssh
      - docker
---

# Docker Stats Skill

Collects container health from all configured Docker hosts. Runs `docker ps`
for status and uptime, and `docker stats --no-stream` for CPU/memory metrics,
then merges by container name.

Runs locally for the infra VM (no SSH needed) and via SSH for remote hosts.

## Hosts

| Host | IP | SSH User | Method |
|---|---|---|---|
| apps VM | 192.168.1.27 | mikemcg | SSH |
| infra VM | localhost | — | local |

## Usage

```bash
node scripts/collect.js
```

## Output

JSON array, one entry per host:

```json
[
  {
    "host": "apps-vm",
    "reachable": true,
    "containers": [
      {
        "name": "fridaytennis-app",
        "state": "running",
        "status": "Up 2 days",
        "uptimeSeconds": 172800,
        "cpuPercent": 0.5,
        "memoryPercent": 3.2,
        "restartCount": 0
      }
    ],
    "collectedAt": "2026-03-24T20:00:00.000Z"
  }
]
```

## Troubleshooting

- **Permission denied on docker**: Ensure SSH user is in the `docker` group on remote hosts
- **Empty containers list**: Check that Docker is running on the target host
