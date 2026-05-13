#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# BLESSLUXE — Cron deploy poller
#
# Runs every 2 minutes via cron. Fetches origin/master, exits silently
# if nothing changed, otherwise pulls, runs the migration, rebuilds
# whichever images have new source, and recreates containers.
#
# Install (one-time, as root on the droplet):
#   echo '*/2 * * * * /root/blessluxe/scripts/cron-deploy.sh >> /var/log/blessluxe-deploy.log 2>&1' \
#     | crontab -
#
# Tail:  tail -f /var/log/blessluxe-deploy.log
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_DIR="/root/blessluxe"
LOCK_FILE="/var/run/blessluxe-deploy.lock"
LOG_PREFIX="[$(date -u +%FT%TZ)]"

# Make sure docker is on PATH when invoked from cron (which has a minimal env).
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# Lock to prevent overlapping runs (a slow rebuild + a 2-minute tick).
# -n = non-blocking: if we can't grab the lock, another deploy is in flight
# and we just exit quietly.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  exit 0
fi

cd "$REPO_DIR"

# Cheap check first — fetch refs only, compare hashes, bail if no change.
git fetch --quiet origin master
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/master)

if [ "$LOCAL" = "$REMOTE" ]; then
  # No new commits. Silent exit so the log stays signal, not noise.
  exit 0
fi

echo "$LOG_PREFIX ═══ new master detected: ${LOCAL:0:7} → ${REMOTE:0:7} ═══"

# Print the commits we're about to deploy.
git --no-pager log --oneline "$LOCAL..$REMOTE"
echo

# Fast-forward to the new commit. --hard so any local drift on the droplet
# gets reset (the droplet is a deploy target, not a dev box).
git reset --hard origin/master

echo "$LOG_PREFIX ═══ ensuring postgres is up ═══"
docker compose up -d postgres
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U blessluxe > /dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "$LOG_PREFIX ═══ running schema migration ═══"
docker compose run --rm shop \
  node --experimental-strip-types --experimental-transform-types \
  src/db/migrate.ts

echo "$LOG_PREFIX ═══ rebuilding images ═══"
docker compose build

echo "$LOG_PREFIX ═══ recreating containers ═══"
docker compose up -d --remove-orphans

echo "$LOG_PREFIX ═══ pruning old images (>72h) ═══"
docker image prune -af --filter 'until=72h' > /dev/null 2>&1 || true

echo "$LOG_PREFIX ═══ health check ═══"
for i in 1 2 3 4 5 6; do
  sleep 5
  STATUS=$(curl -sk -o /dev/null -w '%{http_code}' https://api.blessluxe.com/health || echo 000)
  echo "  attempt $i: HTTP $STATUS"
  if [ "$STATUS" = "200" ]; then
    echo "$LOG_PREFIX ✓ deploy ${REMOTE:0:7} live"
    exit 0
  fi
done

echo "$LOG_PREFIX ✗ health check failed — recent shop logs:"
docker compose logs shop --tail 40
exit 1
# Deploy heartbeat: 2026-05-13T14:53:18Z
