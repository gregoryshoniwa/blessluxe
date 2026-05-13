#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# BLESSLUXE — Droplet bootstrap
#
# Run as root on a fresh Ubuntu 22.04+ DigitalOcean droplet:
#
#   curl -fsSL https://raw.githubusercontent.com/gregoryshoniwa/blessluxe/master/setup.sh \
#     | bash -s -- yourdomain.com
#
# OR if you already cloned the repo:
#
#   cd blessluxe && bash setup.sh yourdomain.com
#
# Optional 2nd arg: pin a specific git ref (defaults to master).
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

DOMAIN="${1:-blessluxe.com}"
GIT_REF="${2:-master}"
REPO_URL="https://github.com/gregoryshoniwa/blessluxe.git"
INSTALL_DIR="/opt/blessluxe"

red()    { printf "\033[1;31m%s\033[0m\n" "$*"; }
green()  { printf "\033[1;32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[1;33m%s\033[0m\n" "$*"; }
blue()   { printf "\033[1;34m%s\033[0m\n" "$*"; }

if [[ "$(id -u)" -ne 0 ]]; then
  red "Run this as root (or via sudo)."
  exit 1
fi

blue "=== BLESSLUXE droplet bootstrap ==="
blue "Domain:    $DOMAIN"
blue "Git ref:   $GIT_REF"
blue "Install:   $INSTALL_DIR"
echo

# ─── 1. System update + essentials ────────────────────────────────────
blue "[1/8] Updating apt and installing base packages…"
export DEBIAN_FRONTEND=noninteractive
# Stop needrestart from prompting about service restarts on package installs.
export NEEDRESTART_MODE=a
export NEEDRESTART_SUSPEND=1
apt-get update -qq
apt-get install -y -qq curl ca-certificates git ufw openssl > /dev/null

# ─── 2. Docker + Compose plugin ───────────────────────────────────────
if ! command -v docker > /dev/null 2>&1; then
  blue "[2/8] Installing Docker…"
  curl -fsSL https://get.docker.com | sh > /dev/null
else
  green "[2/8] Docker already installed — skipping"
fi
systemctl enable --now docker > /dev/null

# ─── 3. Firewall ──────────────────────────────────────────────────────
blue "[3/8] Configuring firewall (allow 22, 80, 443)…"
ufw allow 22/tcp  > /dev/null
ufw allow 80/tcp  > /dev/null
ufw allow 443/tcp > /dev/null
# --force enables non-interactively. No need to pipe `yes` (that triggers
# SIGPIPE under `set -o pipefail` and silently aborts the script).
ufw --force enable > /dev/null

# ─── 4. Clone repo ────────────────────────────────────────────────────
if [[ -d "$INSTALL_DIR/.git" ]]; then
  blue "[4/8] Repo already cloned — pulling latest…"
  git -C "$INSTALL_DIR" fetch --quiet
  git -C "$INSTALL_DIR" checkout --quiet "$GIT_REF"
  git -C "$INSTALL_DIR" pull --quiet
else
  blue "[4/8] Cloning repo to $INSTALL_DIR…"
  git clone --quiet --branch "$GIT_REF" "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# ─── 5. Generate .env if absent ───────────────────────────────────────
if [[ -f .env ]]; then
  yellow "[5/8] .env already exists — leaving it alone"
else
  blue "[5/8] Generating .env from template with random secrets…"
  cp .env.production.template .env

  pgpw=$(openssl rand -hex 24)
  jwt=$(openssl rand -hex 32)
  nas=$(openssl rand -hex 32)

  sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${pgpw}|"          .env
  sed -i "s|JWT_SECRET=.*|JWT_SECRET=${jwt}|"                          .env
  sed -i "s|NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=${nas}|"                .env

  # Replace the example blessluxe.com with the real domain
  sed -i "s|blessluxe\.com|${DOMAIN}|g"                                .env
  green "    ✓ Secrets generated. Edit .env to add Stripe, OAuth, SendGrid keys later."
fi

# ─── 6. Caddyfile + compose override for HTTPS ────────────────────────
blue "[6/8] Writing Caddyfile and docker-compose.override.yml…"
cat > Caddyfile <<EOF
${DOMAIN}, www.${DOMAIN} {
  reverse_proxy storefront:3000
}

admin.${DOMAIN} {
  reverse_proxy admin:3001
}

api.${DOMAIN} {
  reverse_proxy shop:9001
}
EOF

cat > docker-compose.override.yml <<'EOF'
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - storefront
      - admin
      - shop
  # Hide internal services from the public internet —
  # only Caddy on :80/:443 is reachable.
  postgres:
    ports: []
  shop:
    ports: []
  storefront:
    ports: []
  admin:
    ports: []

volumes:
  caddy_data:
  caddy_config:
EOF

# ─── 7. Database migration (one-shot, before main `up`) ──────────────
blue "[7/8] Bringing up Postgres and running migration…"
docker compose up -d postgres
# Wait for Postgres to be healthy
for i in {1..30}; do
  if docker compose exec -T postgres pg_isready -U blessluxe > /dev/null 2>&1; then
    break
  fi
  sleep 2
done
docker compose run --rm shop \
  node --experimental-strip-types --experimental-transform-types \
  src/db/migrate.ts
green "    ✓ Schema migrated"

# ─── 8. Start everything ──────────────────────────────────────────────
blue "[8/8] Building images and starting all services…"
docker compose up -d --build

echo
green "═══════════════════════════════════════════════════════════════════"
green "  BLESSLUXE is up. 🎉"
green "═══════════════════════════════════════════════════════════════════"
echo
echo "Next steps:"
echo
echo "  1. Point DNS at this droplet's IP (A records):"
echo "       ${DOMAIN}        →  $(curl -s ifconfig.me 2>/dev/null || echo '<droplet IP>')"
echo "       www.${DOMAIN}    →  same"
echo "       admin.${DOMAIN}  →  same"
echo "       api.${DOMAIN}    →  same"
echo
echo "  2. Once DNS resolves, Caddy will fetch HTTPS certs automatically."
echo
echo "  3. Edit ${INSTALL_DIR}/.env to add (optional but recommended):"
echo "       - STRIPE_SECRET_KEY + NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
echo "       - GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (customer OAuth)"
echo "       - GOOGLE_AI_API_KEY (for AI agent)"
echo "       - SENDGRID_API_KEY + SENDGRID_FROM (for transactional emails)"
echo
echo "     After editing .env, restart with:"
echo "       cd ${INSTALL_DIR} && docker compose up -d --build"
echo
echo "  4. Check service health:"
echo "       docker compose ps                # all should say (healthy)"
echo "       docker compose logs --tail 30 shop"
echo "       curl -s https://api.${DOMAIN}/health"
echo
echo "  5. Default admin login (change immediately):"
echo "       Visit:    https://admin.${DOMAIN}/login"
echo "       Email:    admin@blessluxe.com"
echo "       Password: admin123"
echo
