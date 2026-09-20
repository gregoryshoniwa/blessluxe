<?php

use App\Http\Controllers\Api\AccountController;
use App\Http\Controllers\Api\AffiliateController;
use App\Http\Controllers\Api\AffiliateLookController;
use App\Http\Controllers\Api\AffiliateStorefrontController;
use App\Http\Controllers\Api\AgentController;
use App\Http\Controllers\Api\AvatarController;
use App\Http\Controllers\Api\GenerationController;
use App\Http\Controllers\Api\HiveController;
use App\Http\Controllers\Api\HiveTalkController;
use App\Http\Controllers\Api\Admin\AdminHiveController;
use App\Http\Controllers\Api\LogoController;
use App\Http\Controllers\Api\StudioController;
use App\Http\Controllers\Api\CustomerAddressController;
use App\Http\Controllers\Api\CustomerProductController;
use App\Http\Controllers\Api\ReturnController;
use App\Http\Controllers\Api\RtcController;
use App\Http\Controllers\Api\Admin\AdminPackController;
use App\Http\Controllers\Api\BeesController;
use App\Http\Controllers\Api\ContentController;
use App\Http\Controllers\Api\NotificationsController;
use App\Http\Controllers\Api\PackController;
use App\Http\Controllers\Api\TrackingController;
use App\Http\Controllers\Api\WishlistController;
use App\Http\Controllers\Api\Admin\AdminAffiliateController;
use App\Http\Controllers\Api\Admin\AdminAiController;
use App\Http\Controllers\Api\Admin\AdminAiUsageController;
use App\Http\Controllers\Api\Admin\AdminAnnouncementController;
use App\Http\Controllers\Api\Admin\AdminAuthController;
use App\Http\Controllers\Api\Admin\AdminBeesController;
use App\Http\Controllers\Api\Admin\AdminFaqController;
use App\Http\Controllers\Api\Admin\AdminNotificationsController;
use App\Http\Controllers\Api\Admin\AdminOrderController;
use App\Http\Controllers\Api\Admin\AdminPackageController;
use App\Http\Controllers\Api\Admin\AdminCatalogueController;
use App\Http\Controllers\Api\Admin\AdminCustomerController;
use App\Http\Controllers\Api\Admin\AdminDashboardController;
use App\Http\Controllers\Api\Admin\AdminHeadingController;
use App\Http\Controllers\Api\Admin\AdminInventoryController;
use App\Http\Controllers\Api\Admin\AdminProductController;
use App\Http\Controllers\Api\Admin\AdminRegionController;
use App\Http\Controllers\Api\Admin\AdminReportsController;
use App\Http\Controllers\Api\Admin\AdminReturnController;
use App\Http\Controllers\Api\Admin\AdminReviewController;
use App\Http\Controllers\Api\Admin\AdminUserController;
use App\Http\Controllers\Api\CartController;
use App\Http\Controllers\Api\CatalogueController;
use App\Http\Controllers\Api\HeadingController;
use App\Http\Controllers\Api\PaynowController;
use App\Http\Controllers\Api\ProductController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| BlessLuxe API
|--------------------------------------------------------------------------
*/

Route::prefix('store')->group(function () {
    Route::get('/health', fn () => ['ok' => true, 'backend' => 'laravel']);

    // Session-backed for the same reason as /products below: the menu and the
    // category tiles are narrowed to an affiliate's own line when browsing a
    // curated shop, and that is keyed off the session.
    Route::get('/headings',                [HeadingController::class,   'index'])->middleware('web');
    Route::get('/catalogues',              [CatalogueController::class, 'index']);
    Route::get('/catalogues/{idOrHandle}', [CatalogueController::class, 'show']);
    // These need the SESSION, not just the api stack: an affiliate storefront
    // filters the catalogue to that affiliate's own line and prices it with their
    // markup, and both are keyed off `affiliate_code` in the session. Without
    // `web` here, $request->hasSession() is false, the viewing affiliate can
    // never be resolved, and a curated shop silently shows everything.
    Route::middleware('web')->group(function () {
        Route::get ('/products',                  [ProductController::class, 'index']);
        Route::post('/products/batch',            [ProductController::class, 'batch']);
        Route::get ('/products/{handle}/related', [ProductController::class, 'related']);
        Route::get ('/products/{handle}',         [ProductController::class, 'show']);
    });

    // ─── Bless Hive — reading is public, so a page can be shared and opened
    // without an account. Session-backed so a signed-in viewer sees their own
    // likes, follows and fit-twin match.
    Route::middleware('web')->prefix('hive')->group(function () {
        Route::get('/feed',           [HiveController::class, 'feed']);
        Route::get('/pages/{handle}', [HiveController::class, 'page']);
        Route::get('/looks/{id}',          [HiveController::class, 'look']);
        Route::get('/looks/{id}/comments', [HiveTalkController::class, 'comments']);
        Route::get('/discover',            [HiveController::class, 'discover'])->middleware('throttle:hive-read');
        Route::get('/products/{productId}/tryons', [HiveController::class, 'productTryOns']);
        Route::get('/challenges',          [HiveController::class, 'challenges']);
        Route::get('/challenges/{slug}',   [HiveController::class, 'challenge']);
        Route::get('/asks',                [HiveTalkController::class, 'asks']);
        Route::get('/asks/{id}',           [HiveTalkController::class, 'ask']);
    });

    // Public content (no session needed).
    // Session-backed: inside an affiliate's shop the hero may be THEIR slides.
    Route::get('/announcements', [ContentController::class, 'announcements'])->middleware('web');
    Route::get('/faqs',          [ContentController::class, 'faqs']);

    // Public tracking — the Luhn-checked code itself is the bearer.
    Route::get('/track/{code}',  [TrackingController::class, 'show']);

    // Cart + checkout — session-backed, so they need the `web` middleware
    // group for cookies + CSRF.
    Route::middleware('web')->group(function () {
        Route::get   ('/cart',                 [CartController::class, 'show']);
        Route::post  ('/cart/line-items',      [CartController::class, 'addItem']);
        Route::put   ('/cart/line-items/{id}', [CartController::class, 'updateItem']);
        Route::delete('/cart/line-items/{id}', [CartController::class, 'removeItem']);
        Route::post  ('/cart/clear',           [CartController::class, 'clear']);

        // Affiliate attribution — resolve/clear sit on session, dashboard
        // is keyed by code (the code itself is the bearer for the read-only
        // self-service view).
        Route::post ('/affiliate/resolve',          [AffiliateController::class, 'resolve']);
        Route::get  ('/affiliate/active',           [AffiliateController::class, 'active']);
        Route::post ('/affiliate/clear',            [AffiliateController::class, 'clear']);
        Route::get  ('/affiliate/dashboard/{code}', [AffiliateController::class, 'dashboard']);
        // Applying needs a signed-in customer with a payout address; eligibility
        // tells the form what it already knows so it only asks for the rest.
        Route::get  ('/affiliate/eligibility',      [AffiliateController::class, 'eligibility']);
        // Live "is this code free?" while they type, like a username field.
        Route::get  ('/affiliate/code-available',   [AffiliateController::class, 'codeAvailable']);
        Route::post ('/affiliate/apply',            [AffiliateController::class, 'apply']);

        // Pack campaigns (group buy). Reservation needs a logged-in customer,
        // enforced inside the controller so we can return 401 with the
        // SPA-friendly JSON shape.
        // Courier choices + prices, so a buyer can compare before committing.
        Route::get  ('/couriers',                             [PackController::class, 'couriers']);

        Route::get  ('/packs',                                [PackController::class, 'index']);
        Route::get  ('/packs/{code}',                         [PackController::class, 'show']);
        Route::post ('/packs/{code}/slots/{slotId}/reserve',  [PackController::class, 'reserve']);
        Route::post ('/packs/{code}/slots/{slotId}/release',  [PackController::class, 'release']);

        // Paynow payment flow.
        Route::post('/payments/paynow/initiate', [PaynowController::class, 'initiate']);
        Route::post('/payments/paynow/ipn',      [PaynowController::class, 'ipn'])
            ->withoutMiddleware(\Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class);
        Route::get('/payments/paynow/return',    [PaynowController::class, 'return']);
        Route::get('/payments/paynow/status/{reference}', [PaynowController::class, 'status']);
        // Buys a right, not goods — deliberately outside the cart flow.
        Route::post('/payments/paynow/exclusivity/{exclusivityId}', [PaynowController::class, 'initiateExclusivity']);

        // ─── LUXE shopping agent ──────────────────────────────────────
        // Session-backed because guest carts + history live on the session.
        Route::get ('/agent/config',          [AgentController::class, 'config']);
        Route::get ('/agent/live-setup',      [AgentController::class, 'liveSetup']);
        Route::post('/agent',                 [AgentController::class, 'send']);
        Route::post('/agent/opening',         [AgentController::class, 'opening']);
        Route::post('/agent/reset',           [AgentController::class, 'reset']);
        Route::get ('/agent/history',         [AgentController::class, 'history']);
        Route::post('/agent/execute-tool',    [AgentController::class, 'executeTool']);
        Route::post('/agent/interactions',    [AgentController::class, 'interactions']);
        Route::post('/agent/memory',          [AgentController::class, 'storeMemory']);
        Route::get ('/agent/memory',          [AgentController::class, 'recallMemory']);
        Route::get ('/agent/preferences',     [AgentController::class, 'preferences']);
        Route::post('/agent/preferences',     [AgentController::class, 'setPreferences']);
        Route::get ('/agent/conversations',   [AgentController::class, 'conversations']);
    });
});

/*
|--------------------------------------------------------------------------
| Customer account
|
| These routes mutate session state, so they get the `web` middleware
| group (sessions + cookies + CSRF). The Vue side sends X-XSRF-TOKEN from
| the cookie Laravel sets on the first session-bearing response.
|--------------------------------------------------------------------------
*/
Route::middleware('web')->prefix('account')->group(function () {
    Route::get('/me',     [AccountController::class, 'me']);
    Route::get('/orders', [AccountController::class, 'orders']);
    Route::get('/orders/{orderNumber}', [AccountController::class, 'orderDetail']);
    Route::post('/signup', [AccountController::class, 'signup']);
    Route::post('/login',  [AccountController::class, 'login']);
    Route::post('/logout', [AccountController::class, 'logout']);

    // Email verification (signed URL — named route is referenced by AccountController::sendVerificationLink).
    Route::get ('/verify-email/{id}/{hash}', [AccountController::class, 'verifyEmail'])->name('customer.verify-email');
    Route::post('/verify-email/resend',      [AccountController::class, 'resendVerification']);

    // Password reset.
    Route::post('/forgot-password',  [AccountController::class, 'forgotPassword']);
    Route::post('/reset-password',   [AccountController::class, 'resetPassword']);

    // Saved addresses.
    Route::get   ('/addresses',       [CustomerAddressController::class, 'index']);
    Route::post  ('/addresses',       [CustomerAddressController::class, 'store']);
    Route::put   ('/addresses/{id}',  [CustomerAddressController::class, 'update']);
    Route::delete('/addresses/{id}',  [CustomerAddressController::class, 'destroy']);

    Route::get('/oauth/{provider}',          [AccountController::class, 'oauthRedirect']);
    Route::get('/oauth/{provider}/callback', [AccountController::class, 'oauthCallback']);

    // Bees loyalty (per signed-in customer; guests get a polite null).
    Route::get ('/bees',         [BeesController::class, 'index']);
    Route::post('/bees/preview', [BeesController::class, 'preview']);
    // Pre-rename paths, for browsers still running the previous bundle. The
    // old name is assembled rather than written so a search for it stays clean.
    // Delete a few weeks after the rename ships.
    Route::get ('/' . 'bl' . 'its',         [BeesController::class, 'index']);
    Route::post('/' . 'bl' . 'its/preview', [BeesController::class, 'preview']);

    // Wishlist (signed-in customers only).
    Route::get   ('/wishlist',              [WishlistController::class, 'index']);
    Route::post  ('/wishlist',              [WishlistController::class, 'add']);
    Route::delete('/wishlist/{productId}',  [WishlistController::class, 'remove']);
    Route::post  ('/wishlist/merge',        [WishlistController::class, 'merge']);

    // Notifications inbox.
    Route::get ('/notifications',           [NotificationsController::class, 'index']);
    Route::post('/notifications/{id}/read', [NotificationsController::class, 'markRead']);
    Route::post('/notifications/read-all',  [NotificationsController::class, 'markAllRead']);

    // Affiliate (per signed-in customer).
    Route::get ('/affiliate',               [AffiliateController::class, 'mine']);
    // Links and bio — the affiliate's own to fill in after approval, not part
    // of applying.
    Route::put ('/affiliate/profile',       [AffiliateController::class, 'updateProfile']);

    // ─── Affiliate storefront: their own shop ───────────────────────────
    Route::get ('/affiliate/gallery',       [AffiliateStorefrontController::class, 'gallery']);
    Route::get ('/affiliate/storefront',    [AffiliateStorefrontController::class, 'storefront']);
    Route::put ('/affiliate/storefront',    [AffiliateStorefrontController::class, 'updateStorefront']);
    Route::put ('/affiliate/products/{productId}',          [AffiliateStorefrontController::class, 'setProduct']);
    Route::put ('/affiliate/category-markups/{catalogueId}', [AffiliateStorefrontController::class, 'setCategoryMarkup']);
    Route::post('/affiliate/exclusivity/{productId}',       [AffiliateStorefrontController::class, 'buyExclusivity']);

    // ─── Bless Hive — my page, fit, looks, follows ─────────────────────
    Route::prefix('hive')->group(function () {
        Route::get   ('/me',                 [HiveController::class, 'mine']);
        Route::post  ('/me',                 [HiveController::class, 'update']);      // POST: carries an avatar file
        Route::put   ('/me',                 [HiveController::class, 'update']);
        Route::get   ('/handle-available',   [HiveController::class, 'handleAvailable'])->middleware('throttle:hive-read');
        Route::get   ('/twins',              [HiveController::class, 'twins']);
        Route::get   ('/tryons/eligible',    [HiveController::class, 'eligibleTryOns']);
        Route::get   ('/earnings',           [HiveController::class, 'earnings']);
        Route::get   ('/mentions',           [HiveController::class, 'mentions'])->middleware('throttle:hive-read');
        Route::post  ('/links/inspect',      [HiveController::class, 'inspectLink'])->middleware('throttle:hive-talk');
        Route::post  ('/looks',              [HiveController::class, 'storeLook'])->middleware('throttle:hive-post');
        Route::put   ('/looks/{id}/shape',   [HiveController::class, 'reshape'])->middleware('throttle:hive-talk');
        Route::delete('/looks/{id}',         [HiveController::class, 'destroyLook']);
        Route::post  ('/looks/{id}/like',    [HiveController::class, 'like'])->middleware('throttle:hive-tap');
        Route::delete('/looks/{id}/like',    [HiveController::class, 'unlike']);
        Route::post  ('/follow/{handle}',    [HiveController::class, 'follow'])->middleware('throttle:hive-tap');
        Route::delete('/follow/{handle}',    [HiveController::class, 'unfollow']);
        Route::post  ('/reports',            [HiveController::class, 'report'])->middleware('throttle:hive-post');

        Route::post  ('/looks/{id}/comments', [HiveTalkController::class, 'storeComment'])->middleware('throttle:hive-talk');
        Route::delete('/comments/{id}',       [HiveTalkController::class, 'destroyComment']);
        Route::post  ('/asks',                [HiveTalkController::class, 'storeAsk'])->middleware('throttle:hive-post');
        Route::delete('/asks/{id}',           [HiveTalkController::class, 'destroyAsk']);
        Route::post  ('/asks/{id}/vote',      [HiveTalkController::class, 'vote'])->middleware('throttle:hive-tap');
        Route::post  ('/asks/{id}/answers',   [HiveTalkController::class, 'storeAnswer'])->middleware('throttle:hive-talk');
        Route::post  ('/asks/{id}/accept',    [HiveTalkController::class, 'accept'])->middleware('throttle:hive-talk');
        Route::delete('/answers/{id}',        [HiveTalkController::class, 'destroyAnswer']);
        Route::get   ('/activity',            [HiveTalkController::class, 'activity']);
        Route::post  ('/activity/read',       [HiveTalkController::class, 'activityRead']);
    });

    // ─── Shop design: own hero slides, top-bar messages, accent colour ───
    Route::get   ('/affiliate/look',              [AffiliateLookController::class, 'show']);
    Route::put   ('/affiliate/look',              [AffiliateLookController::class, 'update']);
    Route::post  ('/affiliate/look/slides',       [AffiliateLookController::class, 'storeSlide'])->middleware('throttle:30,1');
    // Declared before {id} so "order" isn't read as a slide id.
    Route::put   ('/affiliate/look/slides/order', [AffiliateLookController::class, 'reorder']);
    Route::put   ('/affiliate/look/slides/{id}',  [AffiliateLookController::class, 'updateSlide']);
    Route::delete('/affiliate/look/slides/{id}',  [AffiliateLookController::class, 'destroySlide']);
    // A paid model call per request — throttled here AND capped per day inside.
    Route::post  ('/affiliate/look/generate',     [AffiliateLookController::class, 'generate'])->middleware('throttle:6,1');

    // Stock requests (with photos) and the conversation they land in.
    Route::get ('/affiliate/requests',      [AffiliateStorefrontController::class, 'requests']);
    Route::post('/affiliate/requests',      [AffiliateStorefrontController::class, 'storeRequest']);
    Route::get ('/affiliate/messages',      [AffiliateStorefrontController::class, 'messages']);
    // Throttled per session: a chat is a write endpoint anyone signed in can
    // hit in a loop, and every send also costs a broadcast. 30/min is far above
    // any human and far below a script.
    Route::post('/affiliate/messages',      [AffiliateStorefrontController::class, 'sendMessage'])->middleware('throttle:30,1');
    Route::post('/affiliate/messages/read', [AffiliateStorefrontController::class, 'markMessagesRead'])->middleware('throttle:60,1');
    // "@" in the composer — search the catalogue to reference a product or pack.
    Route::get ('/affiliate/mentions',      [AffiliateStorefrontController::class, 'mentions'])->middleware('throttle:120,1');

    // Voice/video call setup. Signalling itself never touches Laravel — it
    // rides client events on the presence channel — so this is the only
    // server call a browser makes to place one.
    Route::get ('/rtc/ice',                 [RtcController::class, 'ice']);

    // Returns / RMA.
    // How a pack buyer wants their piece once BLESSLUXE has it.
    Route::put ('/pack-slots/{slotId}/delivery', [AccountController::class, 'setDeliveryPreference']);

    Route::get ('/returns',       [ReturnController::class, 'index']);
    Route::post('/returns',       [ReturnController::class, 'store']);
    Route::get ('/returns/{id}',  [ReturnController::class, 'show']);

    // Show Room avatars (signed-in customers; create/edit hit Nano Banana,
    // so they're capped at 30 renders per customer per day).
    Route::get   ('/avatars',      [AvatarController::class, 'index']);
    Route::post  ('/avatars',      [AvatarController::class, 'store'])->middleware('throttle:30,1440');
    Route::put   ('/avatars/{id}', [AvatarController::class, 'update'])->middleware('throttle:30,1440');
    Route::delete('/avatars/{id}', [AvatarController::class, 'destroy']);

    // Show Room logos (embroidery / logo design studio; same daily cap).
    Route::get   ('/logos',      [LogoController::class, 'index']);
    Route::post  ('/logos',      [LogoController::class, 'store'])->middleware('throttle:30,1440');
    Route::put   ('/logos/{id}', [LogoController::class, 'update'])->middleware('throttle:30,1440');
    Route::delete('/logos/{id}', [LogoController::class, 'destroy']);

    // Show Room "My Products" (digitise the customer's own merch; same cap).
    Route::get   ('/my-products',      [CustomerProductController::class, 'index']);
    Route::post  ('/my-products',      [CustomerProductController::class, 'store'])->middleware('throttle:30,1440');
    Route::put   ('/my-products/{id}', [CustomerProductController::class, 'update'])->middleware('throttle:30,1440');
    Route::delete('/my-products/{id}', [CustomerProductController::class, 'destroy']);

    // Show Room studio (logo × product → mockups / worn shots / angle sheets /
    // adverts, optional Omni video, PDF proposal export).
    Route::get   ('/studio',          [StudioController::class, 'index']);
    Route::post  ('/studio',          [StudioController::class, 'store'])->middleware('throttle:30,1440');
    Route::post  ('/studio/proposal', [StudioController::class, 'proposal'])->middleware('throttle:20,1440');
    Route::get   ('/studio/{id}',     [StudioController::class, 'show']);
    Route::delete('/studio/{id}',     [StudioController::class, 'destroy']);

    // Show Room generations (avatar + products + environment → image/video).
    // Video runs through Omni Flash (~$1/clip), so creation is capped tighter.
    Route::get   ('/generations',      [GenerationController::class, 'index']);
    Route::post  ('/generations',      [GenerationController::class, 'store'])->middleware('throttle:20,1440');
    Route::get   ('/generations/{id}', [GenerationController::class, 'show']);
    Route::delete('/generations/{id}', [GenerationController::class, 'destroy']);
});

/*
|--------------------------------------------------------------------------
| Admin API
|
| Login/logout/me are public (so the SPA can bootstrap), everything else
| is gated behind `auth:web`. All routes share the `web` middleware group
| for sessions + CSRF.
|--------------------------------------------------------------------------
*/
Route::middleware('web')->prefix('admin')->group(function () {
    // Public auth endpoints.
    Route::get   ('/me',     [AdminAuthController::class, 'me']);
    Route::post  ('/login',  [AdminAuthController::class, 'login']);
    Route::post  ('/logout', [AdminAuthController::class, 'logout']);

    // Everything below requires a logged-in admin.
    Route::middleware('auth:web')->group(function () {
        Route::get('/dashboard', [AdminDashboardController::class, 'index']);

        Route::get   ('/headings',       [AdminHeadingController::class, 'index']);
        Route::post  ('/headings',       [AdminHeadingController::class, 'store']);
        Route::put   ('/headings/{id}',  [AdminHeadingController::class, 'update']);
        Route::delete('/headings/{id}',  [AdminHeadingController::class, 'destroy']);

        Route::get   ('/catalogues',       [AdminCatalogueController::class, 'index']);
        Route::post  ('/catalogues',       [AdminCatalogueController::class, 'store']);
        Route::put   ('/catalogues/{id}',  [AdminCatalogueController::class, 'update']);
        Route::delete('/catalogues/{id}',  [AdminCatalogueController::class, 'destroy']);

        Route::get   ('/products',                                 [AdminProductController::class, 'index']);
        Route::post  ('/products',                                 [AdminProductController::class, 'store']);
        Route::get   ('/products/{id}',                            [AdminProductController::class, 'show']);
        Route::put   ('/products/{id}',                            [AdminProductController::class, 'update']);
        Route::delete('/products/{id}',                            [AdminProductController::class, 'destroy']);
        Route::post  ('/products/{id}/variants',                   [AdminProductController::class, 'storeVariant']);
        Route::put   ('/products/{id}/variants/{vid}',             [AdminProductController::class, 'updateVariant']);
        Route::delete('/products/{id}/variants/{vid}',             [AdminProductController::class, 'destroyVariant']);
        Route::post  ('/products/{id}/images',                     [AdminProductController::class, 'uploadImage']);
        Route::post  ('/products/{id}/images/reorder',             [AdminProductController::class, 'reorderImages']);
        Route::delete('/products/{id}/images/{imageId}',           [AdminProductController::class, 'destroyImage']);
        Route::post  ('/products/{id}/video',                      [AdminProductController::class, 'setVideo']);
        Route::delete('/products/{id}/video',                      [AdminProductController::class, 'destroyVideo']);

        Route::get ('/inventory',                  [AdminInventoryController::class, 'index']);
        Route::post('/inventory/{variant}/adjust', [AdminInventoryController::class, 'adjust']);

        Route::get ('/customers',                [AdminCustomerController::class, 'index']);
        Route::post('/customers/{id}/loyalty',   [AdminCustomerController::class, 'adjustLoyalty']);

        Route::get   ('/reviews',       [AdminReviewController::class, 'index']);
        Route::put   ('/reviews/{id}',  [AdminReviewController::class, 'update']);
        Route::delete('/reviews/{id}',  [AdminReviewController::class, 'destroy']);

        Route::get   ('/affiliates',                 [AdminAffiliateController::class, 'index']);
        Route::post  ('/affiliates',                 [AdminAffiliateController::class, 'store']);
        Route::get   ('/affiliates/{id}',            [AdminAffiliateController::class, 'show']);
        Route::put   ('/affiliates/{id}',            [AdminAffiliateController::class, 'update']);
        Route::delete('/affiliates/{id}',            [AdminAffiliateController::class, 'destroy']);
        Route::post  ('/affiliates/{id}/payouts',    [AdminAffiliateController::class, 'markPaid']);
        // Affiliate <-> admin conversation, and the stock requests landing in it.
        Route::get   ('/affiliate-inbox',            [AdminAffiliateController::class, 'inbox']);
        // Bless Hive moderation.
        Route::get   ('/hive/reports',               [AdminHiveController::class, 'reports']);
        Route::put   ('/hive/reports/{id}',          [AdminHiveController::class, 'resolve']);
        Route::get   ('/hive/challenges',              [AdminHiveController::class, 'challenges']);
        Route::post  ('/hive/challenges',              [AdminHiveController::class, 'saveChallenge']);
        Route::put   ('/hive/challenges/{id}',         [AdminHiveController::class, 'saveChallenge']);
        Route::get   ('/hive/challenges/{id}/entries', [AdminHiveController::class, 'entries']);
        Route::post  ('/hive/challenges/{id}/award',   [AdminHiveController::class, 'award']);
        Route::get   ('/affiliate-inbox/unread',     [AdminAffiliateController::class, 'inboxUnread']);
        Route::get   ('/affiliate-inbox/mentions',   [AdminAffiliateController::class, 'mentions']);
        Route::get   ('/affiliates/{id}/messages',   [AdminAffiliateController::class, 'messages']);
        Route::post  ('/affiliates/{id}/messages',   [AdminAffiliateController::class, 'reply'])->middleware('throttle:120,1');
        Route::post  ('/affiliates/{id}/messages/read', [AdminAffiliateController::class, 'markMessagesRead']);
        // Admin side of a browser call — same ICE payload, admin guard.
        Route::get   ('/rtc/ice',                    [RtcController::class, 'ice']);
        Route::put   ('/affiliate-requests/{id}',    [AdminAffiliateController::class, 'resolveRequest']);

        Route::get   ('/regions',       [AdminRegionController::class, 'index']);
        Route::post  ('/regions',       [AdminRegionController::class, 'store']);
        Route::put   ('/regions/{id}',  [AdminRegionController::class, 'update']);
        Route::delete('/regions/{id}',  [AdminRegionController::class, 'destroy']);

        Route::get('/bees', [AdminBeesController::class, 'index']);
        Route::put('/bees', [AdminBeesController::class, 'update']);

        // Pack campaigns + definitions.
        Route::get   ('/packs/definitions',       [AdminPackController::class, 'indexDefinitions']);
        Route::post  ('/packs/definitions',       [AdminPackController::class, 'storeDefinition']);
        Route::delete('/packs/definitions/{id}',  [AdminPackController::class, 'destroyDefinition']);

        Route::get   ('/packs/campaigns',         [AdminPackController::class, 'indexCampaigns']);
        Route::post  ('/packs/campaigns',         [AdminPackController::class, 'launchCampaign']);
        Route::post  ('/packs/campaigns/{id}/cancel', [AdminPackController::class, 'cancelCampaign']);

        // Announcements (hero slides + top bar).
        Route::get   ('/announcements',       [AdminAnnouncementController::class, 'index']);
        Route::post  ('/announcements',       [AdminAnnouncementController::class, 'store']);
        Route::put   ('/announcements/{id}',  [AdminAnnouncementController::class, 'update']);
        Route::delete('/announcements/{id}',  [AdminAnnouncementController::class, 'destroy']);

        // FAQs.
        Route::get   ('/faqs',       [AdminFaqController::class, 'index']);
        Route::post  ('/faqs',       [AdminFaqController::class, 'store']);
        Route::put   ('/faqs/{id}',  [AdminFaqController::class, 'update']);
        Route::delete('/faqs/{id}',  [AdminFaqController::class, 'destroy']);

        // Packages (shipping & tracking).
        Route::get ('/packages',                [AdminPackageController::class, 'index']);
        Route::get ('/packages/{id}',           [AdminPackageController::class, 'show']);
        Route::put ('/packages/{id}',           [AdminPackageController::class, 'update']);
        Route::post('/packages/{id}/events',    [AdminPackageController::class, 'appendEvent']);

        // Handing pieces to buyers: in person (PIN-verified) or onward dispatch.
        Route::post('/packages/{id}/items/{itemId}/handover', [AdminPackageController::class, 'handover']);
        Route::post('/packages/{id}/items/{itemId}/dispatch', [AdminPackageController::class, 'dispatchPiece']);

        // Couriers the buyer chooses between, and their rates.
        Route::get   ('/couriers',              [AdminPackageController::class, 'couriers']);
        Route::post  ('/couriers',              [AdminPackageController::class, 'storeCourier']);
        Route::put   ('/couriers/{id}',         [AdminPackageController::class, 'updateCourier']);
        Route::delete('/couriers/{id}',         [AdminPackageController::class, 'destroyCourier']);

        // Where pack consignments ship to, and where buyers collect from.
        Route::get ('/fulfilment-settings',     [AdminPackageController::class, 'settings']);
        Route::put ('/fulfilment-settings',     [AdminPackageController::class, 'updateSettings']);

        // Orders + refund flow.
        Route::get ('/orders',                  [AdminOrderController::class, 'index']);
        Route::get ('/orders/{id}',             [AdminOrderController::class, 'show']);
        Route::post('/orders/{id}/refund',      [AdminOrderController::class, 'refund']);
        // Recovery path for an order that ended up with no parcel.
        Route::post('/orders/{id}/packages',    [AdminOrderController::class, 'createPackage']);

        // Notifications inbox (per-admin).
        Route::get ('/notifications',           [AdminNotificationsController::class, 'index']);
        Route::post('/notifications/{id}/read', [AdminNotificationsController::class, 'markRead']);
        Route::post('/notifications/read-all',  [AdminNotificationsController::class, 'markAllRead']);

        // Admin user management (admin role only).
        Route::get   ('/users',      [AdminUserController::class, 'index']);
        Route::post  ('/users',      [AdminUserController::class, 'store']);
        Route::put   ('/users/{id}', [AdminUserController::class, 'update']);
        Route::delete('/users/{id}', [AdminUserController::class, 'destroy']);

        // Returns / RMA review.
        Route::get   ('/returns',       [AdminReturnController::class, 'index']);
        Route::get   ('/returns/{id}',  [AdminReturnController::class, 'show']);
        Route::put   ('/returns/{id}',  [AdminReturnController::class, 'update']);

        // ─── Admin AI ─────────────────────────────────────────────────
        Route::post('/ai/advise',           [AdminAiController::class, 'advise']);
        Route::post('/ai/suggest-prompt',   [AdminAiController::class, 'suggestPrompt']);
        Route::post('/ai/generate-image',   [AdminAiController::class, 'generateImage']);
        Route::post('/ai/describe-product', [AdminAiController::class, 'describeProduct']);
        Route::get ('/ai-usage',            [AdminAiUsageController::class, 'index']);

        // Reports + CSV exports.
        Route::get('/reports/sales',      [AdminReportsController::class, 'sales']);
        Route::get('/reports/customers',  [AdminReportsController::class, 'customers']);
        Route::get('/reports/affiliates', [AdminReportsController::class, 'affiliates']);
        Route::get('/exports/orders',     [AdminReportsController::class, 'exportOrders']);
        Route::get('/exports/customers',  [AdminReportsController::class, 'exportCustomers']);
        Route::get('/exports/products',   [AdminReportsController::class, 'exportProducts']);
    });
});
