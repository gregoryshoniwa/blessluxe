# BLESSLUXE

> Luxury women's fashion e-commerce platform with an AI-powered personal shopping assistant.

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
| Medusa Admin | http://localhost:9000/app |
| Medusa API | http://localhost:9000 |

Admin login: `admin@blessluxe.com` / `admin123`

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

```bash
# Local
pnpm --filter @blessluxe/backend seed

# Docker
docker compose exec medusa npx medusa exec ./src/scripts/seed.ts
```

The seed script is idempotent — safe to run multiple times.

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
| `AI_DATABASE_URL` | (set by compose) | PostgreSQL for AI memory tables |
| `GOOGLE_CLIENT_ID` | — | Google OAuth client id for account login |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth client secret for account login |
| `NEXTAUTH_SECRET` | `change-me...` | Session signing secret for NextAuth |
| `NEXTAUTH_URL` | `http://localhost:3000` | Public storefront URL for auth callbacks |
| `ADMIN_DASHBOARD_KEY` | — | Shared key for protecting affiliate admin routes |
| `ADMIN_EMAILS` | — | Comma-separated admin emails (alternative to key) |
| `SUPABASE_URL` | — | Supabase project URL for affiliate media storage |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Supabase service role key (server-side upload auth) |
| `SUPABASE_STORAGE_BUCKET` | `affiliate-media` | Supabase public bucket used for affiliate uploads |
| `GOOGLE_NANO_BANANA_MODEL` | `gemini-3.1-flash-image-preview` | Optional model override for affiliate AI photoshoot route |

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

The storefront includes an AI-powered chat widget powered by Google Gemini.

### Text Chat
- Click the sparkle button (bottom-right) to open the chat
- Messages are sent to **Gemini 2.5 Flash** via the `/api/agent` route
- Conversation history is maintained for contextual responses
- Fashion-aware system prompt trained on BLESSLUXE's brand voice

### Voice (Gemini Live API)
- Click the microphone button for **real-time speech-to-speech** via Gemini Live
- Uses WebSocket connection to `gemini-2.5-flash-native-audio-preview`
- Supports voice activity detection and barge-in

### Camera & Screen Share
- **Camera button**: Share your camera feed with the AI (outfit checks, style advice)
- **Screen share button**: Share your screen (help navigating the store, comparing products)

### AI Memory & RAG

The AI agent has persistent memory backed by PostgreSQL + pgvector:

- Conversation history stored per session
- Customer preferences learned over time
- Vector embeddings for semantic search (RAG) using `text-embedding-004`
- Interaction tracking for analytics

---

## Backend

### Custom Modules

| Module | Description |
|---|---|
| `affiliate` | Affiliate codes, commission tracking, payout processing |
| `customer-extended` | Loyalty points/tiers, style preferences, size profiles |
| `product-review` | Customer reviews with ratings and moderation |

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

Affiliate social shop now supports:
- Direct image upload for catalog posts and selfies (`/api/affiliate/social/upload`)
- AI photoshoot generation route with saved media metadata (`/api/affiliate/social/photoshoot`)
- Admin moderation queue before public visibility of affiliate social posts
- Storage priority: Supabase -> local fallback (so uploads keep working)

### Moderation flow

1. Affiliate creates a social post from `/affiliate/shop/[code]`
2. Post is saved as `pending` and hidden from public viewers
3. Admin reviews post from `/affiliate/admin` and approves/rejects it
4. Only approved posts appear in public affiliate feeds

---

## Commands

```bash
# ─── Development ──────────────────────────────────────────
pnpm install           # Install all dependencies
pnpm dev               # Run all apps in dev mode
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

The Medusa Store API needs a `region_id` to calculate prices. The storefront hooks fetch regions automatically, but ensure at least one region exists by running the seed script.

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

### Affiliate admin endpoints return Unauthorized

Admin APIs now require explicit auth:
- Set `ADMIN_DASHBOARD_KEY` and provide it from the admin page key prompt, or
- Set `ADMIN_EMAILS` (comma-separated) and login with one of those account emails.

The admin page is now server-side protected and redirects unauthenticated users to:
- `/affiliate/admin/auth`

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
