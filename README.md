# BLESSLUXE

> Luxury women's fashion e-commerce platform with an AI-powered personal shopping assistant.

Built with **Next.js 14**, **Medusa.js v2**, and **Google Gemini** — structured as a Turborepo monorepo.

---

## Table of Contents

- [Quick Start (Local Development)](#quick-start-local-development)
- [Docker Deployment (Full Stack)](#docker-deployment-full-stack)
- [Post-Setup: Migrations, Admin User & Seed Data](#post-setup-migrations-admin-user--seed-data)
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
cp apps/storefront/.env.local.example apps/storefront/.env.local
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
| `JWT_SECRET` | Prod | Change from default for production |
| `COOKIE_SECRET` | Prod | Change from default for production |
| `COOKIE_SECURE` | Prod | Set to `true` when behind HTTPS |

### 2. Build and start

```bash
docker compose up --build -d
```

This starts 4 services:

| Service | Port | Description |
|---|---|---|
| `postgres` | 5432 | PostgreSQL 16 with pgvector |
| `redis` | 6379 | Redis 7 |
| `medusa` | 9000 | Medusa backend + admin dashboard |
| `storefront` | 3000 | Next.js customer storefront |

### 3. First-time setup (migrations, admin user, seed data)

After the containers are running for the first time:

```bash
# Run database migrations
docker compose exec medusa npx medusa db:migrate

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

## Post-Setup: Migrations, Admin User & Seed Data

These steps apply to both local and Docker setups.

### Database migrations

```bash
# Local
pnpm --filter @blessluxe/backend db:migrate

# Docker
docker compose exec medusa npx medusa db:migrate
```

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
- **8 Categories**: Dresses, Tops, Bottoms, Outerwear, Shoes, Bags, Jewelry, Accessories
- **24 Products** with variants, sizes, colors, and multi-currency pricing

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
| `NEXT_PUBLIC_MEDUSA_BACKEND_URL` | `http://localhost:9000` | Medusa API URL (browser-accessible) |
| `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` | — | Publishable API key from Medusa admin |
| `NEXT_PUBLIC_GOOGLE_AI_API_KEY` | — | Gemini API key for AI chat |
| `AI_DATABASE_URL` | (set by compose) | PostgreSQL for AI memory tables |

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

- **Cloudinary** (custom) — set `CLOUDINARY_CLOUD_NAME`

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

### Docker build fails with TypeScript errors

The Medusa backend uses `strict: false` in `tsconfig.json` and the storefront uses `ignoreBuildErrors: true` in `next.config.js` to handle evolving type definitions. If you add new code with strict errors, either fix the types or use `// @ts-nocheck` pragmatically for providers.

### Medusa can't connect to PostgreSQL in Docker

Ensure the `DATABASE_URL` includes `?sslmode=disable` — the PostgreSQL container doesn't enable SSL.

### Storefront can't reach Medusa API

- In Docker: the storefront container uses `NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000` for browser-side requests (port-mapped to the host).
- For server-side requests, ensure `STORE_CORS` includes both `http://localhost:3000` and `http://storefront:3000`.
