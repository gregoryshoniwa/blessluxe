# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BLESSLUXE** is a luxury women's fashion e-commerce app: Laravel 13 + Vue 3 + MySQL, single-repo. The Vue SPAs (storefront + admin) live under `resources/js/` and are compiled by Vite. Everything else is standard Laravel.

## Commands

```bash
composer install               # PHP deps
npm install                    # JS deps

php artisan serve              # Laravel dev server (port 8000)
npm run dev                    # Vite dev server (HMR)
npm run build                  # Production Vite bundle

php artisan migrate            # Apply migrations
php artisan migrate:fresh --seed  # Reset DB + seed
php artisan tinker             # REPL
php artisan route:list         # All routes
```

## Layout

```
app/
  Http/
    Controllers/Api/           # Storefront + customer APIs
    Controllers/Api/Admin/     # Admin APIs (auth:web)
  Mail/                        # Mailables (welcome, order receipt, LUXE digest, ...)
  Models/                      # Eloquent models
  Services/                    # Domain services
    AI/                        # LUXE shopping agent (Gemini)
      Tools/                   # 12 tool handlers
      ShoppingAgent.php        # Tool-use loop
      GeminiService.php        # REST API wrapper
      AiConfig.php             # LUXE prompts + config
    Blits/                     # Loyalty
    Shipping/                  # Tracking / packages
    Notifications.php          # Polymorphic customer/admin notifications
    Paynow/                    # Payment provider
database/migrations/           # All migrations (numeric-prefixed)
resources/
  js/
    storefront/                # Vue SPA — /shop, /account, /checkout, LUXE widget
    admin/                     # Vue SPA — /admin
    lib/api.js                 # Shared fetch wrapper (CSRF-aware)
  views/
    store.blade.php            # Storefront shell (SEO meta injected)
    admin.blade.php            # Admin shell
    mail/                      # Blade email templates
routes/
  api.php                      # /api/store, /api/account, /api/admin
  web.php                      # SPA catch-all + sitemap.xml
public/
  logo.png, icon.png, robots.txt
  ai/                          # Nano Banana output (generated images)
  uploads/                     # Admin-uploaded product images
```

## Key architecture

### Storefront ↔ Admin ↔ API

- **Two SPAs** compiled by Vite: `resources/js/storefront/` and `resources/js/admin/`. Each has its own Vue Router.
- **All APIs under `routes/api.php`** with three groupings:
  - `/api/store/*` — public + session-backed storefront (headings, catalogues, products, cart, checkout, agent, payments)
  - `/api/account/*` — signed-in customer surfaces (orders, wishlist, addresses, notifications, returns, agent)
  - `/api/admin/*` — signed-in admin (`auth:web` guard)
- **`web.php`** hosts the SPA catch-all via [SeoController::spa](app/Http/Controllers/SeoController.php), which fills OG/Twitter/JSON-LD tags server-side before the SPA hydrates.

### Auth

- Two guards: `customer` (Sanctum-style session, storefront) and `web` (admin).
- Admin users have `role` (admin/staff) and `is_active` columns.
- Customer email verification via signed URLs; password reset via [customer_password_reset_tokens](database/migrations/2026_01_01_000091_create_customer_password_reset_tokens.php) with 60-minute hashed tokens.

### Payments

- Paynow web integration in [PaynowController](app/Http/Controllers/Api/PaynowController.php). SHA512 hash signing, IPN + return URL flow, session-backed cart, Blits loyalty accrual on paid orders.

### AI (LUXE)

- **Gemini 2.5 Flash** for text + tool use. **Gemini Live** (WebSocket) for real-time voice. **Nano Banana** for image generation.
- Prompts + model config in [AiConfig](app/Services/AI/AiConfig.php). Same `LUXE_BASE_PROMPT` powers text and voice.
- 12 tools in [app/Services/AI/Tools/](app/Services/AI/Tools/): search/view/inventory, cart/wishlist, order/discount, recommendations, browse, create-order handoff, email digest, reminder subscriptions.
- Chat + voice widget: [ChatWidget.vue](resources/js/storefront/components/ChatWidget.vue) + [gemini-live.js](resources/js/storefront/lib/gemini-live.js). Voice tool calls forwarded to Laravel via `POST /api/store/agent/execute-tool` (no JS tool duplication).
- Admin: LUXE advisor on `/admin/reports`, "✨ LUXE write" description button on ProductEditor, full `/admin/ai` studio (prompt suggest → Nano Banana render).
- Env: `GOOGLE_AI_API_KEY`, `GEMINI_MODEL`, `GEMINI_LIVE_MODEL`.

### Notifications

- Polymorphic [notifications](database/migrations/2026_01_01_000080_create_notifications.php) table (`recipient_type` = customer|admin). Fires on order paid, refund, affiliate sale, affiliate payout, low stock, return status, admin application. Bells poll every 45–60s.

### Returns / RMA

- 30-day return window from paid orders. Customer files via Account → Returns tab; admin reviews at `/admin/returns` with a side-drawer decision form. Full refund flips the source order to `refunded`.

## Default admin

Email: `admin@blessluxe.com` · Password: `admin123` (via `php artisan db:seed`). **Change immediately in non-local deploys.**

## Notes

- **MySQL** — not Postgres. `ai_customer_memories` uses `FULLTEXT` (not pgvector) for memory recall.
- **Session-scoped carts** — the `carts` table has no `customer_id`; carts are keyed by `session()->get('cart_id')` (matches [CartController](app/Http/Controllers/Api/CartController.php)).
- **Storefront affiliate landing** — `/affiliate` (marketing), `/affiliate/apply` (application form), `/affiliate/shop/:code` (attribution deep-link), `/affiliate/:code/dashboard` (signed-in owner only).
- **Sitemap** — `/sitemap.xml` (dynamic, all published products + headings + catalogues), `/public/robots.txt` blocks admin/api/checkout.
