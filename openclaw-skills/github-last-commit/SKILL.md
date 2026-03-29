---
name: github-last-commit
description: Fetch the latest commit SHA, timestamp, and message for each registered homelab GitHub repository. Used to compare against container uptime for staleness detection.
metadata:
  openclaw:
    emoji: "🐙"
  requires:
    bins:
      - node
---

# GitHub Last Commit Skill

Queries the GitHub REST API for the most recent commit on the default branch
of each configured homelab repository. All repos are private — requires a
GitHub PAT with `repo` scope stored as `GITHUB_TOKEN`.

## Configuration

Requires the following environment variable:

| Variable | Value |
|---|---|
| `GITHUB_TOKEN` | GitHub PAT with `repo` scope |

## Repos tracked

| Repo | Container(s) |
|---|---|
| mikemcg52/FridayTennis | fridaytennis-app, fridaytennis-watcher |
| mikemcg52/standup-tracker | standup-tracker |
| mikemcg52/ai-gateway | ai-gateway |
| mikemcg52/home-budget | homebudget-frontend, homebudget-backend |
| mikemcg52/project-dashboard | project-dashboard |
| mikemcg52/timetracker | timetracker-frontend, timetracker-backend |

## Usage

```bash
GITHUB_TOKEN=ghp_... node scripts/collect.js
```

## Output

JSON array, one entry per repo:

```json
[
  {
    "repo": "mikemcg52/FridayTennis",
    "branch": "master",
    "sha": "794f48a1",
    "committedAt": "2026-03-24T18:00:00Z",
    "message": "fix: correct IMAP IDLE pattern",
    "author": "mikemcg52"
  }
]
```

## Troubleshooting

- **401 Unauthorized**: Token expired or missing `repo` scope
- **404 Not Found**: Repo name wrong or token lacks access
- **Rate limit**: 5000 requests/hour with auth — well within limits for this use case
