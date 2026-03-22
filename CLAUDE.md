# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BLESSLUXE is a luxury women's fashion e-commerce project structured as a **Turborepo monorepo** using pnpm workspaces. It has Next.js frontend apps, a Medusa.js v2 backend, and shared packages.

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

# Infrastructure
docker compose up -d          # Start PostgreSQL (5432) and Redis (6379)
docker compose down           # Stop services
```

## Monorepo Structure

```
apps/
  storefront/        Next.js 14 (App Router) — customer-facing store, port 3000
  admin/             Next.js 14 (App Router) — admin dashboard, port 3001
backend/
  medusa/            Medusa.js v2 — e-commerce backend API, port 9000
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
