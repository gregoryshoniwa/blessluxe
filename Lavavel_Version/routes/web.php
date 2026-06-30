<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Admin shell — every /admin/* path renders the admin Blade, which mounts
| the admin Vue SPA. Vue Router resolves the actual page (dashboard,
| products, customers, etc.) client-side.
|--------------------------------------------------------------------------
*/
Route::get('/admin/{any?}', fn () => view('admin'))
    ->where('any', '.*')
    ->name('admin');

/*
|--------------------------------------------------------------------------
| Storefront — catch-all for everything else (cart, shop, product detail,
| account, checkout, etc.). Renders the storefront Blade which mounts the
| storefront Vue SPA.
|
| The negative lookahead keeps /admin and /api from leaking in here.
|--------------------------------------------------------------------------
*/
Route::get('/{any?}', fn () => view('store'))
    ->where('any', '^(?!admin|api).*$')
    ->name('store');
