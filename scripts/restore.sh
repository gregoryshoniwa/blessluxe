#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# BLESSLUXE — Restore from backup
#
# Pulls a backup from DO Spaces (or a local file) and restores both the
# database and the uploads volume. Destructive — drops + recreates schema
# objects via pg_dump's `--clean --if-exists`.
#
# Usage:
#   sudo bash scripts/restore.sh                          # restore most-recent
#   sudo bash scripts/restore.sh 2026-06-11               # most-recent on date
#   sudo bash scripts/restore.sh db-20260611-201025.sql.gz
#   sudo bash scripts/restore.sh /path/to/db-*.sql.gz     # local file
#
# Requires the same BACKUP_SPACES_* env in /opt/blessluxe/.env that
# backup.sh uses, unless you pass a local file path.
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/blessluxe}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/blessluxe}"
HOST="$(hostname -s)"
SELECTOR="${1:-}"

cd "$REPO_DIR"

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
PG_USER="${BACKUP_PG_USER:-${POSTGRES_USER:-blessluxe}}"
PG_DB="${BACKUP_PG_DB:-${POSTGRES_DB:-blessluxe}}"

mkdir -p "$BACKUP_DIR"

# ─── Resolve the source DB file ───────────────────────────────────────
DB_FILE=""
UP_FILE=""

if [[ -n "$SELECTOR" && -f "$SELECTOR" ]]; then
  # Caller passed a path to a local file.
  DB_FILE="$SELECTOR"
  # Match the sibling uploads tar if it exists.
  UP_GUESS="${SELECTOR/db-/uploads-}"
  UP_GUESS="${UP_GUESS%.sql.gz}.tar.gz"
  [[ -f "$UP_GUESS" ]] && UP_FILE="$UP_GUESS"
else
  if [[ -z "$REGION" || -z "$BUCKET" || -z "$KEY" || -z "$SECRET" ]]; then
    echo "✗ Missing BACKUP_SPACES_{REGION,BUCKET,KEY,SECRET} in .env." >&2
    exit 1
  fi
  if ! command -v aws > /dev/null 2>&1; then
    echo "✗ aws CLI not installed. Install with: apt-get install -y awscli" >&2
    exit 1
  fi
  export AWS_ACCESS_KEY_ID="$KEY"
  export AWS_SECRET_ACCESS_KEY="$SECRET"
  export AWS_DEFAULT_REGION="us-east-1"

  if [[ "$SELECTOR" =~ ^db-.*\.sql\.gz$ ]]; then
    # Caller named the exact file; find its date prefix.
    DATE_PATH="$(date -u -d "$(echo "$SELECTOR" | sed -E 's/db-([0-9]{4})([0-9]{2})([0-9]{2}).*/\1-\2-\3/')" +%Y/%m/%d 2>/dev/null || echo "")"
  elif [[ "$SELECTOR" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    DATE_PATH="$(date -u -d "$SELECTOR" +%Y/%m/%d)"
  else
    DATE_PATH=""  # search all
  fi

  echo "═══ locating latest backup in s3://${BUCKET}/${HOST}/${DATE_PATH:-(all)} ═══"
  LATEST=$(aws --endpoint-url "$ENDPOINT" s3 ls --recursive \
    "s3://${BUCKET}/${HOST}/${DATE_PATH:+$DATE_PATH/}" \
    | awk '/db-.*\.sql\.gz$/{print $4}' | sort | tail -n 1)
  if [[ -z "$LATEST" ]]; then
    echo "✗ No db-*.sql.gz objects under that path." >&2
    exit 1
  fi
  DB_FILE="$BACKUP_DIR/$(basename "$LATEST")"
  echo "    → ${LATEST}"
  aws --endpoint-url "$ENDPOINT" s3 cp "s3://${BUCKET}/${LATEST}" "$DB_FILE"

  # Sibling uploads tar (same timestamp, may or may not exist).
  UP_KEY="${LATEST/db-/uploads-}"
  UP_KEY="${UP_KEY%.sql.gz}.tar.gz"
  if aws --endpoint-url "$ENDPOINT" s3 ls "s3://${BUCKET}/${UP_KEY}" > /dev/null 2>&1; then
    UP_FILE="$BACKUP_DIR/$(basename "$UP_KEY")"
    echo "    → ${UP_KEY}"
    aws --endpoint-url "$ENDPOINT" s3 cp "s3://${BUCKET}/${UP_KEY}" "$UP_FILE"
  fi
fi

echo
echo "About to restore:"
echo "  DB:      $DB_FILE"
echo "  Uploads: ${UP_FILE:-<none>}"
echo
read -r -p "Type RESTORE to confirm (this OVERWRITES the live DB): " CONFIRM
if [[ "$CONFIRM" != "RESTORE" ]]; then
  echo "Aborted."
  exit 1
fi

# ─── Apply DB dump ───────────────────────────────────────────────────
echo "═══ restoring database from $(basename "$DB_FILE") ═══"
gunzip -c "$DB_FILE" | docker compose exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$PG_USER" -d "$PG_DB"

# ─── Apply uploads tar ───────────────────────────────────────────────
if [[ -n "$UP_FILE" ]]; then
  echo "═══ restoring uploads from $(basename "$UP_FILE") ═══"
  # Clear the live volume's contents first so deleted files actually go away.
  docker compose exec -T shop sh -c 'rm -rf /app/backend/shop/uploads/* /app/backend/shop/uploads/.* 2>/dev/null || true'
  docker compose exec -T shop tar -C /app/backend/shop -xzf - < "$UP_FILE"
fi

echo "✓ restore complete"
