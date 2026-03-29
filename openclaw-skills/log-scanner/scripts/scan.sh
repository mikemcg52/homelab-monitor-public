#!/bin/bash
# scan.sh - run on each Docker host to scan container logs
# Usage: bash scan.sh [window]
# window defaults to 5m

WINDOW=${1:-5m}

for c in $(docker ps --format '{{.Names}}'); do
  logs=$(docker logs --since "$WINDOW" "$c" 2>&1)
  errors=$(printf '%s' "$logs" | grep -ciE 'error|exception|critical|fatal' || true)
  warns=$(printf '%s' "$logs" | grep -ciE 'warn|warning' || true)
  errors=${errors//[^0-9]/}
  warns=${warns//[^0-9]/}
  printf '{"name":"%s","errorCount":%s,"warnCount":%s}\n' "$c" "${errors:-0}" "${warns:-0}"
done
