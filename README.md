# BLESSLUXE

> Luxury fashion e-commerce platform (Women, Men, Children, Sale) with an AI-powered personal shopping assistant.

Built with **Next.js 14**, **Medusa.js v2**, and **Google Gemini** — structured as a Turborepo monorepo.

---

## Table of Contents

- [Quick Start (Local Development)](#quick-start-local-development)
- [Docker Deployment (Full Stack)](#docker-deployment-full-stack)
- [Rebuild Quick Reference](#rebuild-quick-reference)
- [Post-Setup: Admin User & Seed Data](#post-setup-admin-user--seed-data)
- [Environment Variables Reference](#environment-variables-reference)
- [Project Structure](#project-structure)
- [AI Shopping Assistant (LUXE)](#ai-shopping-assistant-luxe)
- [Commerce Admin (Affiliates & Blits)](#commerce-admin-affiliates--blits)
- [Transactional email](#transactional-email-smtp--sendgrid)
- [Wholesale group packs (Packs)](#wholesale-group-packs-packs)
  - [Early-bird Blits per campaign](#early-bird-blits-per-campaign)
- [Backend](#backend)
- [Commands](#commands)
- [Tech Stack](#tech-stack)
- [Troubleshooting](#troubleshooting)

---

## Quick Start (Local Development)

Run PostgreSQL + Redis in Docker, and the apps on your host machine.

### Prerequisites

- Node.js >= 20
- pnpm 9.x (`corepack enable && corepack prepare pnpm@9.12.3`)
- Docker & Docker Compose

### 1. Start infrastructure

```bash
docker compose up -d postgres redis
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Set up the backend

```bash
cp backend/medusa/.env.template backend/medusa/.env
# Edit .env — the defaults work for local dev

pnpm --filter @blessluxe/backend db:migrate
pnpm --filter @blessluxe/backend exec medusa user -e admin@blessluxe.com -p admin123
pnpm --filter @blessluxe/backend seed
```

### 4. Set up the storefront

```bash
cat > apps/storefront/.env.local <<'EOF'
NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=
NEXT_PUBLIC_GOOGLE_AI_API_KEY=
NEXT_PUBLIC_AI_AGENT_PROVIDER=google
NEXT_PUBLIC_AI_AGENT_MODEL=gemini-2.5-flash
NEXT_PUBLIC_AI_MEMORY_ENABLED=true
NEXT_PUBLIC_AI_VOICE_ENABLED=true
NEXT_PUBLIC_VOICE_STT_PROVIDER=browser
NEXT_PUBLIC_VOICE_TTS_PROVIDER=browser
EOF

# Add your NEXT_PUBLIC_GOOGLE_AI_API_KEY (get one at https://aistudio.google.com/apikey)
# Add your NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY (create in Medusa Admin > Settings > API Key Management)
```

### 5. Run everything

```bash
pnpm dev
```

| App | URL |
|---|---|
| Storefront | http://localhost:3000 |
| **Commerce admin** (affiliates, Blits, disputes, social moderation) | http://localhost:3000/affiliate/admin |
| Medusa Admin | http://localhost:9000/app |
| Medusa API | http://localhost:9000 |

Medusa admin login: `admin@blessluxe.com` / `admin123`  
Commerce admin: set `ADMIN_DASHBOARD_KEY` or `ADMIN_EMAILS`, then open `/affiliate/admin` (see [Commerce Admin](#commerce-admin-affiliates--blits)).

---

## Docker Deployment (Full Stack)

Build and run the entire stack (PostgreSQL, Redis, Medusa, Storefront) in containers.

### 1. Create your environment file

```bash
cp .env.docker .env
```

Edit `.env` and fill in the **required** values:

| Variable | Required | Description |
|---|---|---|
| `MEDUSA_PUBLISHABLE_KEY` | Yes | Storefront API key (created after first setup, see step 3) |
| `GOOGLE_AI_API_KEY` | Yes | Google Gemini API key from [AI Studio](https://aistudio.google.com/apikey) |
| `SUPABASE_URL` | Recommended | Supabase project URL for affiliate media uploads |
| `SUPABASE_SERVICE_ROLE_KEY` | Recommended | Server-side key for secure Supabase Storage uploads |
| `SUPABASE_STORAGE_BUCKET` | Recommended | Public storage bucket name (e.g. `affiliate-media`) |
| `JWT_SECRET` | Prod | Change from default for production |
| `COOKIE_SECRET` | Prod | Change from default for production |
| `COOKIE_SECURE` | Prod | Set to `true` when behind HTTPS |

### 2. Build and start

```bash
docker compose up --build -d
```

Medusa migrations now run automatically during container startup, so you don't need a separate first-run `db:migrate` command.

This starts 4 services:

| Service | Port | Description |
|---|---|---|
| `postgres` | 5432 | PostgreSQL 16 with pgvector |
| `redis` | 6379 | Redis 7 |
| `medusa` | 9000 | Medusa backend + admin dashboard |
| `storefront` | 3000 | Next.js customer storefront |

### 3. First-time setup (admin user, seed data)

After the containers are running for the first time:

```bash
# Create the admin user
docker compose exec medusa npx medusa user -e admin@blessluxe.com -p admin123

# Seed products, categories, regions, and pricing
docker compose exec medusa npx medusa exec ./src/scripts/seed.ts
```

### 4. Create a publishable API key

1. Open http://localhost:9000/app and log in with `admin@blessluxe.com` / `admin123`
2. Go to **Settings > API Key Management > Publishable API Keys**
3. Create a new key and copy it
4. Link the key to your sales channels (Default Sales Channel, BLESSLUXE Online Store)
5. Paste the key into your `.env` file as `MEDUSA_PUBLISHABLE_KEY`
6. Rebuild the storefront so the key is baked in:

```bash
docker compose up --build -d storefront
```

### Stopping and starting

```bash
docker compose down          # Stop all services (data persists in volumes)
docker compose up -d         # Start again (no rebuild needed)
docker compose down -v       # Stop and DELETE all data (fresh start)
```

### Rebuilding after code changes

```bash
docker compose up --build -d            # Rebuild everything
docker compose up --build -d medusa     # Rebuild only Medusa
docker compose up --build -d storefront # Rebuild only storefront
```

---

## Rebuild Quick Reference

Use these commands when you change code or environment values:

```bash
docker compose up --build -d            # Full stack rebuild
docker compose up --build -d storefront # Frontend-only rebuild
docker compose up --build -d medusa     # Backend-only rebuild
docker compose up --build -d --no-deps storefront # Fast storefront rebuild only
```

Convenience wrappers (from repo root):

```bash
pnpm dev:refresh-seed     # Rebuild medusa + rerun seed
pnpm dev:refresh-catalog  # Rebuild medusa + rerun seed + rebuild storefront
pnpm dev:refresh-inventory # Rebuild medusa + seed + inventory backfill + storefront rebuild
```

### Easy development refresh (catalog + images)

Use this when you want fresh catalog data with one flow (safe to run repeatedly):

```bash
# 1) Rebuild Medusa only (picks up seed script changes)
docker compose up --build -d --no-deps medusa

# 2) Rerun seed (categories, products, prices, tags, metadata, women image backfill)
docker compose exec medusa npx medusa exec ./src/scripts/seed.ts

# 3) Rebuild storefront if UI/env changed
docker compose up --build -d --no-deps storefront
```

Or use one command:

```bash
pnpm dev:refresh-catalog
```

Common cases:
- Updated `apps/storefront/.env.local` or root `.env` AI/public vars -> rebuild `storefront`
- Updated backend providers/modules/scripts -> rebuild `medusa`
- Updated shared packages/config used by both -> rebuild full stack

---

## Post-Setup: Admin User & Seed Data

For Docker, migrations run automatically when the `medusa` container starts.

### Create admin user

```bash
# Local
pnpm --filter @blessluxe/backend exec medusa user -e admin@blessluxe.com -p admin123

# Docker
docker compose exec medusa npx medusa user -e admin@blessluxe.com -p admin123
```

### Seed data

The seed script creates:

- **Store**: BLESSLUXE with USD, GBP, EUR, ZAR currencies
- **4 Regions**: United States, United Kingdom, Europe, South Africa
- **Audience-based category structure**: Women, Men, Children (+ branch-specific accessories/shoes/bags)
- **Core + supplemental test products** across women, men, and children with multi-currency pricing
- **Trending metadata defaults** for catalog badges/social-proof blocks
- **Women catalog thumbnail sync** for legacy products (real fashion photos, idempotent backfill)

Current seed behavior also includes:
- Tag normalization for merchandising badges (`hot`, `sale`, `trending`, `new`, `bestseller`)
- Supplemental catalog expansion for broad category coverage (women/men/children branches)
- Editorial image URL normalization for Unsplash assets (`w=1200`, `auto=format`, `fit=crop`, `q=80`)
- Optional **sample wholesale pack definition** (handle suffix `-wholesale-pack`) when the pack module tables exist after migrations

```bash
# Local
pnpm --filter @blessluxe/backend seed

# Docker
docker compose exec medusa npx medusa exec ./src/scripts/seed.ts
```

The seed script is idempotent — safe to run multiple times.

### Inventory backfill (low-stock visibility)

If Medusa products are present but variant inventory levels are empty (for example all variants show `0`), run:

```bash
pnpm inventory:backfill-medusa
```

This command is idempotent and will:
- ensure a stock location exists (`sl_main_warehouse`)
- link sales channels to that location
- enable `manage_inventory` on variants
- create missing inventory items and variant-to-inventory links
- create inventory levels with starter quantities (includes low-stock examples like `2` and `3`)

Tip: if you only changed `backend/medusa/src/scripts/seed.ts`, rebuild just Medusa before rerunning seed:

```bash
docker compose up --build -d --no-deps medusa
docker compose exec medusa npx medusa exec ./src/scripts/seed.ts
```

Equivalent shortcut:

```bash
pnpm dev:refresh-seed
```

---

## Transactional email (SMTP / SendGrid)

Pack notifications, the AI **`send_email`** tool, and related flows use **`apps/storefront/src/lib/send-email-server.ts`** (Nodemailer over SMTP or SendGrid’s HTTP API). Medusa order notifications use the same SMTP variables when the SMTP notification provider is enabled.

| Topic | What to do |
|--------|------------|
| **Local `pnpm dev`** | Set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (and optional `REPLY_TO_EMAIL`) in **`apps/storefront/.env.local`** and/or the **repo root `.env`**. The storefront `next.config.js` also loads **`backend/medusa/.env`** so SMTP can live next to Medusa. |
| **Docker Compose** | Services only get variables from **`docker-compose.yml`**, filled from the **project root `.env`**. **`apps/storefront/.env.local` is not mounted into the container** — duplicate `SMTP_*` into root `.env`, then run `docker compose up -d --force-recreate medusa storefront`. |
| **Provider preference** | If both SMTP and SendGrid keys exist, **SMTP is used by default** (matches typical Nodemailer setups). Set **`STOREFRONT_EMAIL_PROVIDER=sendgrid`** to force SendGrid for the storefront mailer. |
| **Gmail** | Use an **App Password**, not your normal Google password. `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false` is typical. |
| **Smoke test** | While signed in: **`POST /api/account/test-email`** (empty body) sends a test to your account email. |

**Collection code link (customers):** After payment, emails can point to **`/pack-collection/<CODE>`** — a themed page that shows the code, pack title, size, and status. The JSON API remains at **`GET /api/pack-collection/<CODE>`** for integrations.

---

## Environment Variables Reference

### Medusa Backend

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | (set by compose) | PostgreSQL connection string |
| `REDIS_URL` | (set by compose) | Redis connection string |
| `JWT_SECRET` | `supersecret-jwt-...` | JWT signing secret |
| `COOKIE_SECRET` | `supersecret-cookie-...` | Session cookie secret |
| `COOKIE_SECURE` | `false` | Set `true` for HTTPS deployments |
| `STORE_CORS` | `http://localhost:3000` | Allowed storefront origins |
| `ADMIN_CORS` | `http://localhost:9000` | Allowed admin origins |
| `AUTH_CORS` | `http://localhost:3000,...` | Allowed auth origins |
| `STRIPE_API_KEY` | — | Stripe secret key (optional) |
| `PAYSTACK_SECRET_KEY` | — | Paystack secret key (optional) |
| `FLUTTERWAVE_SECRET_KEY` | — | Flutterwave secret key (optional) |

### Storefront

| Variable | Default | Description |
|---|---|---|
| `GOOGLE_AI_API_KEY` | — | Gemini API key for server-side AI routes (Docker/runtime) |
| `NEXT_PUBLIC_MEDUSA_BACKEND_URL` | `http://localhost:9000` | Medusa API URL (browser-accessible) |
| `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` | — | Publishable API key from Medusa admin |
| `NEXT_PUBLIC_GOOGLE_AI_API_KEY` | — | Gemini API key for AI chat |
| `DATABASE_URL` or `AI_DATABASE_URL` | (often same DB as Medusa) | Storefront Postgres: AI memory, affiliates, Blits, customer sessions. `AI_DATABASE_URL` is preferred if both are set. |
| `GOOGLE_CLIENT_ID` | — | Google OAuth client id for account login |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth client secret for account login |
| `NEXTAUTH_SECRET` | `change-me...` | Session signing secret for NextAuth |
| `NEXTAUTH_URL` | `http://localhost:3000` | Public storefront URL for auth callbacks |
| `ADMIN_DASHBOARD_KEY` | — | Shared key for protecting commerce admin (`/affiliate/admin`) |
| `ADMIN_EMAILS` | — | Comma-separated admin emails (alternative to key) |
| `SUPABASE_URL` | — | Supabase project URL for affiliate media storage |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Supabase service role key (server-side upload auth) |
| `SUPABASE_STORAGE_BUCKET` | `affiliate-media` | Supabase public bucket used for affiliate uploads |
| `GOOGLE_NANO_BANANA_MODEL` | `gemini-3.1-flash-image-preview` | Optional model override for affiliate AI photoshoot route |
| `SENDGRID_API_KEY` / `SENDGRID_FROM` | — | Transactional email (AI agent, account, **pack notifications**). Same convention as Medusa. |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | — | Nodemailer / SMTP (preferred when set; see [Transactional email](#transactional-email-smtp--sendgrid)). |
| `STOREFRONT_EMAIL_PROVIDER` | — | `smtp` or `sendgrid` to force one provider when both are configured. |
| `REPLY_TO_EMAIL` | `info@blessluxe.com` (default) | Reply-To for pack and other transactional mail when using defaults. |

### Where to get Google and admin keys

#### Google OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create/select a project.
3. Go to **APIs & Services > OAuth consent screen** and configure the app (External/Internal, app name, support email).
4. Go to **APIs & Services > Credentials > Create Credentials > OAuth client ID**.
5. Choose **Web application** and set:
   - **Authorized JavaScript origins**:
     - `http://localhost:3000` (local)
     - your production storefront URL (when deployed)
   - **Authorized redirect URIs**:
     - `http://localhost:3000/api/auth/callback/google` (local)
     - `https://your-domain.com/api/auth/callback/google` (production)
6. Copy the generated Client ID and Client Secret into:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

#### NextAuth secret (`NEXTAUTH_SECRET`)

Generate a strong random secret:

```bash
openssl rand -base64 32
```

Paste output into `NEXTAUTH_SECRET`.

#### Admin dashboard key (`ADMIN_DASHBOARD_KEY`)

Generate a strong admin key:

```bash
openssl rand -hex 32
```

Paste output into `ADMIN_DASHBOARD_KEY`.  
Use this key on `/affiliate/admin/auth`.

#### Admin email allowlist (`ADMIN_EMAILS`)

Alternative to dashboard key: set trusted emails as comma-separated values, for example:

```env
ADMIN_EMAILS=owner@blessluxe.com,ops@blessluxe.com
```

If `ADMIN_EMAILS` is used, users must first login on `/account` with one of these emails before opening `/affiliate/admin`.

#### Supabase storage keys (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`)

1. Create a project at [Supabase](https://supabase.com/).
2. Go to **Project Settings > API** and copy:
   - `SUPABASE_URL` (Project URL)
   - `SUPABASE_SERVICE_ROLE_KEY` (service_role key, server-side only)
3. Go to **Storage** and create a bucket (example: `affiliate-media`).
4. Set bucket to public for direct image rendering in storefront pages.
5. Add bucket name to `SUPABASE_STORAGE_BUCKET`.

---

## Project Structure

```
apps/
  storefront/      Next.js 14 — customer-facing store (:3000)
  admin/           Next.js 14 — admin dashboard (:3001)
backend/
  medusa/          Medusa.js v2 — headless commerce API (:9000)
packages/
  ui/              Shared React components
  config/          Shared Tailwind & TSConfig
  types/           Shared TypeScript types
  eslint-config/   Shared ESLint config
  prettier-config/ Shared Prettier config
```

---

## AI Shopping Assistant (LUXE)

The storefront includes a floating chat widget (**LUXE**) powered by **Google Gemini**. Answers about **what we sell** are grounded in the **live Medusa catalog** and storefront navigation (Women, Men, Children, Sale)—the model is instructed not to assume the store is women-only.

### Text chat
- Open the sparkle button (bottom-right). LUXE can **start the conversation** with a greeting (opening turn via `/api/agent` with `opening: true`).
- Messages go to **Gemini** (e.g. `gemini-2.5-flash`) through **`POST /api/agent`**, with tool calling for search, cart, email, etc.
- **Signed-in customers** get account context (name, preferences, history) from the session cookie; guests are assisted without pretending to know private details.
- Chat history can be loaded from the server for logged-in users; optional vector **RAG** uses PostgreSQL + **pgvector** and embeddings.

### Voice (Gemini Live)
- Enable voice in the chat header, then use the **microphone** in the input bar for **speech-to-speech** (Gemini Live WebSocket, native audio preview model).
- After connect, LUXE sends a **proactive first turn** so the assistant speaks before the customer when the thread is still empty (with retries if a text opening is still loading).
- Type and voice can be used in the same session; the input field refocuses after sending.

### AI memory & RAG

- Conversation persistence and **semantic memory** (per customer when logged in) use the storefront database and pgvector where configured.
- **Interaction tracking** supports personalization and analytics.

---

## Backend

### Custom Modules

| Module | Description |
|---|---|
| `affiliate` | Affiliate codes, commission tracking, payout processing |
| `customer-extended` | Loyalty points/tiers, style preferences, size profiles |
| `product-review` | Customer reviews with ratings and moderation |
| `pack` | Wholesale pack definitions and campaign/slot models (Medusa module; storefront orchestrates campaigns against shared DB tables) |

### Payment Providers

- **Stripe** (built-in) — set `STRIPE_API_KEY`
- **Paystack** (custom) — set `PAYSTACK_SECRET_KEY`
- **Flutterwave** (custom) — set `FLUTTERWAVE_SECRET_KEY`

All providers load conditionally based on environment variables.

### Notification Providers

- **SendGrid** (built-in) — set `SENDGRID_API_KEY`
- **SMTP** (custom — Gmail, Mailgun, SES, etc.) — set `SMTP_HOST`

### File Storage

- **Supabase Storage** (recommended) — set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`

---

## Affiliate Social Commerce

**Commission attribution (storefront checkout):** Commission is calculated **only on cart lines** that were added from an affiliate social shop (`/affiliate/shop/[code]`). Those lines store `affiliateCode` in the cart; main-shop adds have no code. The **`affiliate_commission_ref`** cookie is read at checkout: when it **matches** the affiliate code on attributed lines, that sale uses the **own-shop rate (5%)** (`AFFILIATE_OWN_PAGE_COMMISSION_PERCENT` in `affiliate-attribution.ts`). If the cookie is missing or doesn’t match (e.g. customer browsed main `/shop` first), attributed lines still earn commission at the affiliate’s **profile rate** (often 10%). Shipping is excluded from the commission base. Admins see `attribution_source` and `commission_rate_percent_used` in sale metadata.

Affiliate social shop now supports:
- Direct image upload for catalog posts and selfies (`/api/affiliate/social/upload`)
- AI photoshoot generation route with saved media metadata (`/api/affiliate/social/photoshoot`)
- Post creation/edit/delete by affiliate owner from dashboard
- Publish/unpublish media to control what appears in the public `Photos` tab
- **Blits photo gifts** — logged-in customers send gifts from the gallery using configured gift types (`/api/blits/gift`, wallet `GET /api/blits/wallet`)
- Storage priority: Supabase -> local fallback (so uploads keep working)

---

## Commerce Admin (Affiliates & Blits)

The storefront exposes a **Commerce admin** UI for operations that live in the storefront Postgres (not Medusa admin).

| | |
|---|---|
| **URL** | `/affiliate/admin` (e.g. `http://localhost:3000/affiliate/admin`) |
| **Sign-in** | `/affiliate/admin/auth` — use **`ADMIN_DASHBOARD_KEY`**, or rely on **`ADMIN_EMAILS`** and log in as a matching customer on `/account` first |

**Tabs:** Affiliates, Sales & commission, Payouts, Disputes, Messages, **Blits & gifts** (rates, purchase-tier JSON, gift types, recent photo gifts), **Pack loyalty** (pack points + Blits redemption settings; **early-bird Blits** per campaign id; admin close by campaign id), Social moderation.

**Blits (virtual currency)** — settings and tables are managed in the storefront app (`apps/storefront/src/lib/blits.ts`). Customers can:

- **Checkout:** logged-in users see **Pay with Blits** on the payment step (hidden when the cart includes wallet top-up lines); the order applies the configured **loyalty discount %** on product subtotal, then charges Blits at **USD → Blits per $1** (`POST /api/blits/checkout-pay`).
- **Photo gifts** on affiliate shop galleries (see above).
- **Top-ups:** from **Account → Blits**, customers add a wallet line to the cart and complete **card / mobile / bank** checkout; Blits credit runs after payment via `POST /api/blits/credit-from-checkout` (replace with your payment-provider webhook in production if you process charges server-side).

Public read-only config for the storefront UI: `GET /api/blits/public`.

---

## Wholesale group packs (Packs)

Group wholesale packs let customers **split a product by size** on an affiliate’s shop: each buyer pays for one variant; when every size is paid, the campaign is **ready to process**. On the **main shop**, published packs are listed at **`/shop/packs`** and link to the Medusa product PDP for **full-pack (all variants) checkout**.

| Area | What’s implemented |
|------|-------------------|
| **Medusa** | Custom **`pack`** module (`backend/medusa/src/modules/pack/`) with migrations; seed can create a sample `pack_definition` (see seed script). |
| **Storefront data** | Pack definitions and campaigns live in the **same Postgres** the storefront uses (`apps/storefront/src/lib/packs.ts` and related APIs). Run **`pnpm --filter @blessluxe/backend db:migrate`** so pack tables exist before relying on pack APIs. |
| **Affiliate** | Dashboard tab **Packs**: start a campaign, copy share link, open pack page, configure **early-bird Blits** (deadline + prize per campaign), **cancel / reject** a pack (participants emailed; paid slots credited as **Blits** when line totals were stored at checkout). |
| **Customer** | **`/account` → Packs**: participations; **pack loyalty** balance and **redeem points → Blits**. Pack page: progress, **Buy** / **Reserve**, **leave** (loyalty penalty; paid slots can receive **Blits** credit). **Collection code page** **`/pack-collection/[code]`**: themed verification of code, pack title, size, and link back to the live pack when applicable. |
| **Commerce admin** | **`/affiliate/admin`**: **Pack loyalty** (starting/max points, leave penalty, completion bonus, Blits per loyalty point); **early-bird Blits** for a campaign id (see below); **close pack by campaign id** (cancel/reject, same Blits refund rules as affiliate). |
| **Orders** | Line items carry `pack_campaign_id`, `pack_slot_id`, `storefront_customer_id` in metadata. **`POST /api/affiliate/webhook/order-completion`** updates slots, completion loyalty, pack emails, and stores **`line_paid_usd`** for refunds when the webhook includes line totals. |
| **Email** | Pack notifications use the same **`sendTransactionalEmail`** pipeline as the AI agent (`apps/storefront/src/lib/send-email-server.ts`). Configure **SMTP** (recommended for Nodemailer) or **SendGrid**. See **[Transactional email](#transactional-email-smtp--sendgrid)** — especially **Docker** vs **`.env.local`**. Verification links in emails use **`/pack-collection/<code>`** (human-friendly page); **`GET /api/pack-collection/<code>`** returns JSON for integrations. |

### Early-bird Blits per campaign

Each **pack campaign** (not the pack definition/catalog product) can offer a **time-limited Blits bonus**: customers who **complete payment on or before** the configured deadline earn the configured **Blits** amount; payments **after** the deadline still complete the pack but **do not** receive that gift. Eligibility is enforced **on the server** when the order webhook runs (using order timestamps in UTC), not from the shopper’s browser clock alone.

**Database:** `pack_campaign.gift_countdown_ends_at` (timestamptz) and `gift_blits_prize` (integer). Apply Medusa migrations so these columns exist:

```bash
pnpm --filter @blessluxe/backend db:migrate
```

#### Configure in the UI

| Who | Where | What to set |
|-----|--------|-------------|
| **Affiliate (pack host)** | Storefront → **Affiliate dashboard** → tab **Packs** → under each live campaign, **Early-bird Blits (countdown)** | **Pay-by deadline (local)** — datetime when the offer ends (stored as UTC in the database). **Blits prize** — whole number of Blits to credit per qualifying payment. Click **Save early-bird**. |
| **Commerce admin** | **`/affiliate/admin`** → tab **Pack loyalty** → **Early-bird Blits (same campaign id)** | Paste the **campaign id** (e.g. `pcamp_…`) in **Campaign id** above, set **Pay-by deadline (local)** and **Blits prize**, then **Save early-bird Blits**. |

**Clearing the offer:** remove both the deadline and the prize (empty fields) and save, or set both to empty/clear in the affiliate form. You cannot set a prize without a deadline or a deadline without a prize; to disable the promo, clear both.

**Public pack page:** shows a countdown and the prize amount while the deadline is in the future; after it passes, copy explains that the early-bird offer has ended.

#### APIs (automation / integrations)

- **Affiliate owner:** `PATCH /api/affiliate/pack-campaigns/[campaignId]/gift`  
  Body JSON: `{ "affiliate_code": "<code>", "gift_countdown_ends_at": "<ISO-8601 or null>", "gift_blits_prize": <number or null> }`  
  Requires a signed-in customer matching that affiliate.

- **Commerce admin:** `PATCH /api/admin/pack-campaigns/[campaignId]/gift`  
  Body JSON: `{ "gift_countdown_ends_at": "<ISO-8601 or null>", "gift_blits_prize": <number or null> }`  
  Requires commerce admin auth (same as other `/api/admin/*` routes).

**Note:** Gift Blits require a **storefront** customer id on the order line (logged-in shopper). Guests without that id will not receive wallet credit.

---

## Commands

```bash
# ─── Development ──────────────────────────────────────────
pnpm install           # Install all dependencies
pnpm dev               # Run all apps in dev mode
pnpm dev:refresh-seed  # Rebuild medusa + rerun seed only
pnpm dev:refresh-catalog # Rebuild medusa, rerun seed, rebuild storefront
pnpm dev:refresh-inventory # Rebuild medusa, seed, inventory backfill, rebuild storefront
pnpm inventory:backfill-medusa # Ensure inventory levels + low-stock quantities
pnpm build             # Build all packages and apps
pnpm lint              # Lint all packages
pnpm format            # Format with Prettier
pnpm type-check        # TypeScript check
pnpm clean             # Remove build artifacts and node_modules

# ─── Individual apps ─────────────────────────────────────
pnpm --filter @blessluxe/storefront dev
pnpm --filter @blessluxe/backend dev

# ─── Backend (Medusa) ────────────────────────────────────
pnpm --filter @blessluxe/backend db:migrate
pnpm --filter @blessluxe/backend seed

# ─── Docker ──────────────────────────────────────────────
docker compose up -d                # Start all services
docker compose up -d postgres redis # Infrastructure only
docker compose up --build -d        # Rebuild and start
docker compose down                 # Stop (keep data)
docker compose down -v              # Stop and delete data
docker compose logs -f medusa       # Follow Medusa logs
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React 18, Tailwind CSS, Framer Motion |
| State | Zustand, React Query |
| Backend | Medusa.js v2, Express |
| Database | PostgreSQL 16 (pgvector) |
| Cache | Redis 7 |
| AI | Google Gemini 2.5 Flash, Gemini Live API |
| Payments | Stripe, Paystack, Flutterwave |
| Monorepo | Turborepo, pnpm workspaces |
| Containers | Docker, Docker Compose |

---

## Troubleshooting

### Admin login fails (stuck on login page)

The session cookie requires matching `COOKIE_SECURE` settings:
- **HTTP** (localhost): `COOKIE_SECURE=false` (default in `.env.docker`)
- **HTTPS** (production): `COOKIE_SECURE=true`

### Products show $0.00 prices

The Medusa Store API needs a `region_id` to calculate prices.  
The shop listing and product detail routes now resolve a default region automatically, but you must still have seeded regions and linked sales channels.

Checklist:
- Run seed data so regions exist:
  - `docker compose exec medusa npx medusa exec ./src/scripts/seed.ts`
- Ensure your publishable API key is linked to active sales channels in Medusa admin
- Rebuild storefront after env/config changes:
  - `docker compose up --build -d --no-deps storefront`

### Product page returns 404 after clicking a product

This usually means the storefront is running an old build that still uses mock product handles.

Fix:
```bash
docker compose up --build -d --no-deps storefront
```
Then hard refresh the browser (`Cmd+Shift+R`).

### Product or cart images appear blank/broken

Image URLs can fail when Medusa returns internal Docker host URLs (for example `http://medusa:9000/...`) or relative upload paths.

Current storefront behavior normalizes these to browser-accessible URLs, including on:
- Shop product cards
- Product detail gallery
- Cart drawer/cart items

If images are still blank:
- Hard refresh (`Cmd+Shift+R`)
- Remove and re-add stale cart items (old persisted cart entries may contain outdated thumbnail URLs)
- Rebuild storefront:
  - `docker compose up --build -d --no-deps storefront`

### Women catalog images missing after a data reset

Run the Medusa rebuild + seed flow to re-apply image backfills from the seed script:

```bash
docker compose up --build -d --no-deps medusa
docker compose exec medusa npx medusa exec ./src/scripts/seed.ts
```

Quick command:

```bash
pnpm dev:refresh-seed
```

### Low stock ("Only X left") not appearing

If PDP loads but low-stock badges/messages do not show:

```bash
pnpm inventory:backfill-medusa
docker compose up --build -d --no-deps storefront
```

Then hard refresh the product page.

### Docker build fails on storefront compile after home-section edits

If a recent UI refactor introduced a compile error, validate locally first:

```bash
pnpm --filter @blessluxe/storefront build
```

Then rebuild storefront container:

```bash
docker compose up --build -d --no-deps storefront
```

### "Publishable API key required" error

Create a publishable API key in the Medusa admin (Settings > API Key Management) and link it to your sales channels. Add it to `MEDUSA_PUBLISHABLE_KEY` in your `.env` file.

### AI chat says it's not fully configured

- Set `GOOGLE_AI_API_KEY` in root `.env` (Docker) or `NEXT_PUBLIC_GOOGLE_AI_API_KEY` in `apps/storefront/.env.local` (local dev).
- If running with Docker, rebuild the storefront after changing env vars:

```bash
docker compose up --build -d storefront
```

### Google OAuth login button says not configured

Set these vars in root `.env` (Docker) or `apps/storefront/.env.local` (local dev):
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`

Then rebuild storefront:

```bash
docker compose up --build -d storefront
```

### Commerce / affiliate admin endpoints return Unauthorized

The storefront **Commerce admin** (`/affiliate/admin`) and its `/api/admin/*` routes require explicit auth:

- Set `ADMIN_DASHBOARD_KEY` and enter it at `/affiliate/admin/auth`, or
- Set `ADMIN_EMAILS` (comma-separated) and sign in on `/account` with one of those emails.

Unauthenticated visitors are redirected to `/affiliate/admin/auth`.

### Storefront startup env warnings

The storefront container now runs a startup environment check and logs warnings when required keys are missing.

- It validates `NEXT_PUBLIC_MEDUSA_BACKEND_URL` and `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`.
- It also checks that at least one AI key is set: `GOOGLE_AI_API_KEY` or `NEXT_PUBLIC_GOOGLE_AI_API_KEY`.
- The container still starts even when values are missing, but related features (catalog pricing, AI chat/voice) may fail.

### Docker build fails with TypeScript errors

The Medusa backend uses `strict: false` in `tsconfig.json` and the storefront uses `ignoreBuildErrors: true` in `next.config.js` to handle evolving type definitions. If you add new code with strict errors, either fix the types or use `// @ts-nocheck` pragmatically for providers.

### Medusa can't connect to PostgreSQL in Docker

Ensure the `DATABASE_URL` includes `?sslmode=disable` — the PostgreSQL container doesn't enable SSL.

### Medusa is "unhealthy" right after startup

The `medusa` container now runs migrations before starting the API. On first boot (or after DB reset), it can take a little longer before the healthcheck turns green.

### Storefront can't reach Medusa API

- In Docker: the storefront container uses `NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000` for browser-side requests (port-mapped to the host).
- For server-side requests, ensure `STORE_CORS` includes both `http://localhost:3000` and `http://storefront:3000`.

### Category filters show too many options

The shop sidebar category filter is now scoped to the selected header branch:
- Selecting `Women`, `Men`, or `Children` shows only that branch and its descendants
- Selecting a subcategory keeps the same parent branch scope
- With no selected category, the sidebar shows broader top-level category options
