#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# BLESSLUXE — Install + configure fail2ban for SSH brute-force protection.
#
# Idempotent: safe to re-run. Writes a local jail override so apt upgrades
# of the base config don't clobber our tuning.
#
# Defaults:
#   - SSH: 5 failed attempts in 10 minutes → 1 hour ban
#   - Watch journald (so the script works on Ubuntu 22.04+ where syslog is
#     optional). If you don't have systemd journald, switch backend to auto.
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root."
  exit 1
fi

echo "═══ installing fail2ban ═══"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq fail2ban > /dev/null

echo "═══ writing /etc/fail2ban/jail.d/blessluxe.local ═══"
cat > /etc/fail2ban/jail.d/blessluxe.local <<'EOF'
# BLESSLUXE fail2ban tuning — written by scripts/install-fail2ban.sh.
# This file lives in /jail.d/ so apt upgrades of jail.conf don't touch it.

[DEFAULT]
# Read banned IPs from systemd journal — works on stock Ubuntu 22.04+
backend  = systemd
# Ban duration once tripped.
bantime  = 1h
# Window over which failures are counted.
findtime = 10m
# Failures within `findtime` to trigger a ban.
maxretry = 5
# Don't accidentally ban localhost or the docker bridge.
ignoreip = 127.0.0.1/8 ::1 172.16.0.0/12 10.0.0.0/8 192.168.0.0/16

[sshd]
enabled = true
port    = ssh
EOF

echo "═══ restarting fail2ban ═══"
systemctl enable --now fail2ban > /dev/null
systemctl restart fail2ban
sleep 1

echo
echo "✓ fail2ban active. Current SSH jail status:"
fail2ban-client status sshd || true
echo
echo "Tail attempts:                journalctl -u fail2ban -f"
echo "Unban an IP:                  fail2ban-client set sshd unbanip <IP>"
echo "Edit thresholds:              /etc/fail2ban/jail.d/blessluxe.local"
