# BLESSLUXE

> Luxury fashion e-commerce platform (Women, Men, Children, Sale) with an AI-powered personal shopping assistant, package tracking, affiliate marketing, and content management.

Built with **Next.js 14**, a custom **Express.js commerce backend**, and **Google Gemini** — structured as a Turborepo monorepo with **Docker Compose** for local dev and a single-droplet **Caddy + cron auto-deploy** stack for production.

---

## Quick start (local dev)

```bash
pnpm install
docker compose up -d postgres        # start Postgres only
pnpm shop:seed                       # schema + sample data + default admin
pnpm dev                             # runs all three apps in parallel
```

| App        | URL                       | Default credentials |
|------------|---------------------------|---------------------|
| Storefront | http://localhost:3000     | sign up / Google OAuth |
| Admin      | http://localhost:3001     | `admin@blessluxe.com` / `admin123` |
| Shop API   | http://localhost:9001     | — (`/health` for sanity) |

> Change the default admin password immediately in any non-local deployment.

## Full Docker setup (single-host)

```bash
cp .env.docker .env
docker compose up --build -d
docker compose exec shop node --experimental-strip-types --experimental-transform-types src/db/seed.ts
```

---

## Features

### Catalogue
- Configurable navigation: **Heading → Catalogue → Product → Variant**
- Per-currency pricing (USD, GBP, EUR, ZAR) with scheduled sale windows
- Variant matrix with **cost price + live margin calculator** (markup % or fixed profit), feeding into finance reports
- Bulk product/catalogue assignment, product tags, drag-to-reorder headings

### Shopping experience
- **Search overlay** in the header — full-text on title + description + handle + product tags (`/shop?q=…`)
- **Faceted filters** by size, colour, price range, category
- Hero carousel powered by **admin-managed announcements** (image / GIF / video, scheduled with start/end dates)
- Wishlist, recently-viewed, related products
- Stripe-powered checkout (with a simulator mode for development) and a comprehensive 7-step package timeline

### Customer accounts (`/account`)
- Profile + addresses, multi-step OAuth (Google) and password login
- **Bits loyalty wallet** — earn on purchases and on approved reviews (configurable reward amount in admin)
- **Tracking tab** — list of packages with QR-code-scannable tracking URLs (`/track/<code>`)
- Invoices, support tickets, social wall, affiliate dashboard, inbox

### Package tracking (`shop_package`)
- Auto-created on every order with a unique Crockford-Base32 + Luhn-checksum code (`BL-XXXX-XXXX-X`)
- 7-stage status flow with admin "Advance Status" + arbitrary "Add Status Event"
- For **packs** (multi-customer collections), each item gets a sub-code that only the slot owner can claim; admin override at the collection point verifies the customer's identity before claiming

### Admin (`/admin`)
- **Catalogue** — Headings, Catalogues, Products (with images, options, variants, tags), Inventory (with receive/cost tracking), Packs
- **Operations** — Packages (list, detail with timeline, sub-code verification)
- **Content** — Announcements (image/video/gif carousel), FAQ (categorised CRUD)
- **Commercial** — Campaigns, Finance (revenue / cost / gross profit / margin %)
- **Audience** — Customers, Reviews (with Bits-on-approve), Affiliates
- **Settings** — Regions, country allow-list, currency root + exchange rates
- Themed Cormorant Garamond + gold UI matching the storefront, with luxury modal dialogs replacing native browser alerts/prompts

### Other modules
- **Reviews** — verified-purchase rating + content + admin response, optional Bits reward on approval
- **Affiliates** — codes, commission rates, sales tracking, payout queue, AI photoshoot generation
- **Customer loyalty** — points, tiers (Bronze/Silver/Gold), referral codes
- **AI shopping agent** — Gemini-powered chat widget with voice (`/api/agent/llm`)

---

## Architecture

```
                              ┌───────────────────────────┐
                              │  Postgres (pgvector)      │
                              │  all shop_* tables        │
                              └────────────▲──────────────┘
                                           │ DATABASE_URL
                                           │
┌────────────────────────┐    HTTPS   ┌────┴─────────────────┐
│  Storefront (Next 14)  │ ─────────▶ │  Shop API (Express)  │
│  apps/storefront :3000 │            │  backend/shop  :9001 │
└──────▲─────────────────┘            └──────────────────────┘
       │                                         ▲
       │ HTTPS (browser)                         │ HTTPS (browser)
       │                                         │
       │              ┌──────────────────────────┘
       │              │
       │      ┌───────┴─────────────┐
       │      │  Admin (Next 14)    │
       │      │  apps/admin  :3001  │
       │      └─────────────────────┘
       │
       │  in production, all three apps live behind:
  ┌────┴───────────────────────────────────────────────┐
  │  Caddy reverse proxy (auto Let's Encrypt) :80/443  │
  │    blessluxe.com         →  storefront             │
  │    admin.blessluxe.com   →  admin                  │
  │    api.blessluxe.com     →  shop                   │
  └────────────────────────────────────────────────────┘
```

In dev, the storefront's server-side fetches use `SHOP_BACKEND_INTERNAL_URL` (e.g. `http://shop:9001`) to stay inside the Docker network; the browser hits the public URL.

---

## Monorepo layout

```
apps/
  storefront/                Customer-facing Next.js (App Router) :3000
  admin/                     Admin dashboard Next.js              :3001
backend/
  shop/                      Express commerce backend             :9001
    src/db/schema.sql        Idempotent CREATE IF NOT EXISTS schema
    src/db/seed.ts           Default admin + sample products
    src/db/migrate.ts        Runs schema.sql + seeds FAQs/countries
    src/routes/              Per-resource Express routers
packages/
  ui/                        Shared React components
  config/                    Tailwind + tsconfig presets
  types/                     Shared TypeScript domain types
scripts/
  cron-deploy.sh             Production: poll origin/master, rebuild on change
setup.sh                     One-shot droplet bootstrap
docker-compose.yml           postgres + shop + storefront + admin
docker-compose.override.yml  (production-only) adds Caddy, hides ports
Caddyfile                    (production-only) HTTPS routing
.do/app.yaml                 (optional) DigitalOcean App Platform spec
```

---

## Environment variables

Copy `.env.docker` (dev) or `.env.production.template` (prod) to `.env` and edit.

### Required

| Variable | Description |
|----------|-------------|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Postgres credentials |
| `JWT_SECRET` | Shop backend admin auth signing key (`openssl rand -hex 32`) |
| `NEXTAUTH_SECRET` | Storefront customer session signing key |
| `NEXTAUTH_URL` | Storefront public URL (used by NextAuth) |
| `NEXT_PUBLIC_COMMERCE_BACKEND` | URL the storefront **browser** uses to reach shop |
| `NEXT_PUBLIC_SHOP_BACKEND` | URL the admin **browser** uses to reach shop |
| `SHOP_BACKEND_INTERNAL_URL` | URL the storefront **server** uses (e.g. `http://shop:9001`) |
| `STORE_CORS`, `ADMIN_CORS` | CORS allow-lists |

### Recommended

| Variable | Description |
|----------|-------------|
| `GOOGLE_AI_API_KEY` (+ `NEXT_PUBLIC_GOOGLE_AI_API_KEY`) | Gemini for the AI shopping agent |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth for customer sign-in |
| `SENDGRID_API_KEY` (+ `SENDGRID_FROM`) **or** `SMTP_*` | Transactional email |
| `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Real card payments (set `NEXT_PUBLIC_PAYMENT_GATEWAY_SIMULATE=0`) |

### Optional

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_STORAGE_BUCKET` | Affiliate media storage |
| `ELEVENLABS_VOICE_ID` | TTS for the AI agent |
| `ADMIN_DASHBOARD_KEY` / `ADMIN_EMAILS` | Extra gate on `/admin` |

See [`.env.production.template`](.env.production.template) for every variable the apps actually look for, with REQUIRED / RECOMMENDED / OPTIONAL labels.

---

## Production deployment (DigitalOcean droplet)

Single-droplet pattern with Caddy for HTTPS termination and cron polling for auto-deploys.

### One-shot bootstrap

On a fresh **Ubuntu 22.04+ droplet** (4 GB RAM minimum, 8 GB recommended):

```bash
curl -fsSL https://raw.githubusercontent.com/gregoryshoniwa/blessluxe/master/setup.sh \
  | bash -s -- yourdomain.com
```

[`setup.sh`](setup.sh) installs Docker, configures UFW (22/80/443 only), clones the repo to `/opt/blessluxe`, generates `.env` with random secrets, writes a Caddyfile + compose override that hides the internal ports, runs the schema migration, builds the three images, and starts everything. Idempotent — safe to re-run.

### DNS

Point four A records at the droplet IP:

| Host | Type | Value |
|---|---|---|
| `@` | A | `<droplet-ip>` |
| `www` | A | `<droplet-ip>` |
| `admin` | A | `<droplet-ip>` |
| `api` | A | `<droplet-ip>` |

Caddy issues Let's Encrypt certs automatically on first request.

### Auto-deploy from `master`

A cron job on the droplet polls `origin/master` every 2 minutes. New commits trigger:

1. `git reset --hard origin/master`
2. `docker compose up -d postgres` + `pg_isready` wait
3. Schema migration (idempotent)
4. `docker compose build` (only changed images rebuild thanks to layer caching)
5. `docker compose up -d --remove-orphans`
6. `docker image prune` for layers >72 h old
7. Curl `https://api.<domain>/health` and confirm 200

A `flock` guard prevents overlapping runs when a long build outruns the 2-minute interval. All output appends to `/var/log/blessluxe-deploy.log`.

Install / manage the cron:

```bash
# install (once)
ssh root@<ip> "(crontab -l 2>/dev/null | grep -v cron-deploy.sh ; \
  echo '*/2 * * * * /root/blessluxe/scripts/cron-deploy.sh >> /var/log/blessluxe-deploy.log 2>&1') | crontab -"

# tail live
ssh root@<ip> 'tail -f /var/log/blessluxe-deploy.log'

# force immediate deploy (skip the wait)
ssh root@<ip> '/root/blessluxe/scripts/cron-deploy.sh'

# pause / resume
ssh root@<ip> 'crontab -l | grep -v cron-deploy.sh | crontab -'
```

See [`scripts/cron-deploy.sh`](scripts/cron-deploy.sh) for the full script.

---

## Auth & user populations

The shop backend manages three distinct user populations:

- **Admin users** (`shop_user`) — sign in to `/admin` via `/auth/login`. JWT-protected, 24 h TTL.
- **Customers** (`shop_customer`) — storefront end-users with `loyalty_points`, `loyalty_tier`, `referral_code`. Signup via email/password or Google OAuth (handled by NextAuth on storefront side, mirrored into `shop_customer` via `/auth/customer/oauth`).
- **Affiliates** (`shop_affiliate`) — customers who've also been approved as affiliates; linked back to a `customer_id`.

---

## Custom modules

| Module | Tables | Storefront | Admin |
|---|---|---|---|
| **Reviews** | `shop_product_review` | `/store/reviews` POST + read | `/reviews` moderation + Bits reward |
| **Affiliates** | `shop_affiliate`, `shop_affiliate_sale`, `shop_affiliate_payout` | `/account?tab=affiliate` | `/affiliates` |
| **Loyalty** | `shop_customer.loyalty_points` / `loyalty_tier` | `/account?tab=blits` | `/customers/:id` loyalty adjust |
| **Packages** | `shop_package`, `shop_package_item`, `shop_package_event` | `/track/<code>`, `/account?tab=tracking` | `/packages` with status timeline |
| **FAQ** | `shop_faq` | `/faq` | `/faq` |
| **Announcements** | `shop_announcement` | hero carousel on `/` | `/announcements` |
| **Settings** | `shop_setting` | (none — public read at `/store/settings/public`) | review reward UI in `/reviews` |

---

## Common workflows

```bash
# Reset the database (drops all shop_* data)
docker compose down
docker volume rm blessluxe_postgres_data
docker compose up -d postgres
pnpm shop:seed

# Run schema migrations after editing schema.sql
pnpm shop:migrate
# Or against the droplet:
ssh root@<ip> 'cd /root/blessluxe && docker compose exec -T shop \
  node --experimental-strip-types --experimental-transform-types src/db/migrate.ts'

# Rebuild a single service
docker compose up --build -d shop
docker compose up --build -d storefront
docker compose up --build -d admin

# Tail logs
docker compose logs -f shop
```

---

## Troubleshooting

**Storefront shows no products** — confirm the shop backend is up (`curl http://localhost:9001/health`) and the database is seeded (`pnpm shop:seed`). On the droplet, check `/var/log/blessluxe-deploy.log` for the last successful deploy.

**Admin login fails** — `JWT_SECRET` likely changed between when the cached token was issued and the running backend. Clear localStorage in the admin tab and sign in again.

**Broken images** — the shop backend serves uploads from `/uploads/...`. Ensure `NEXT_PUBLIC_COMMERCE_BACKEND` matches the URL the browser can actually reach (e.g. `https://api.blessluxe.com` in production, **not** `http://shop:9001` which only resolves inside Docker).

**Server-side fetch returns ECONNREFUSED** — Next.js server components and `/api/*` routes inside the storefront container can't reach `localhost:9001` (that's the storefront itself). They use `SHOP_BACKEND_INTERNAL_URL` instead — make sure it's set to `http://shop:9001` in production.

**HTTPS certs not issued** — Caddy needs the DNS records to actually resolve to the droplet before Let's Encrypt will sign a cert. Check `dig +short yourdomain.com` resolves, then `docker compose logs caddy --tail 30`.

**Schema changes** — edit `backend/shop/src/db/schema.sql`, push to `master`, the cron picks it up within 2 minutes. The schema uses `CREATE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, so re-running is always safe.

---

## License

Proprietary.
