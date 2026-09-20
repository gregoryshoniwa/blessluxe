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
    Bees/                     # Loyalty
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
- **Storefront sign-in state** lives in [auth-store.js](resources/js/storefront/auth-store.js) — one answer shared by the header and the router guard. Login/Signup call `authStore.refresh()`, logout calls `authStore.clear()` (the header is a long-lived SPA component and never finds out otherwise). Members-only menu entries (Show Room) are `v-if="signedIn"`; routes use `meta: { requiresAuth: true }`. It decides what to draw and where to route — the APIs enforce the session themselves.
- Customer email verification via signed URLs; password reset via [customer_password_reset_tokens](database/migrations/2026_01_01_000091_create_customer_password_reset_tokens.php) with 60-minute hashed tokens.

### Payments

- Paynow web integration in [PaynowController](app/Http/Controllers/Api/PaynowController.php). SHA512 hash signing, IPN + return URL flow, session-backed cart, Bees loyalty accrual on paid orders.

### AI (LUXE)

- **Gemini 2.5 Flash** for text + tool use. **Gemini Live** (WebSocket) for real-time voice. **Nano Banana** for image generation.
- Prompts + model config in [AiConfig](app/Services/AI/AiConfig.php). Same `LUXE_BASE_PROMPT` powers text and voice.
- 12 tools in [app/Services/AI/Tools/](app/Services/AI/Tools/): search/view/inventory, cart/wishlist, order/discount, recommendations, browse, create-order handoff, email digest, reminder subscriptions.
- Chat + voice widget: [ChatWidget.vue](resources/js/storefront/components/ChatWidget.vue) + [gemini-live.js](resources/js/storefront/lib/gemini-live.js). Voice tool calls forwarded to Laravel via `POST /api/store/agent/execute-tool` (no JS tool duplication).
- Admin: LUXE advisor on `/admin/reports`, "✨ LUXE write" description button on ProductEditor, full `/admin/ai` studio (prompt suggest → Nano Banana render).
- Env: `GOOGLE_AI_API_KEY`, `GEMINI_MODEL`, `GEMINI_LIVE_MODEL`.

### Realtime (Reverb), messaging + calling

- **Laravel Reverb** websocket server. Locally: `php artisan reverb:start`. It is a *separate process* — if it isn't running, everything still works, it just falls back to polling.
- Broadcast events **must implement `ShouldBroadcastNow`, never `ShouldBroadcast`**. No queue worker runs in production, so a queued broadcast sits in `jobs` forever. This passes locally because `composer dev` runs `queue:listen` — the failure only appears once deployed. Broadcast HTTP calls are capped by `client_options` timeouts in [broadcasting.php](config/broadcasting.php).
- **Channel auth goes through the `realtime` guard** ([AppServiceProvider](app/Providers/AppServiceProvider.php)), and every channel in [routes/channels.php](routes/channels.php) must pass `['guards' => ['realtime']]`. Without it Laravel resolves the user from the default `web` guard *before* the callback runs, so a customer-only session gets a 403 and silently polls forever. The SPA sends `as=admin|affiliate` so one browser holding both sessions joins as the right one. Test real sessions with `withSession()`, **not `actingAs()`** — that switches the default guard and hides the bug. Pinned by `BroadcastChannelAuthTest`.
- [realtime.js](resources/js/lib/realtime.js) — lazy Echo loader, presence + private channels, refcounted subscriptions. **Managed Reverb bills by peak concurrent connections**, so a socket only exists while someone is inside a conversation and is closed ~20s after the last subscriber leaves. Never connect on page load.
- [conversation.js](resources/js/lib/conversation.js) — ALL chat behaviour for both inboxes (window → deltas, scrollback, socket/poll/POST de-duplication by id, ticks, presence, adaptive poll backoff, no read-marking in a hidden tab). [ChatThread.vue](resources/js/components/ChatThread.vue) is presentation, [ChatShell.vue](resources/js/components/ChatShell.vue) is the list/conversation/full-screen frame (one tree in both modes — slots are never remounted, which would drop a live call).
- [Messages](app/Services/Messages.php) is built so cost tracks what's on screen, not table size:
  - threads load as a **window of 50**, page back with `?before=ID`, poll with `?after=ID` (keyset on `(created_at, id)`; ids are **ULIDs** so same-second messages stay ordered). `?peek=1` reads without marking read.
  - sends return `{message}`, never the thread.
  - the admin list sorts on indexed `affiliates.last_message_at` (maintained in `post()`), is paged, and searches/filters **server-side**. It is one query regardless of thread count — `MessagingScaleTest` asserts that.
  - every message is published to `presence-affiliate.{id}` **and** `private-admin.inbox`, so the admin list is live from one subscription instead of one per affiliate.
  - notifications fire once per unread burst, not per message (each is a row per admin).
  - all timestamps leave the API as ISO-8601 with an offset — a bare datetime is parsed by browsers as local time.
- **"@" product references** — [MentionPicker.vue](resources/js/components/MentionPicker.vue) + [MessageRefs](app/Services/MessageRefs.php). Typing `@` at the start of a word (or the @ button) opens a searchable, paged panel tabbed All · Packs · the shop's headings. The client sends only `{type, id}`; the server re-reads each item and stores a **snapshot** in `affiliate_messages.refs` (no catalogue join on thread reads, and the conversation keeps the price that was discussed). **Never accept title/price/thumbnail from the client** — the card renders with the brand's authority. Affiliates see their own exclusives but never another's (the global `ExclusivityScope` keys off the storefront being browsed, so it is bypassed here and the rule applied explicitly); admin sees everything. Cards link by handle and open in a new tab: `/shop/:handle` for customers, the product editor for staff. Both sides can send photos; uploads are named from the **detected** type, never the client's filename. A message may be text, photos, products, or any mix — but not empty.
- **Voice/video calls** — [webrtc.js](resources/js/lib/webrtc.js) + [CallPanel.vue](resources/js/components/CallPanel.vue). Signalling rides presence-channel *client events* (whispers); no server code and no tables. Render exactly **one** `CallPanel` per channel — two would both ring.
- ICE servers come from `GET /api/{account,admin}/rtc/ice` ([Rtc](app/Services/Rtc.php)), **never from the bundle** — TURN credentials are billable and are issued short-lived via HMAC when `TURN_SECRET` is set. Without `TURN_URL`, ~15–20% of networks can't connect a call; the UI says so.
- **The socket is optional and the provider is an env choice** (`BROADCAST_CONNECTION` + `VITE_REALTIME_DRIVER` = `reverb` | `pusher` | `none`; see the block in `.env.example`). Polling alone carries everything except typing/online/calls, at ~4 indexed queries per quiet poll. The zero-fee production setup is a free Pusher-protocol tier (100–200 concurrent connections) with overflow falling back to polling: [realtime.js](resources/js/lib/realtime.js) exposes `onRealtimeStatus()`, and a dropped or refused socket flips the conversation back to fast polling and hides the call buttons.
- **Scaling path:** Laravel Cloud managed WebSockets (size the cluster to peak *open conversations*, not users). Self-hosted: one node tops out near 1,000 connections on `stream_select` — install `ext-uv`, raise `ulimit -n`/`minfds`; beyond one node set `REVERB_SCALING_ENABLED=true` with a shared Redis. Group calls/live video need an SFU (LiveKit) — mesh WebRTC stops at ~4 people.

### Notifications

- Polymorphic [notifications](database/migrations/2026_01_01_000080_create_notifications.php) table (`recipient_type` = customer|admin). Fires on order paid, refund, affiliate sale, affiliate payout, low stock, return status, admin application. Bells poll every 45–60s.

### Returns / RMA

- 30-day return window from paid orders. Customer files via Account → Returns tab; admin reviews at `/admin/returns` with a side-drawer decision form. Full refund flips the source order to `refunded`.

### Bless Hive (the community) — `/hive`, `/@handle`

Plan, research and phase gates: [docs/bless-pages-plan.md](docs/bless-pages-plan.md). Built: pages, fit + Fit Twins, Looks, follow, feed, comments, Ask (votes, answers, accepted answers that earn Bees), Activity, Discover, reports.

- **The Hive is its own full-screen app, not a shop page.** Routes with `meta: { shell: 'hive' }` make [App.vue](resources/js/storefront/App.vue) render [HiveShell](resources/js/storefront/components/hive/HiveShell.vue) *instead of* the announcement bar, header, footer and LUXE launcher: left rail on desktop; on phones just the mark + HIVE (it scrolls away — **no icons up there**, the owner asked) and a solid bottom tab bar: Home · Ask · + · Activity · My page. Discover is the search button on Home; "Back to the shop" is on My page and Discover. Bars are opaque on purpose (translucent ones made posts look like they ran underneath). The wordmark is the brand icon (`public/hive-mark.png`, cropped from `icon.png`) + "HIVE", never the script word. The shell owns the one look composer and the one 18+ gate — pages call `hiveStore.compose()` and listen for `blessluxe:hive-posted`; never mount another. `body.in-hive` is set while inside (toasts lift above the tab bar). New Hive pages just need the meta flag.

- **Every customer has a page.** There is no creator sign-up: [Hive::profile()](app/Services/Hive.php) creates the `hive_profiles` row the first time it's needed. An active affiliate's shop appears as that page's **Shop** tab — affiliate is an upgrade, not a different account.
- **Reading is public, acting is not.** `/api/store/hive/*` (feed, pages) needs no account so WhatsApp links land on something. `/api/account/hive/*` needs a signed-in member, and post/like/follow also need the one-time **18+ confirmation** (403 with `needs: adult_confirmation`). On the client every action goes through `hiveStore.ready()` in [hive-store.js](resources/js/storefront/hive-store.js), which opens the login page or the [HiveGate](resources/js/storefront/components/hive/HiveGate.vue) sheet.
- **Measurements are private by default** and only ever leave the server through `Hive::present()`: `private` → nothing; `twins` → match % + sizes/shape, never the tape-measure numbers; `public` → everything. Don't build a second serializer for profiles.
- **Like counts are visible to the author only** (`Hive::presentLook`). Deliberate — do not add a public tally.
- **Product tags reuse chat's `MessageRefs::resolve`** — the client sends `{type,id}`, the catalogue writes title/price/thumbnail.
- **Data-light:** photos are shrunk in the browser to 1080px WebP ([image-resize.js](resources/js/lib/image-resize.js)) before upload; nothing autoplays. Files go through `Media` under `hive/looks/{customer_id}` and `hive/avatars`.
- **Moderation:** one report per person per thing; 3 distinct reporters hide a look pending review, a `minor` report hides it at once. Comments, asks and answers are reportable on the same rules (`HiveTalk::reported`); you can't report your own. Staff queue at `/admin/hive` ([AdminHiveController](app/Http/Controllers/Api/Admin/AdminHiveController.php)); its open count rides the existing `/api/admin/affiliate-inbox/unread` badge poll.
- **Comments / Ask / Activity** live in [HiveTalk](app/Services/HiveTalk.php) + [HiveTalkController](app/Http/Controllers/Api/HiveTalkController.php). An ask with ≥2 photos is a *which one?* vote: one vote each, final, and the tally is only returned once you've voted (or it's yours). **An accepted answer pays `ACCEPTED_ANSWER_BEES` via `Bees::credit` — Bees are money-like, so don't loosen `HiveTalk::accept()`:** no answering/accepting your own question, one acceptance per question and it's final, an accepted answer can't be deleted, a helper is paid at most `PAID_ACCEPTS_PER_DAY` times a day, and the same asker pays the same helper once per `SAME_PAIR_COOLDOWN_DAYS`. Past a cap the answer is still accepted, with 0 Bees.
- **Try-ons, challenges, earnings** live in [HiveRewards](app/Services/HiveRewards.php). A try-on is a look tied to one of the poster's own PAID order lines (`line_item_id`, `fit` small|true|large, `size_worn`, `rating`); the server adds the product tag itself. It pays `TRY_ON_BEES` **once per purchased line for ever** — the promise is a row in `hive_tryon_rewards`, not the look, so delete-and-repost earns nothing. Product pages show them via [ProductTryOns](resources/js/storefront/components/hive/ProductTryOns.vue) (`/api/store/hive/products/{id|handle}/tryons`): fit verdict %, then buyers, people built like the viewer first; renders nothing until there is one. Challenges (`hive_challenges`, staff-run at `/admin/hive/challenges`): state is **computed from dates, never stored** (no scheduler in production) — draft · upcoming · live · judging · awarded. `HiveRewards::award()` is final: only after the end date, entries of that challenge only, one prize per person, and `awarded_at` is claimed inside the transaction before any credit. The "Earned" tab sums ledger reasons in `HiveRewards::REASONS` only; its `worth_label` is formatted server-side.
- **"For you" is ranked, Following is by date** (`Hive::ranked`). Ranking and paging fight each other, so the cursor FREEZES the candidate set: `r.<anchor>.<offset>` = the newest `RANK_WINDOW` looks no newer than `<anchor>`, scored (freshness, follows, fit-twin match, real try-on, conversation — comments count double — then a spacing penalty per extra look by the same person), sliced at `<offset>`. Looks that arrive mid-scroll don't enter it. When the window is used up the cursor becomes a plain look id and the feed continues by date. One indexed 300-row query per page; precompute only past ~50k looks/day.
- **Video looks** — no video service (that's a monthly bill): [video-compress.js](resources/js/lib/video-compress.js) re-records the clip in the poster's browser at 480px into H.264+AAC MP4 (WebM fallback), ≤30s, sized to fit `options.video.max_bytes` — which is OUR cap or PHP's `upload_max_filesize`/`post_max_size` if lower, so a small host limit means a lower bitrate, not a failed upload. The poster is `images[0]`, so grids/share cards/moderation need no video awareness. The card shows a cover + "Video · 8s · 420 KB" and fetches nothing until tapped; scrolling it away pauses it; nothing autoplays. **Hard-won rules in that file:** `MediaRecorder.isTypeSupported()` lies, so formats are probed by really recording half a second; Chrome's AAC encoder rejects 64 kbps (use `AUDIO_BITS`); after ANY recorder error in a page, later captured playback hangs — never provoke one; start the recorder BEFORE `play()` on a captured element or it deadlocks; never route the element through WebAudio. `window.__clipDebug = true` traces a failing phone.
- **Looks from links** — a look is photos, OR one clip, OR one post from another platform. [HiveEmbeds](app/Services/HiveEmbeds.php) recognises only YouTube, TikTok, Instagram and Facebook post links, stores just `embed_provider` + `embed_ref`, and **builds the iframe address itself at render time** — a member's text never reaches an iframe `src` (same rule as the affiliate YouTube hero). The card shows a cover + "Tap to load from X · uses your data · X will know you viewed it" and requests nothing from that platform until tapped; the frame is sandboxed without `allow-top-navigation`. Covers exist only where a platform offers one without an API key (YouTube, TikTok) — Instagram/Facebook looks have `images: []`, so **anything rendering `images[0]` must handle its absence**. Try-ons can't be links (must be the buyer's own picture). **Picture links are COPIED, never hot-linked** ([RemoteImage](app/Services/RemoteImage.php)): IG/FB image URLs expire in days, a hot-link can be swapped after moderation, and viewers' phones would call third parties. That fetch is SSRF-guarded — https/443 only, no IPs or credentials, host resolved by us with every address required to be public, connection pinned to the vetted IP (`CURLOPT_RESOLVE`), redirects followed by hand and re-vetted, size/time caps, bytes verified as an image and re-encoded through GD to ≤1080px. Tests swap DNS via `RemoteImage::$resolver`. `POST /api/account/hive/links/inspect` only classifies/vets; the copy is made at post time so abandoned drafts leave no files, and the composer proves a picture loads before accepting it.
- **Frame shape** (`hive_looks.shape`: `tall` 9:16 · `wide` 16:9 · `post` 4:5) applies to video and linked looks. Another platform's post can't be measured from outside, so for links **the member chooses** in the composer (`HiveEmbeds::guessShape` only pre-selects) and the owner can fix it later from the look's menu → Change shape (`PUT /api/account/hive/looks/{id}/shape`). Uploaded clips send their own shape from the real video dimensions. In [LookCard](resources/js/storefront/components/hive/LookCard.vue) `tall` is capped in WIDTH (`max-w-[24.75rem]`), not height, so it stays a true 9:16 on desktop instead of becoming a letterbox.
- **Sellers (Phase 3) = approved affiliates** ([HiveSellers](app/Services/HiveSellers.php)). The owner's decision: no separate seller account, and **commission, Paynow checkout and payouts are the affiliate process unchanged** — do not add escrow, held payments or a new commission model. What the Hive adds: a verified badge (`seller` on profiles / look authors / answer authors, from `HiveSellers::map()` — one query per request, memoised on the REQUEST, never a static); a reputation built only from things a seller can't write — credited `affiliate_sales` (shown as a band, never the number) and try-ons by the buyers of those orders, the seller's own excluded; a real Shop tab (`/api/store/hive/pages/{handle}/shop`: their curated line at THEIR prices, other sellers' exclusives hidden, plus buyers' try-ons); a directory in Discover. **Attribution:** tapping a product under a seller's look/answer/shop calls `POST /api/store/hive/shop-via {look_id|answer_id|handle}` — the SERVER works out whose content it is and sets the same session `affiliate_code` a shop link sets (the browser can't name a seller); an ordinary member's tag stays a plain link. `hive_look_id` rides in the session → cart line metadata → order line, which is how the seller's Earned tab shows "looks that sold" (`HiveSellers::dashboard`); a direct shop link or clearing attribution forgets it. Closet (`/api/account/hive/closet`) is the owner's purchases, never exposed to anyone else.
- **Inside a seller's shop, product pages and grids show the seller's price** (`ProductController::shopPrice` → `AffiliatePricing::priceFor`, the same call the cart uses). Before this the page said the base price and the cart charged base + markup.
- **Installable:** `public/hive.webmanifest` + `public/hive-sw.js`. The worker is deliberately tiny — it only serves `hive-offline.html` when a navigation fails, and **caches nothing else** (a stale cached storefront with old prices is worse than no offline mode). Registered in production builds only.
- `scroll-strip` snaps children to the scrollport edge and ignores padding — a padded strip needs `scroll-px-4` or its first chip sits flush left / hidden.
- Activity = ordinary customer notifications with kinds in `HiveTalk::ACTIVITY_KINDS`, sent through `HiveTalk::notify()` (never for your own action; only when a heart/follow row is NEW, so re-tapping can't spam).
- **Rate limits use named limiters** (`hive-post`, `hive-talk`, `hive-tap`, `hive-read` in [AppServiceProvider](app/Providers/AppServiceProvider.php)), keyed per action per member. Plain `throttle:N,1` shares ONE counter per visitor across every throttled route — ten hearts used up the allowance to post. Don't use it for new Hive routes. (The rest of `routes/api.php` still does.)
- Feeds are keyset-paged on `(created_at, id)`; follower/look/like counters are denormalised and only move when a row really changed.
- Handles are URLs: `Hive::RESERVED` blocks route collisions and brand impersonation. Share-card meta for `/hive` and `/@handle` is in [SeoController](app/Http/Controllers/SeoController.php).

## Files and uploads

**Never write a file next to the code** (`public_path()`, `->move()`, `->store(…, 'public')`, `Storage::disk('public')`). Laravel Cloud rebuilds the app's disk on every deploy, so those files vanish. Everything goes through [Media](app/Services/Media.php):

- `Media::upload($file, 'dir')`, `Media::put('dir', 'ext', $bytes)`, `Media::putRender('dir', $aiResult)` → each returns **the URL to save**. Callers hand that URL back for everything else: `Media::delete($url)`, `Media::exists($url)`, `Media::asReference($url)` (for Nano Banana), `Media::isUnder($url, 'ai/affiliate-hero/'.$id)` (ownership of a folder).
- Where files live is **discovered, not configured** (`Media::diskName()`): an explicit `MEDIA_DISK` if that disk exists → else the app's default disk when it is a bucket (Laravel Cloud makes the first attached bucket the default, under whatever name was typed — production's is literally named `public`, replacing the local disk of that name) → else the local `public` disk. Don't reintroduce a setting that must match a name typed into a dashboard. The bucket is Cloudflare R2, **must be created PUBLIC**, and **never pass a visibility flag** when writing — R2 rejects it (`NotImplemented`).
- Local URLs are saved host-less (`/storage/products/x.jpg`), bucket URLs absolute. `Media::key($url)` understands every shape ever saved and returns **null for anything that isn't ours** (other hosts, `..`, odd characters) — endpoints that accept a URL from the browser rely on that.
- Stored extensions come from an allow-list keyed on the file's **bytes** (`Media::EXTENSIONS`); unknown types become `.bin`. Don't use `guessExtension()` or the client filename — a `.php`-named image came back as `php`.
- Old links keep working after the move: [MediaController](app/Http/Controllers/MediaController.php) 302-redirects `/storage/*`, `/ai/*`, `/uploads/*` to the bucket when no local file exists. `php artisan media:check` proves a bucket end to end; `php artisan media:push` copies pre-existing local files into it (idempotent, never deletes).

## Mobile standards

Both SPAs must work from **320px** up (WCAG reflow); 360 and 390 are the common phones. Shared rules live in the "Mobile standards" block at the end of [app.css](resources/css/app.css) — extend those rather than patching pages one by one:

- **Tables never stretch the page.** `:has(> table)` makes every table's existing wrapper scroll sideways; on small screens tables get a min-width so columns aren't crushed (empty-state tables are exempt). Don't add per-table `overflow-x-auto` wrappers.
- **Form fields are 16px on touch devices** (global, `!important`) — anything smaller makes iOS Safari zoom the page on focus and never zoom back.
- **Touch targets are ≥44px** on phones (`min-w-10 min-h-11`, or `w-11 h-11` with negative margin when the visual must stay small). Grow the hit area, not the icon.
- **Never use a bare `grid-cols-12 gap-N`**: the 11 gutters alone can exceed a phone's width. Use `gap-y-N gap-x-0 md:gap-x-N`, or make the grid itself `lg:grid`.
- Rows of controls (`flex` filter bars, page headers with actions) need `flex-wrap`; fixed-width fields are `w-full sm:w-72`.
- Tab strips use `.scroll-strip` (scrolls, no scrollbar, no wrapping).
- Use `dvh`, not `vh`, for anything sized to the screen — `vh` includes mobile Safari's toolbar. Full-screen panels that contain a text field must size from `visualViewport` (see [ChatShell.vue](resources/js/components/ChatShell.vue)) or the keyboard covers the field.
- Floating panels anchored to an icon (`absolute right-0 w-[360px]`) run off-screen on phones; pin them to the screen (`fixed left-2 right-2`) below `sm`.
- The admin sidebar is an off-canvas drawer below `lg` ([App.vue](resources/js/admin/App.vue)); `<main>` must keep `min-w-0`.
- A floating button in the bottom-right corner collides with any messenger's Send button — `body.has-messenger` hides the LUXE launcher.

## Default admin

Email: `admin@blessluxe.com` · Password: `admin123` (via `php artisan db:seed`). **Change immediately in non-local deploys.**

## Notes

- **MySQL** — not Postgres. `ai_customer_memories` uses `FULLTEXT` (not pgvector) for memory recall.
- **The loyalty points are called "Bees"** (renamed for trademark reasons — never write the previous name in anything a person can see: copy, emails, LUXE prompts, URLs, API paths). The code is `App\Services\Bees`, `/api/{account,admin}/bees`, `/admin/bees`, `/account?tab=bees`. **Storage deliberately still uses the old word** — tables `blits_ledger` / `blits_checkout_idempotency` / `blits_gift_*`, settings keys `blits.*`, and the `blits_debited` / `blits_refunded` keys inside `orders.metadata` and `payment_sessions.cart_snapshot`. Do not "finish the rename": refunds read `blits_debited` back off existing orders, the double-refund guard reads `blits_refunded`, and `Bees::settings()` seeds defaults for missing keys (renaming them resets the configured rates). Short-lived compat shims for the old API paths, the old checkout field and old `?tab=` / `/admin/` links are marked for deletion a few weeks after the rename ships.
- **Session-scoped carts** — the `carts` table has no `customer_id`; carts are keyed by `session()->get('cart_id')` (matches [CartController](app/Http/Controllers/Api/CartController.php)).
- **A curated affiliate shop is curated everywhere.** `AffiliatePricing::viewing($request)` is the one definition of "whose shop is this request browsing" (session `affiliate_code`; the route MUST be in the `web` group or it silently returns null and the whole shop shows). Anything that *advertises* products goes through `AffiliatePricing::scopeToShop($query)` — the product grid, the LUXE assistant's search + recommendations. `/api/store/headings` drops categories the shop has nothing in; `/api/store/packs` returns none (packs are BLESSLUXE's own, never part of a picked line) with `hidden_by_storefront`. Opening one specific product or pack by direct link is deliberately NOT blocked. On the client, [affiliate-store.js](resources/js/storefront/affiliate-store.js) is the shared state (`curated`, `product_count`); components reload on the `blessluxe:affiliate-changed` event. Empty states are written for shoppers — never developer notes.
- **Affiliates design their own shop** (dashboard → Design): accent colour, top-bar messages and hero slides, each independently `default` | `custom` (`affiliates.hero_mode` / `top_bar_mode` / `top_bar_messages` / `theme_color`, slides in `affiliate_hero_slides` — deliberately NOT the brand's `announcements` table). Rules live in [AffiliateLook](app/Services/AffiliateLook.php): colours parse from `#RGB` / `#RRGGBB` / `rgb()` and are **darkened until white text is readable (≥3:1)**; YouTube links are reduced to the 11-char id and the embed URL is built by us; button links must be internal paths; top-bar lines are stripped/capped. **Theming = overriding Tailwind v4 theme variables** (`--color-gold`, `-dark`, `-light`, `--color-cream-dark`, `--color-blush`) on `<html>` from [affiliate-store.js](resources/js/storefront/affiliate-store.js) — every `text-gold`/`bg-gold/15` follows, so never hardcode the gold hex in a component. The look rides on the `affiliate/active` payload (no extra request); the hero comes from `/api/store/announcements` which returns the affiliate's slides inside their shop and **falls back to the brand's when custom has nothing live** (a shop never opens blank). [HeroSlideshow.vue](resources/js/storefront/components/HeroSlideshow.vue) is used by BOTH Home and the editor preview so the crop shown is the real one. The AI wizard calls Nano Banana at `16:9` (`generateImage(..., '16:9')`), is capped at `AI_DAILY_LIMIT` per affiliate per day (each render is paid) and a `generated_url` is only accepted from that affiliate's own `/ai/affiliate-hero/{id}/` folder. All limits/sizes shown in the editor come from the server's `guide`.
- **Storefront affiliate landing** — `/affiliate` (marketing), `/affiliate/apply` (application form), `/affiliate/shop/:code` (attribution deep-link), `/affiliate/:code/dashboard` (signed-in owner only).
- **Sitemap** — `/sitemap.xml` (dynamic, all published products + headings + catalogues), `/public/robots.txt` blocks admin/api/checkout.
