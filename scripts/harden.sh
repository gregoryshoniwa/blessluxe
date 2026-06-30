#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# BLESSLUXE — Droplet hardening pass
#
# Runs the post-install hardening steps in one go. Safe to re-run.
#
#   sudo bash scripts/harden.sh
#
# Does:
#   1. Auto-applies unattended security updates (Ubuntu)
#   2. Installs + tunes fail2ban for SSH brute-force protection
#   3. Installs the nightly DB + uploads backup cron (requires
#      BACKUP_SPACES_* vars in .env)
#   4. Prints a checklist for the manual bits (DO snapshots, SSH key-only)
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root."
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

blue()   { printf "\033[1;34m%s\033[0m\n" "$*"; }
green()  { printf "\033[1;32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[1;33m%s\033[0m\n" "$*"; }

# ─── 1. Unattended security upgrades ─────────────────────────────────
blue "[1/4] Enabling unattended security upgrades…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq unattended-upgrades > /dev/null
dpkg-reconfigure -f noninteractive --priority=low unattended-upgrades > /dev/null
green "    ✓ security patches will install automatically"
echo

# ─── 2. fail2ban ────────────────────────────────────────────────────
blue "[2/4] Installing fail2ban…"
bash "$HERE/install-fail2ban.sh"
echo

# ─── 3. Backup cron ──────────────────────────────────────────────────
blue "[3/4] Installing nightly backup cron…"
bash "$HERE/install-backup-cron.sh"
echo

# ─── 4. Manual checklist ─────────────────────────────────────────────
blue "[4/4] Manual checks (DO console / config edits):"
echo
yellow "  □ Spaces — create a bucket on https://cloud.digitalocean.com/spaces"
yellow "    then set in /opt/blessluxe/.env:"
yellow "        BACKUP_SPACES_BUCKET=<name>"
yellow "        BACKUP_SPACES_REGION=<nyc3|fra1|sgp1|…>"
yellow "        BACKUP_SPACES_KEY=<spaces access key>"
yellow "        BACKUP_SPACES_SECRET=<spaces secret>"
yellow "    test with:  sudo bash $HERE/backup.sh"
echo
yellow "  □ DO Droplet Snapshots — Droplets → your droplet → Snapshots →"
yellow "    \"Enable weekly\" (\$1–2/mo). Pairs with the daily backup as a"
yellow "    last-resort one-click restore."
echo
yellow "  □ Disable SSH password login (after you've copied your key):"
yellow "        sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config"
yellow "        sed -i 's/^#*PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config"
yellow "        systemctl restart ssh"
echo
green "═══════════════════════════════════════════════════════════════════"
green "  Hardening pass complete."
green "═══════════════════════════════════════════════════════════════════"
