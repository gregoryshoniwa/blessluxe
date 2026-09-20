# BLESSLUXE

Luxury women's fashion e-commerce: a Laravel 13 API with two Vue 3 SPAs (storefront and admin), MySQL, Paynow payments, and **LUXE**, a Gemini-powered shopping agent with text, voice and image generation.

## Requirements

- PHP 8.3+, Composer
- Node 20+ and npm
- MySQL 8 (not Postgres — `ai_customer_memories` relies on `FULLTEXT`)

## Setup

```bash
git clone https://github.com/gregoryshoniwa/blessluxe.git
cd blessluxe

composer install
npm install

cp .env.example .env
php artisan key:generate
```

Create a MySQL database called `blessluxe`, set the `DB_*` values in `.env`, then:

```bash
php artisan migrate --seed
```

`.env.example` only carries the stock Laravel keys. Add the ones in [Environment](#environment) by hand.

## Running locally

Two terminals:

```bash
php artisan serve     # http://127.0.0.1:8000
npm run dev           # Vite dev server with HMR
```

Or everything at once (server, queue listener, log tail, Vite):

```bash
composer dev
```

**Always browse at `http://127.0.0.1:8000`, not `localhost:8000`.** Sessions are per host, and the Google OAuth and Paynow callbacks are registered against `127.0.0.1`. Starting a sign-in on `localhost` and landing back on `127.0.0.1` loses the session and the login fails. Keep `APP_URL`, `GOOGLE_REDIRECT_URI` and the `PAYNOW_*_URL` values on the same host.

| Area | URL |
|---|---|
| Storefront | http://127.0.0.1:8000 |
| Customer account | http://127.0.0.1:8000/account/login |
| Admin | http://127.0.0.1:8000/admin/login |
| Sitemap | http://127.0.0.1:8000/sitemap.xml |

### Default admin

`admin@blessluxe.com` / `admin123`, created by the seeder. **Change it on anything that isn't your own machine.** No customers are seeded — sign up through the storefront.

### Useful commands

```bash
npm run build                      # production Vite bundle
php artisan migrate:fresh --seed   # wipe and reseed the database
php artisan route:list             # every route
php artisan tinker                 # REPL
composer test                      # test suite
```

## Environment

Beyond the standard Laravel keys:

| Key | Purpose |
|---|---|
| `GOOGLE_AI_API_KEY` | Gemini API key (LUXE text, voice, Nano Banana images) |
| `GEMINI_MODEL` | Text + tool-use model, e.g. `gemini-2.5-flash` |
| `GEMINI_LIVE_MODEL` | Gemini Live model for real-time voice |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in for customers (Socialite) |
| `GOOGLE_REDIRECT_URI` | OAuth callback. Must match an authorised redirect URI in Google Cloud Console exactly. Optional: if omitted, it is built from `APP_URL`. Never copy the local value to production. |
| `PAYNOW_INTEGRATION_ID`, `PAYNOW_INTEGRATION_KEY` | Paynow merchant credentials |
| `PAYNOW_RESULT_URL` | IPN endpoint, `/api/store/payments/paynow/ipn`. Paynow's servers call this, so locally it only works through a tunnel (ngrok or similar). |
| `PAYNOW_RETURN_URL` | Browser return, `/api/store/payments/paynow/return` |
| `PAYNOW_AUTH_EMAIL_OVERRIDE` | Forces the payer email in Paynow test mode |
| `MAIL_*`, `MAIL_ADMIN_BCC` | SMTP settings and an optional BCC for admin copies |

Sessions, cache and queue all use the `database` driver.

## Architecture

```
app/
  Http/Controllers/Api/          Storefront + customer APIs
  Http/Controllers/Api/Admin/    Admin APIs (auth:web)
  Models/                        Eloquent models
  Mail/                          Mailables
  Services/
    AI/                          LUXE agent: ShoppingAgent, GeminiService, AiConfig, Tools/
    Bees.php                    Loyalty points
    Paynow.php                   Payment provider
    Shipping.php                 Packages + tracking
    Notifications.php            Customer/admin notifications
    OrderRefunds.php             Refund handling
database/migrations/             Numeric-prefixed migrations
resources/js/
  storefront/                    Vue SPA: shop, cart, checkout, account, affiliate, showroom
  admin/                         Vue SPA: /admin
  lib/api.js                     Shared CSRF-aware fetch wrapper
resources/views/                 SPA shells (store, admin) + mail templates
routes/api.php                   All API routes
routes/web.php                   SPA catch-all + sitemap.xml
public/ai/                       Generated images
public/uploads/                  Admin-uploaded product images
```

### APIs

Everything lives in `routes/api.php`, in three groups:

- `/api/store/*` — public and session-backed: catalogue, cart, checkout, payments, LUXE agent
- `/api/account/*` — signed-in customer: orders, wishlist, addresses, notifications, returns, OAuth
- `/api/admin/*` — signed-in admin

`routes/web.php` serves both SPAs through `SeoController::spa`, which fills in Open Graph, Twitter and JSON-LD tags server-side before Vue hydrates.

### Auth

Two guards: `customer` for the storefront and `web` for admin. Admin users have a `role` (`admin` or `staff`) and an `is_active` flag. Customers can sign up with email (verified by signed URL, 60-minute hashed password-reset tokens) or with Google.

### Storefront

`/`, `/shop`, `/shop/:handle`, `/shop/packs`, `/cart`, `/wishlist`, `/checkout/*`, `/account/*`, `/affiliate/*`, `/showroom/:tab?` (sign-in required), `/track/:code`, `/faq`. Carts are keyed by session (`cart_id`), not by customer.

### Admin

Dashboard, products, inventory, catalogues, headings, packs, orders, returns, packages, customers, affiliates, reviews, Bees, regions, content, FAQs, reports (with the LUXE advisor), the AI studio, AI usage, and users.

### LUXE

Gemini handles text and tool use, Gemini Live handles voice over WebSocket, and Nano Banana renders images. Prompts and model config are in `app/Services/AI/AiConfig.php`; the same base prompt drives text and voice. The 12 tools in `app/Services/AI/Tools/` cover search, product view, inventory, cart, wishlist, order status, discounts, recommendations, browsing, order handoff, email digests and reminders. Voice tool calls are forwarded to Laravel at `POST /api/store/agent/execute-tool`, so no tool logic is duplicated in JavaScript.

### Payments, loyalty, returns

Paynow web integration with SHA512-signed requests and an IPN + return-URL flow; paid orders accrue Bees. Returns can be filed within 30 days of payment from the customer's account and are reviewed at `/admin/returns`; a full refund marks the order `refunded`.

## Troubleshooting

**"127.0.0.1 refused to connect" after Google sign-in** — on production, the server's `.env` still has the local `GOOGLE_REDIRECT_URI`. Remove that line (the callback then follows `APP_URL`) or set it to `https://blessluxe.com/api/account/oauth/google/callback`, run `php artisan config:cache`, and make sure that URL is an authorised redirect URI in Google Cloud Console. Check the `PAYNOW_*_URL` values at the same time. Locally, it just means `php artisan serve` isn't running.

**"OAuth failed" with an invalid state error** — you started on `localhost:8000` and came back on `127.0.0.1:8000`. Use `127.0.0.1` throughout.

**`redirect_uri_mismatch` from Google** — `GOOGLE_REDIRECT_URI` isn't listed under the OAuth client's authorised redirect URIs in Google Cloud Console.

**Unstyled page or missing assets** — run `npm run dev`, or `npm run build` to refresh `public/build`.

**Paynow orders stay unpaid locally** — the IPN can't reach `127.0.0.1`. Expose the app with a tunnel and point `PAYNOW_RESULT_URL` at it.
