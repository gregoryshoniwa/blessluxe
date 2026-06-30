#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# BLESSLUXE — Daily backup
#
# - pg_dump the postgres container to /var/backups/blessluxe/db-*.sql.gz
# - tar the uploads volume to               /var/backups/blessluxe/uploads-*.tar.gz
# - Upload both to DigitalOcean Spaces (S3-compatible) under:
#       s3://$BACKUP_SPACES_BUCKET/$(hostname -s)/YYYY/MM/DD/
# - Keep the last $BACKUP_KEEP_LOCAL_DAYS days locally (default 3); Spaces
#   keeps everything forever unless you configure a lifecycle rule.
#
# Install:
#   bash scripts/install-backup-cron.sh
#
# Manual run + tail logs:
#   sudo bash scripts/backup.sh
#   tail -f /var/log/blessluxe-backup.log
#
# Required env (in /opt/blessluxe/.env):
#   BACKUP_SPACES_BUCKET
#   BACKUP_SPACES_REGION       # e.g. nyc3, fra1, sgp1
#   BACKUP_SPACES_KEY
#   BACKUP_SPACES_SECRET
# Optional:
#   BACKUP_SPACES_ENDPOINT     # defaults to https://$REGION.digitaloceanspaces.com
#   BACKUP_KEEP_LOCAL_DAYS     # defaults to 3
#   BACKUP_PG_USER             # defaults to POSTGRES_USER or 'blessluxe'
#   BACKUP_PG_DB               # defaults to POSTGRES_DB   or 'blessluxe'
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/blessluxe}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/blessluxe}"
TS="$(date -u +%Y%m%d-%H%M%S)"
DATE_PATH="$(date -u +%Y/%m/%d)"
HOST="$(hostname -s)"
LOG_PREFIX="[$(date -u +%FT%TZ)]"

cd "$REPO_DIR"

# Load .env. The file may contain export-less KEY=VALUE lines.
if [[ -f .env ]]; then
  set -o allexport
  # shellcheck disable=SC1091
  source .env
  set +o allexport
fi

REGION="${BACKUP_SPACES_REGION:-}"
ENDPOINT="${BACKUP_SPACES_ENDPOINT:-https://${REGION}.digitaloceanspaces.com}"
BUCKET="${BACKUP_SPACES_BUCKET:-}"
KEY="${BACKUP_SPACES_KEY:-}"
SECRET="${BACKUP_SPACES_SECRET:-}"
KEEP_DAYS="${BACKUP_KEEP_LOCAL_DAYS:-3}"
PG_USER="${BACKUP_PG_USER:-${POSTGRES_USER:-blessluxe}}"
PG_DB="${BACKUP_PG_DB:-${POSTGRES_DB:-blessluxe}}"

if [[ -z "$REGION" || -z "$BUCKET" || -z "$KEY" || -z "$SECRET" ]]; then
  echo "$LOG_PREFIX ✗ Missing BACKUP_SPACES_{REGION,BUCKET,KEY,SECRET} in .env — aborting." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# ─── 1. Database dump ────────────────────────────────────────────────
DB_FILE="$BACKUP_DIR/db-${TS}.sql.gz"
echo "$LOG_PREFIX ═══ dumping database '${PG_DB}' as '${PG_USER}' → ${DB_FILE} ═══"
docker compose exec -T postgres pg_dump \
  --clean --if-exists --no-owner --no-acl \
  -U "$PG_USER" -d "$PG_DB" \
  | gzip -9 > "$DB_FILE"

DB_SIZE=$(du -h "$DB_FILE" | cut -f1)
echo "$LOG_PREFIX    ✓ db dump: $DB_SIZE"

# ─── 2. Uploads tarball ──────────────────────────────────────────────
UP_FILE="$BACKUP_DIR/uploads-${TS}.tar.gz"
echo "$LOG_PREFIX ═══ snapshotting uploads volume → ${UP_FILE} ═══"
# We tar from inside the shop container so we read the live volume rather
# than guess the host path of the named docker volume.
if docker compose ps --services 2>/dev/null | grep -q '^shop$'; then
  docker compose exec -T shop tar -C /app/backend/shop -czf - uploads \
    > "$UP_FILE" 2>/dev/null || {
      echo "$LOG_PREFIX    ! uploads dir not found in container — skipping uploads tar" >&2
      rm -f "$UP_FILE"
    }
fi
if [[ -f "$UP_FILE" ]]; then
  UP_SIZE=$(du -h "$UP_FILE" | cut -f1)
  echo "$LOG_PREFIX    ✓ uploads tar: $UP_SIZE"
fi

# ─── 3. Upload to Spaces via AWS CLI (S3-compatible) ─────────────────
if ! command -v aws > /dev/null 2>&1; then
  echo "$LOG_PREFIX ✗ aws CLI not installed. Install with: apt-get install -y awscli" >&2
  exit 1
fi

S3_PREFIX="s3://${BUCKET}/${HOST}/${DATE_PATH}"
echo "$LOG_PREFIX ═══ uploading to ${S3_PREFIX}/ ═══"
export AWS_ACCESS_KEY_ID="$KEY"
export AWS_SECRET_ACCESS_KEY="$SECRET"
# DO Spaces ignores region for routing but the CLI insists on one — any
# valid AWS region works. The endpoint URL controls where the request goes.
export AWS_DEFAULT_REGION="us-east-1"

aws --endpoint-url "$ENDPOINT" s3 cp "$DB_FILE" "$S3_PREFIX/$(basename "$DB_FILE")"
if [[ -f "$UP_FILE" ]]; then
  aws --endpoint-url "$ENDPOINT" s3 cp "$UP_FILE" "$S3_PREFIX/$(basename "$UP_FILE")"
fi

# ─── 4. Prune local copies older than KEEP_DAYS ──────────────────────
echo "$LOG_PREFIX ═══ pruning local backups older than ${KEEP_DAYS}d ═══"
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.sql.gz' -o -name 'uploads-*.tar.gz' \) \
  -mtime "+${KEEP_DAYS}" -print -delete | sed 's/^/  removed: /' || true

echo "$LOG_PREFIX ✓ backup complete"
