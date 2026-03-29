# homelab-monitor

An AI-powered homelab operations dashboard. Collects metrics from Docker containers, VMs, Jetson devices, Proxmox, and GitHub — displays them in a live Vue 3 dashboard with an embedded OpenClaw chat panel for natural language investigation and remediation.

Built as an OpenClaw learning project. Read the full write-up on Medium: _(link to be added once published)_

---

## Architecture

```
OpenClaw (infra VM)
└── cron: every 60s → homelab-snapshot skill
    ├── docker-stats skill       (SSH → remote hosts; local on infra VM)
    ├── log-scanner skill        (SSH → remote hosts; local on infra VM)
    ├── jetson-metrics skill     (SSH → Jetson devices)
    ├── proxmox-metrics skill    (HTTPS → Proxmox API)
    ├── github-last-commit skill (HTTPS → GitHub API)
    └── POST → homelab-monitor backend

homelab-monitor backend (Node.js/Express/SQLite)
├── POST /api/monitor/ingest    ← receives snapshots
├── GET  /api/monitor/snapshot  ← polled by frontend
├── POST /api/monitor/events    ← anomaly events
└── POST /api/monitor/chat      ← proxies to OpenClaw gateway

Vue 3 frontend
└── containers · VMs · Jetsons · activity feed · chat panel
```

No LLM is used in the data collection or anomaly detection path. Claude is only invoked when you open the chat panel.

---

## Features

- **Live container monitoring** — status, uptime, CPU%, memory%, error/warn counts per container
- **VM metrics** — CPU, memory, and actual disk usage (not just allocated) via SSH
- **Jetson farm** — CPU%, GPU%, temperature, memory per device
- **Proxmox** — node and per-VM metrics from the Proxmox REST API
- **GitHub staleness** — flags containers running older code than the latest commit
- **Anomaly detection** — posts to activity feed when errors, warnings, high disk, or high temperature are detected
- **Chat panel** — ask questions and run investigations via OpenClaw with live snapshot context and SSH exec access
- **SSE streaming** — responses stream word-by-word with heartbeat keepalives for long operations

---

## Prerequisites

- [OpenClaw](https://openclaw.ai) installed on your infra VM with gateway running
- Node.js 20+
- Docker + Docker Compose on your apps VM
- SSH key (`openclaw_collector`) with access to all monitored hosts
- Proxmox API token (if using proxmox-metrics)
- GitHub PAT with `repo` scope (if using github-last-commit)

---

## Configuration

### Backend environment variables

Copy `backend/.env.example` to `backend/.env` and fill in your values:

```bash
PORT=3010
MONITOR_API_KEY=     # generate with: openssl rand -hex 32
OPENCLAW_GATEWAY_URL=http://your-infra-vm-ip:18789
OPENCLAW_GATEWAY_TOKEN=your-openclaw-gateway-token
```

### Skills environment variables

Create `~/openclaw-skills/.env` on your infra VM:

```bash
MONITOR_URL=http://your-apps-vm-ip:3010
MONITOR_API_KEY=     # same key as above
PROXMOX_HOST=your-proxmox-ip
PROXMOX_TOKEN=root@pam!homelab-monitor=your-token
GITHUB_TOKEN=ghp_your-pat-here
SKILLS_DIR=/home/user/openclaw-skills
```

### Skills configuration

Edit the host/repo lists in the skill scripts to match your environment:

| File | What to configure |
|------|-------------------|
| `openclaw-skills/docker-stats/scripts/collect.js` | Your Docker host IPs and SSH users |
| `openclaw-skills/log-scanner/scripts/scan.js` | Same as docker-stats |
| `openclaw-skills/jetson-metrics/scripts/collect.js` | Your Jetson device IPs |
| `openclaw-skills/proxmox-metrics/scripts/collect.js` | VM names and SSH targets for disk collection |
| `openclaw-skills/github-last-commit/scripts/collect.js` | Your GitHub repo slugs |
| `openclaw-skills/homelab-snapshot/scripts/snapshot.js` | Container name → repo mapping |
| `backend/src/routes/monitor.js` | SSH host list injected into chat context |

---

## Running locally

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend (in another terminal)
cd frontend && npm install && npm run dev
```

Frontend runs at `http://localhost:5173`, proxying API calls to the backend at port 3010.

---

## Setting up the cron

On your infra VM, add to crontab (`crontab -e`):

```bash
* * * * * /bin/bash -c 'cd /home/user/openclaw-skills/homelab-snapshot && \
  set -a && source /home/user/openclaw-skills/.env && set +a && \
  node scripts/snapshot.js >> /tmp/homelab-snapshot.log 2>&1'
```

---

## Deploying

The included GitHub Actions workflow builds a Docker image, pushes to GHCR, and deploys to your apps VM via SSH. You'll need:

- A self-hosted GitHub Actions runner on your CI VM
- A `deploy` user on your apps VM with `/opt/stacks/homelab-monitor/` created
- `APPS_TAILSCALE_IP` secret set in your GitHub repo settings
- `~/.ssh/apps-deploy` key on your CI runner with access to the deploy user

---

## Traefik routing (optional)

Add to your Traefik dynamic config directory:

```yaml
http:
  routers:
    homelab-monitor:
      rule: "Host(`monitor.homelab.local`)"
      entryPoints: [web]
      service: homelab-monitor
  services:
    homelab-monitor:
      loadBalancer:
        servers:
          - url: "http://your-apps-vm-ip:3010"
```

---

## License

MIT
