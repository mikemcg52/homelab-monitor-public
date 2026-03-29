---
name: jetson-metrics
description: Collect CPU, GPU, memory, temperature, and disk metrics from Jetson devices via SSH. Returns structured JSON for all configured Jetson hosts.
metadata:
  openclaw:
    emoji: "🤖"
  requires:
    bins:
      - node
      - ssh
---

# Jetson Metrics Skill

Collects health metrics from all Jetson devices in the homelab via SSH.
Compatible with JetPack 4.x (uses `timeout tegrastats` instead of `tegrastats --count`).
SSH key and host config handled via `~/.ssh/config` on the infra VM.

## Hosts

| Host | IP | User |
|---|---|---|
| orin-nx-16gb | 192.168.1.22 | jetson |
| orin-nano-8gb | 192.168.1.34 | jetson |
| jetson-nano-4gb | 192.168.1.21 | jetson |
| jetson-nano-2gb | 192.168.1.16 | jetson |

## Usage

```bash
node scripts/collect.js
```

## Output

JSON array, one entry per device. Unreachable devices are included with
`reachable: false` rather than omitted, so the caller always gets a full picture.

## Troubleshooting

- **Connection timed out**: device may be powered off
- **Permission denied**: re-run `ssh-copy-id -i ~/.ssh/openclaw_collector.pub jetson@<ip>`
- **Parse error**: run `ssh jetson@<ip> "timeout 2 tegrastats 2>/dev/null | tail -1"` manually
