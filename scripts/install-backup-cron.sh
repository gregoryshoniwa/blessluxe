#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# BLESSLUXE — Install daily backup cron + AWS CLI.
#
# Runs scripts/backup.sh nightly at 03:00 UTC. Idempotent.
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root."
  exit 1
fi

REPO_DIR="${REPO_DIR:-/opt/blessluxe}"
SCRIPT="$REPO_DIR/scripts/backup.sh"
LOG="/var/log/blessluxe-backup.log"
CRON_LINE="0 3 * * * $SCRIPT >> $LOG 2>&1"

if ! command -v aws > /dev/null 2>&1; then
  echo "═══ installing awscli (used to push backups to DO Spaces) ═══"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq awscli > /dev/null
fi

chmod +x "$SCRIPT" "$REPO_DIR/scripts/restore.sh" 2>/dev/null || true
touch "$LOG"
chmod 640 "$LOG"

echo "═══ installing root cron entry ═══"
# Drop any existing blessluxe-backup line, then re-add — keeps the crontab
# idempotent without depending on `crontab -l` exit codes.
(crontab -l 2>/dev/null | grep -v 'blessluxe.*backup\.sh' ; echo "$CRON_LINE") | crontab -

echo
echo "✓ cron installed:"
crontab -l | grep blessluxe
echo
echo "Test it now:                  sudo bash $SCRIPT"
echo "Tail backup log:              tail -f $LOG"
