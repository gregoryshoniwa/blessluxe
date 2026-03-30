# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BLESSLUXE is a luxury women's fashion e-commerce project structured as a **Turborepo monorepo** using pnpm workspaces. It has Next.js frontend apps, a Medusa.js v2 backend (or a lightweight custom Express backend), and shared packages.

## Commands

```bash
pnpm install              # Install all dependencies
pnpm dev                  # Run all apps in dev mode (storefront :3000, admin :3001, medusa :9000)
pnpm build                # Build all packages and apps via Turbo
pnpm lint                 # Lint all packages and apps
pnpm format               # Format all files with Prettier
pnpm format:check         # Check formatting without writing
pnpm type-check           # TypeScript type checking across all packages
pnpm clean                # Remove all build artifacts and node_modules

# Run a single app
pnpm --filter @blessluxe/storefront dev
pnpm --filter @blessluxe/admin dev
pnpm --filter @blessluxe/backend dev

# Run commands in a specific package
pnpm --filter @blessluxe/ui type-check
pnpm --filter @blessluxe/types lint

# Backend (Medusa) commands — run from backend/medusa/
pnpm --filter @blessluxe/backend db:migrate    # Run database migrations
pnpm --filter @blessluxe/backend db:generate   # Generate migrations for custom modules
pnpm --filter @blessluxe/backend seed          # Seed database

# Drop & recreate the Postgres DB from backend/medusa/.env DATABASE_URL, then migrate + seed (needs `psql`; destroys all data in that database)
pnpm db:reset-medusa -- --yes

# Custom Shop Backend (alternative to Medusa)
pnpm shop:dev              # Start custom backend on :9000
pnpm shop:migrate          # Create shop_* tables in Postgres
pnpm shop:seed             # Seed products, categories, regions, pricing

# Infrastructure
docker compose up -d          # Start PostgreSQL (5432) and Redis (6379)
docker compose down           # Stop services

# Docker with custom shop backend (instead of Medusa)
docker compose --profile shop up --build -d
docker compose exec shop node --experimental-strip-types --experimental-transform-types src/db/seed.ts
```

## Monorepo Structure

```
apps/
  storefront/        Next.js 14 (App Router) — customer-facing store, port 3000
  admin/             Next.js 14 (App Router) — admin dashboard, port 3001
backend/
  medusa/            Medusa.js v2 — e-commerce backend API, port 9000
  shop/              Custom Express.js — lightweight alternative, port 9001
packages/
  ui/                Shared React components (Button, Card) with Tailwind classes
  config/            Shared tailwind.config.ts and tsconfig bases
  types/             Shared TypeScript types (Product, User, Cart, Order)
  eslint-config/     Shared ESLint config (base + Next.js variant)
  prettier-config/   Shared Prettier config
mock_website/        Original static HTML prototype (standalone, no build)
docker-compose.yml   PostgreSQL 16 + Redis 7 for local development
```

## Architecture

### Package Dependencies

Apps (`storefront`, `admin`) depend on `@blessluxe/ui`, `@blessluxe/types`, and `@blessluxe/config`. The `ui` package exports React components that use Tailwind utility classes referencing the shared theme. Both apps use `transpilePackages: ["@blessluxe/ui"]` in their Next.js config.

### TypeScript Configuration

Three tsconfig presets in `packages/config`: `tsconfig.base.json` (shared compiler options), `tsconfig.nextjs.json` (extends base, adds Next.js plugin and JSX preserve), `tsconfig.react-library.json` (extends base, react-jsx transform). Apps and packages extend these via `@blessluxe/config/tsconfig/*`. The backend has its own tsconfig with `@modules/*` and `@providers/*` path aliases.

### Path Aliases

All Next.js apps use `@/*` mapped to `./src/*`. The Medusa backend uses `@modules/*` and `@providers/*` mapped into `./src/`.

### Tailwind Theme

Shared theme in `packages/config/tailwind.config.ts` defines brand colors (`gold`, `cream`, `blush`) and font families (`font-display`, `font-body`, `font-script`). Each app's `tailwind.config.ts` spreads the shared config and adds its own content globs.

### Shared Types

`@blessluxe/types` exports e-commerce domain types: `Product`, `ProductVariant`, `ProductImage`, `User`, `Address`, `Cart`, `CartItem`, `Order`, `OrderItem`, `OrderStatus`. Import from `@blessluxe/types` in any app or package.

### ESLint

Two configs exported from `@blessluxe/eslint-config`: the base (`index.js`) for libraries, and `next.js` for Next.js apps. Apps set `root: true` and extend `@blessluxe/eslint-config/next`.

### Turbo Pipeline

`build` depends on `^build` (builds packages before apps). `dev` and `clean` are not cached. `lint` and `type-check` depend on `^build`. Build outputs are `.next/**`, `dist/**`, and `.medusa/**`.

## Backend (Medusa.js v2)

### Configuration

`backend/medusa/medusa-config.ts` is the entry point. All providers and custom modules are registered in the `modules` array. Environment variables are loaded from `.env` via `loadEnv()`. Copy `.env.template` to `.env` before running.

### Custom Modules

Three custom modules in `backend/medusa/src/modules/`, each following the Medusa v2 module pattern (models via `model.define()`, service extending `MedusaService()`, module definition via `Module()`):

- **affiliate** — `Affiliate`, `AffiliateSale`, `AffiliatePayout` models. Tracks affiliate codes, commission rates, sales attribution, and payout processing. Service: `AffiliateModuleService`.
- **customer-extended** — `CustomerExtended` model. Adds loyalty points/tiers, style preferences, size profile, referral codes, and marketing consent to core customers. Service: `CustomerExtendedModuleService`.
- **product-review** — `ProductReview` model. Customer reviews with rating, verified purchase flag, moderation status, admin responses, and helpful counts. Service: `ProductReviewModuleService`.

### Payment Providers

Three payment gateways registered under `@medusajs/medusa/payment`, all in the `providers` array of the payment module config in `medusa-config.ts`:

- **Stripe** — Built-in `@medusajs/medusa/payment-stripe`. Env: `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`.
- **Paystack** (`src/providers/payment-paystack/`) — Custom `AbstractPaymentProvider`. Handles transaction init, verify, refund, and `charge.success` webhooks. Env: `PAYSTACK_SECRET_KEY`.
- **Flutterwave** (`src/providers/payment-flutterwave/`) — Custom `AbstractPaymentProvider`. Handles payment links, `verify_by_reference`, refunds, and `charge.completed` webhooks. Env: `FLUTTERWAVE_SECRET_KEY`.

To add a new payment gateway: create `src/providers/payment-<name>/` with `index.ts` (using `ModuleProvider(Modules.PAYMENT, ...)`) and `service.ts` (extending `AbstractPaymentProvider`), then append an entry to the payment module's `providers` array in `medusa-config.ts`.

### Notification Providers

Two notification providers registered under `@medusajs/medusa/notification`. Medusa allows one provider per channel — configure either SendGrid or SMTP for the `email` channel, not both simultaneously:

- **SendGrid** — Built-in `@medusajs/medusa/notification-sendgrid`. Uses SendGrid templates. Env: `SENDGRID_API_KEY`, `SENDGRID_FROM`.
- **SMTP** (`src/providers/notification-smtp/`) — Custom `AbstractNotificationProviderService` using nodemailer. Works with any SMTP server (Gmail, Mailgun, Amazon SES, Zoho, self-hosted). Env: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

To add a new notification provider: create `src/providers/notification-<name>/` with `index.ts` (using `ModuleProvider(Modules.NOTIFICATION, ...)`) and `service.ts` (extending `AbstractNotificationProviderService` with a `send()` method), then append to the notification module's `providers` array.

### File Provider

- **Cloudinary** (`src/providers/file-cloudinary/`) — Custom `AbstractFileProviderService`. Uploads to Cloudinary with auto resource type detection. Registered under `@medusajs/medusa/file`.

### Medusa Convention Directories

`src/api/` for custom API routes, `src/workflows/` for custom workflows, `src/subscribers/` for event subscribers, `src/links/` for module links. These are auto-discovered by Medusa.

### Required Environment Variables

See `backend/medusa/.env.template` for all variables. Key ones: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `COOKIE_SECRET`, `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS`, plus provider-specific keys for Stripe, Paystack, Flutterwave, Cloudinary, SendGrid, and SMTP.

## Custom Shop Backend (backend/shop/)

A lightweight Express.js backend that replaces Medusa for catalog, cart, and inventory. Uses Node 22+ native TypeScript execution (no build step).

### Switching backends

Set `NEXT_PUBLIC_COMMERCE_BACKEND=http://localhost:9001` in the storefront env to route all `/store/*` API calls to the custom backend instead of Medusa. The toggle logic lives in `apps/storefront/src/lib/medusa.ts` (`isCustomBackend` flag). Port 9001 avoids conflict with Medusa (9000) so both can run simultaneously.

### Database

Uses the same PostgreSQL instance as Medusa. All tables are prefixed `shop_` to avoid collisions. Schema in `backend/shop/src/db/schema.sql`. Run `pnpm shop:migrate` to create tables, `pnpm shop:seed` to populate.

### API Routes

All routes mirror Medusa Store API response shapes so the storefront works unchanged:

- `GET /store/regions` — list regions with currencies
- `GET /store/products` — list/search/filter products (supports `handle`, `id`, `category_id[]`, `q` params)
- `GET /store/products/:id` — single product with variants, options, prices, images
- `GET /store/product-categories` — list categories
- `GET /store/product-variants/:id` — variant with inventory
- `POST /store/carts` — create cart
- `GET /store/carts/:id` — get cart with enriched line items
- `POST /store/carts/:id/line-items` — add item
- `POST /store/carts/:id/line-items/:lineId` — update quantity
- `DELETE /store/carts/:id/line-items/:lineId` — remove item
- `GET /health` — health check

Admin routes under `/admin/*` provide CRUD for products, variants, categories, regions, and file upload.

### Environment Variables

See `backend/shop/.env.template`. Key ones: `DATABASE_URL`, `PORT`, `STORE_CORS`, `ADMIN_CORS`, `PUBLISHABLE_API_KEY`, `UPLOAD_DIR`.

### Docker

The shop backend has its own Dockerfile (`backend/shop/Dockerfile`) using Node 22 Alpine. It's registered in `docker-compose.yml` under the `shop` profile on port 9001. Use `docker compose --profile shop up --build -d` to run it alongside or instead of Medusa.
