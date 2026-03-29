---
name: log-scanner
description: Scan recent Docker container logs for errors and warnings. Checks logs from the last 5 minutes across all running containers on configured hosts. Returns error/warning counts per container.
metadata:
  openclaw:
    emoji: "🔍"
  requires:
    bins:
      - node
      - ssh
      - docker
---

# Log Scanner Skill

Scans the last 5 minutes of logs for each running Docker container across
all configured hosts. Returns error and warning counts per container.

Runs locally for the infra VM, via SSH for remote hosts.

## Hosts

| Host | IP | SSH User | Method |
|---|---|---|---|
| apps VM | 192.168.1.27 | mikemcg | SSH |
| infra VM | localhost | — | local |

## Usage

```bash
node scripts/scan.js
```

## Output

JSON array, one entry per host:

```json
[
  {
    "host": "apps-vm",
    "reachable": true,
    "scannedAt": "2026-03-24T20:00:00.000Z",
    "window": "5m",
    "containers": [
      { "name": "fridaytennis-watcher", "errorCount": 0, "warnCount": 0 },
      { "name": "fridaytennis-app",     "errorCount": 2, "warnCount": 1 }
    ]
  }
]
```

## Troubleshooting

- **Empty containers**: No running containers found on host
- **Permission denied**: Ensure SSH user is in the `docker` group
