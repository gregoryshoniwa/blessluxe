# BLESSLUXE

> Luxury fashion e-commerce platform (Women, Men, Children, Sale) with an AI-powered personal shopping assistant.

Built with **Next.js 14**, a custom **Express.js commerce backend**, and **Google Gemini** — structured as a Turborepo monorepo.

## Quick start

```bash
pnpm install
docker compose up -d postgres        # Start Postgres only
pnpm shop:seed                       # Create schema + sample data + default admin user
pnpm dev                             # Start all apps in parallel
```

| App        | URL                       |
|------------|---------------------------|
| Storefront | http://localhost:3000     |
| Admin      | http://localhost:3001     |
| Shop API   | http://localhost:9001     |

Default admin: `admin@blessluxe.com` / `admin123`

## Full Docker setup

```bash
cp .env.docker .env
docker compose up --build -d
```

After first boot, seed the database (idempotent):

```bash
docker compose exec shop node \
  --experimental-strip-types --experimental-transform-types \
  src/db/seed.ts
```

## Architecture

```
┌────────────────────────────┐         ┌──────────────────────────┐
│  Storefront (Next.js)      │  /store │  Shop Backend (Express)  │
│  apps/storefront  :3000    │────────▶│  backend/shop     :9001  │
└────────────────────────────┘         │                          │
                                       │  PostgreSQL              │
┌────────────────────────────┐  /admin │  shop_* tables           │
│  Admin (Next.js)           │  /auth  │                          │
│  apps/admin       :3001    │────────▶│                          │
└────────────────────────────┘         └──────────────────────────┘
```

- **Storefront** — customer-facing store. Uses the Medusa JS SDK as a generic HTTP client against `/store/*` on the shop backend.
- **Admin** — Next.js dashboard for headings, catalogues, products, customers, reviews, affiliates.
- **Shop backend** — single Express app handling catalogue, cart, customer, review, affiliate, and admin auth.

## Navigation hierarchy

The storefront menu is fully configurable in the admin:

```
Heading (Women, Men, Sale, …)
  └── Catalogue (Dresses, Tops, Bags, …)
        └── Product (with variants)
```

- Manage in **Admin → Headings** and **Admin → Catalogues**.
- Each product can be attached to multiple catalogues (Admin → Products → Edit → Catalogues).
- Heading order, active flag, and "Sale" treatment are admin-configurable.

## Monorepo layout

```
apps/
  storefront/    Customer-facing Next.js (App Router) :3000
  admin/         Admin dashboard Next.js              :3001
backend/
  shop/          Express commerce backend             :9001
packages/
  ui/            Shared React components
  config/        Shared Tailwind + tsconfig presets
  types/         Shared TypeScript domain types
  eslint-config/
  prettier-config/
docker-compose.yml   postgres + shop + storefront + admin
```

## Environment variables

Copy `.env.docker` to `.env` and edit. Key variables:

| Variable | Description |
|----------|-------------|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Postgres credentials |
| `JWT_SECRET` | Shop backend admin auth signing key |
| `STORE_CORS`, `ADMIN_CORS` | CORS allow-lists for storefront / admin origins |
| `NEXT_PUBLIC_COMMERCE_BACKEND` | URL the storefront browser uses to reach shop backend (default `http://localhost:9001`) |
| `NEXT_PUBLIC_SHOP_BACKEND` | URL the admin app uses to reach shop backend (default `http://localhost:9001`) |
| `GOOGLE_AI_API_KEY` | Gemini API key for AI agent / voice / chat features |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | NextAuth session signing for storefront customer login |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Google OAuth for customer sign-in |
| `SENDGRID_API_KEY` / `SMTP_*` | Optional transactional email |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Optional file storage (affiliate uploads) |

The legacy `NEXT_PUBLIC_MEDUSA_BACKEND_URL` is still honored as a fallback alias for `NEXT_PUBLIC_COMMERCE_BACKEND`.

## Common workflows

```bash
# Reset the database (drops all shop_* data)
docker compose down
docker volume rm blessluxe_postgres_data
docker compose up -d postgres
pnpm shop:seed

# Add a new product
# Open http://localhost:3001 → Products → New product
# Or POST to /admin/products against the shop backend (see CLAUDE.md for shape)

# Add a new heading
# Open http://localhost:3001 → Headings → New heading

# Rebuild a single service
docker compose up --build -d shop
docker compose up --build -d storefront
docker compose up --build -d admin

# Tail logs
docker compose logs -f shop
```

## Auth & admin users

The shop backend manages two distinct user populations:

- **Admin users** (`shop_user` table) — sign in to the admin app via `/auth/login`. JWT-protected.
- **Customers** (`shop_customer` table) — storefront end-users with loyalty points/tiers and referral codes.

Customer self-service login uses NextAuth on the storefront side; the shop backend just stores the records. Admins create/edit customers via the admin app.

## Custom modules

The shop backend ships with first-class support for:

- **Reviews** — `shop_product_review` table, public `/store/reviews` for read/submit, admin moderation under `/admin/reviews`.
- **Affiliates** — `shop_affiliate`, `shop_affiliate_sale`, `shop_affiliate_payout`. Admin CRUD + payout creation under `/admin/affiliates`.
- **Customer loyalty** — `loyalty_points` and `loyalty_tier` columns on `shop_customer`, adjustable via `/admin/customers/:id/loyalty`.

## Troubleshooting

**Storefront shows no products** — Make sure the shop backend is running on port 9001 and the database has been seeded (`pnpm shop:seed`). Visit http://localhost:9001/health to confirm.

**Login fails on admin app** — Verify `JWT_SECRET` is identical between any cached browser token and the running shop backend. If you changed it, clear localStorage in the admin tab.

**Image URLs broken** — The shop backend serves uploads from `/uploads/...`. Make sure the storefront's `NEXT_PUBLIC_COMMERCE_BACKEND` matches the URL the browser can actually reach (e.g. `http://localhost:9001` from the host, not `http://shop:9001` which only resolves inside Docker).

**Schema changes** — Edit `backend/shop/src/db/schema.sql`, then run `pnpm shop:migrate`. The schema uses `CREATE IF NOT EXISTS` so re-running is safe.

## License

Proprietary.
