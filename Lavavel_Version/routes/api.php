<?php

use App\Http\Controllers\Api\AccountController;
use App\Http\Controllers\Api\AffiliateController;
use App\Http\Controllers\Api\CustomerAddressController;
use App\Http\Controllers\Api\ReturnController;
use App\Http\Controllers\Api\Admin\AdminPackController;
use App\Http\Controllers\Api\BlitsController;
use App\Http\Controllers\Api\ContentController;
use App\Http\Controllers\Api\NotificationsController;
use App\Http\Controllers\Api\PackController;
use App\Http\Controllers\Api\TrackingController;
use App\Http\Controllers\Api\WishlistController;
use App\Http\Controllers\Api\Admin\AdminAffiliateController;
use App\Http\Controllers\Api\Admin\AdminAnnouncementController;
use App\Http\Controllers\Api\Admin\AdminAuthController;
use App\Http\Controllers\Api\Admin\AdminBlitsController;
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

    Route::get('/headings',                [HeadingController::class,   'index']);
    Route::get('/catalogues',              [CatalogueController::class, 'index']);
    Route::get('/catalogues/{idOrHandle}', [CatalogueController::class, 'show']);
    Route::get ('/products',                [ProductController::class, 'index']);
    Route::post('/products/batch',          [ProductController::class, 'batch']);
    Route::get ('/products/{handle}/related', [ProductController::class, 'related']);
    Route::get ('/products/{handle}',       [ProductController::class, 'show']);

    // Public content (no session needed).
    Route::get('/announcements', [ContentController::class, 'announcements']);
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
        Route::post ('/affiliate/apply',            [AffiliateController::class, 'apply']);

        // Pack campaigns (group buy). Reservation needs a logged-in customer,
        // enforced inside the controller so we can return 401 with the
        // SPA-friendly JSON shape.
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

    // Blits loyalty (per signed-in customer; guests get a polite null).
    Route::get ('/blits',         [BlitsController::class, 'index']);
    Route::post('/blits/preview', [BlitsController::class, 'preview']);

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

    // Returns / RMA.
    Route::get ('/returns',       [ReturnController::class, 'index']);
    Route::post('/returns',       [ReturnController::class, 'store']);
    Route::get ('/returns/{id}',  [ReturnController::class, 'show']);
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

        Route::get   ('/regions',       [AdminRegionController::class, 'index']);
        Route::post  ('/regions',       [AdminRegionController::class, 'store']);
        Route::put   ('/regions/{id}',  [AdminRegionController::class, 'update']);
        Route::delete('/regions/{id}',  [AdminRegionController::class, 'destroy']);

        Route::get('/blits', [AdminBlitsController::class, 'index']);
        Route::put('/blits', [AdminBlitsController::class, 'update']);

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

        // Orders + refund flow.
        Route::get ('/orders',                  [AdminOrderController::class, 'index']);
        Route::get ('/orders/{id}',             [AdminOrderController::class, 'show']);
        Route::post('/orders/{id}/refund',      [AdminOrderController::class, 'refund']);

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

        // Reports + CSV exports.
        Route::get('/reports/sales',      [AdminReportsController::class, 'sales']);
        Route::get('/reports/customers',  [AdminReportsController::class, 'customers']);
        Route::get('/reports/affiliates', [AdminReportsController::class, 'affiliates']);
        Route::get('/exports/orders',     [AdminReportsController::class, 'exportOrders']);
        Route::get('/exports/customers',  [AdminReportsController::class, 'exportCustomers']);
        Route::get('/exports/products',   [AdminReportsController::class, 'exportProducts']);
    });
});
