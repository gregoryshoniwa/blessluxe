# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BLESSLUXE is a luxury women's fashion e-commerce project structured as a **Turborepo monorepo** using pnpm workspaces. It has Next.js frontend apps (storefront + admin) and a single custom Express.js backend (`@blessluxe/shop-backend`) that handles catalogue, cart, customer, review, and affiliate concerns.

## Commands

```bash
pnpm install              # Install all dependencies
pnpm dev                  # Run all apps in dev mode (storefront :3000, admin :3001, shop :9001)
pnpm build                # Build all packages and apps via Turbo
pnpm lint                 # Lint all packages and apps
pnpm format               # Format all files with Prettier
pnpm format:check         # Check formatting without writing
pnpm type-check           # TypeScript type checking across all packages
pnpm clean                # Remove all build artifacts and node_modules

# Run a single app
pnpm --filter @blessluxe/storefront dev
pnpm --filter @blessluxe/admin dev
pnpm --filter @blessluxe/shop-backend dev

# Shop backend
pnpm shop:dev              # Start backend on :9001
pnpm shop:migrate          # Create shop_* tables in Postgres
pnpm shop:seed             # Seed regions, headings, catalogues, products, variants

# Infrastructure
docker compose up -d          # Start everything (postgres + shop + storefront + admin)
docker compose down           # Stop services
```

## Monorepo Structure

```
apps/
  storefront/        Next.js 14 (App Router) — customer-facing store, port 3000
  admin/             Next.js 14 (App Router) — admin dashboard, port 3001
backend/
  shop/              Express.js commerce backend, port 9001
packages/
  ui/                Shared React components (Button, Card) with Tailwind classes
  config/            Shared tailwind.config.ts and tsconfig bases
  types/             Shared TypeScript types (Product, User, Cart, Order)
  eslint-config/     Shared ESLint config (base + Next.js variant)
  prettier-config/   Shared Prettier config
mock_website/        Original static HTML prototype (standalone, no build)
docker-compose.yml   PostgreSQL 16 + shop + storefront + admin
```

## Architecture

### Storefront ↔ Backend wiring

The storefront talks to the shop backend via the Medusa JS SDK (used purely as an HTTP client because the shop backend exposes Medusa-shaped `/store/*` endpoints). The base URL is configured via `NEXT_PUBLIC_COMMERCE_BACKEND` (preferred) or `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (legacy alias). Both default to `http://localhost:9001`.

The toggle logic lives in [apps/storefront/src/lib/medusa.ts](apps/storefront/src/lib/medusa.ts).

### Navigation hierarchy (Headings → Catalogues → Products → Variants)

The storefront menu is configured in the admin (port 3001) via:
- **Headings** — top-level menu items ("Women", "Men", "Sale"). Configurable order, active flag, sale flag.
- **Catalogues** — nested under headings ("Dresses", "Tops", "Bags"). Products are attached to one or more catalogues.
- **Products** — admin selects which catalogues each product appears in.
- **Variants** — size/color/etc. options per product.

Schema:
- `shop_heading` — top-level menu items
- `shop_catalogue` — has `heading_id` FK
- `shop_product_catalogue_map` — many-to-many product↔catalogue
- Legacy `shop_product_category` and `shop_product_category_map` are kept for backward compat but the storefront navigation is driven by headings.

Storefront navigation hook: [apps/storefront/src/hooks/useNavigation.ts](apps/storefront/src/hooks/useNavigation.ts) calls `useHeadings()` which reads `/store/headings` from the shop backend.

### Admin app

[apps/admin/](apps/admin/) is a Next.js admin dashboard that talks directly to the shop backend admin API:
- `/login` — JWT auth via `/auth/login`
- `/` — dashboard
- `/headings` — manage navigation headings
- `/catalogues` — manage catalogues + assign to headings
- `/products` — product CRUD + multi-catalogue assignment
- `/inventory` — variant stock adjustments
- `/customers` — customer list, loyalty point adjustments
- `/reviews` — moderate (approve/reject) and respond to reviews
- `/affiliates` — affiliate codes, commission rates, payouts
- `/regions` — currency/region setup

### Package Dependencies

Apps (`storefront`, `admin`) depend on `@blessluxe/ui`, `@blessluxe/types`, and `@blessluxe/config`. The `ui` package exports React components that use Tailwind utility classes referencing the shared theme. Both apps use `transpilePackages: ["@blessluxe/ui"]` in their Next.js config.

### TypeScript Configuration

Three tsconfig presets in `packages/config`: `tsconfig.base.json` (shared compiler options), `tsconfig.nextjs.json` (extends base, adds Next.js plugin and JSX preserve), `tsconfig.react-library.json` (extends base, react-jsx transform). Apps and packages extend these via `@blessluxe/config/tsconfig/*`.

### Path Aliases

Both Next.js apps use `@/*` mapped to `./src/*`.

### Tailwind Theme

Shared theme in `packages/config/tailwind.config.ts` defines brand colors (`gold`, `cream`, `blush`) and font families (`font-display`, `font-body`, `font-script`). Each app's `tailwind.config.ts` spreads the shared config and adds its own content globs.

### Shared Types

`@blessluxe/types` exports e-commerce domain types: `Product`, `ProductVariant`, `ProductImage`, `User`, `Address`, `Cart`, `CartItem`, `Order`, `OrderItem`, `OrderStatus`. Import from `@blessluxe/types` in any app or package.

### Turbo Pipeline

`build` depends on `^build` (builds packages before apps). `dev` and `clean` are not cached. `lint` and `type-check` depend on `^build`. Build outputs are `.next/**` and `dist/**`.

## Shop backend (`backend/shop/`)

Express.js, runs on Node 22+ with native TypeScript execution (no build step). Uses PostgreSQL for storage. All tables prefixed `shop_`.

### Source layout

```
backend/shop/src/
  index.ts                 Express app + route registration
  db/
    schema.sql             Full schema (idempotent CREATE IF NOT EXISTS)
    pool.ts                pg Pool + query/queryOne/execute helpers
    seed.ts                Default admin user, regions, headings, catalogues, products, variants
    migrate.ts             Apply schema.sql
  middleware/
    cors.ts                Store CORS
    auth.ts                Optional API key check for /store/*
    admin-auth.ts          JWT bearer auth for /admin/*
  routes/
    regions.ts             GET /store/regions
    products.ts            GET /store/products, /store/products/:id (filters: handle, q, category_id[], catalogue_id[], heading_id, heading_handle)
    categories.ts          GET /store/product-categories  (legacy)
    headings.ts            GET /store/headings, /store/headings/:idOrHandle
    catalogues.ts          GET /store/catalogues, /store/catalogues/:idOrHandle
    variants.ts            GET /store/product-variants/:id
    reviews.ts             GET/POST /store/reviews, POST /store/reviews/:id/helpful
    carts.ts               POST/GET /store/carts, line-item CRUD
    auth.ts                /auth/login, /auth/me, /auth/logout, /auth/users
    admin.ts               JWT-protected /admin/* — products, images, variants, inventory, regions
    admin-hierarchy.ts     /admin/headings, /admin/catalogues (CRUD + reorder), product↔catalogue assignment
    admin-reviews.ts       /admin/reviews list/update/delete
    admin-customers.ts     /admin/customers list/CRUD + /admin/customers/:id/loyalty (delta adjust)
    admin-affiliates.ts    /admin/affiliates CRUD + payouts
```

### Required Environment Variables

See [backend/shop/.env.template](backend/shop/.env.template):
`DATABASE_URL`, `PORT`, `STORE_CORS`, `ADMIN_CORS`, `PUBLISHABLE_API_KEY`, `JWT_SECRET`, `UPLOAD_DIR`.

### Docker

The shop backend has its own Dockerfile (`backend/shop/Dockerfile`) using Node 22 Alpine. It runs on port 9001 by default. The admin has its own Dockerfile at `apps/admin/Dockerfile` and runs on port 3001.

## Default admin login

Email: `admin@blessluxe.com`
Password: `admin123` (created by `pnpm shop:seed`)

Change this immediately in any non-local deployment via the `/admin/users` endpoints or the admin UI.
