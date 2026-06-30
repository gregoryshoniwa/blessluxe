<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| BlessLuxe API
|--------------------------------------------------------------------------
|
| Mirrors the Express `shop-backend` surface so the Vue SPA can hit
| /api/products, /api/cart, etc. just like the Next.js storefront hit the
| Express `/store/*` routes. Endpoints are stubs for now — Milestone 2
| (schema port) and Milestone 3 (catalogue read paths) flesh them out.
|
*/

Route::prefix('store')->group(function () {
    Route::get('/health', fn () => ['ok' => true, 'backend' => 'laravel']);

    // Catalogue — to be implemented in Milestone 3 against MySQL models.
    Route::get('/products', fn () => ['products' => [], 'count' => 0]);
    Route::get('/products/{handle}', fn (string $handle) => ['product' => null, 'handle' => $handle]);
    Route::get('/headings', fn () => ['headings' => []]);
    Route::get('/catalogues', fn () => ['catalogues' => []]);
});

Route::prefix('account')->group(function () {
    Route::get('/me', fn () => ['customer' => null]);
});

Route::prefix('admin')->group(function () {
    Route::get('/ping', fn () => ['ok' => true]);
});
