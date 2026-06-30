<?php

use App\Http\Controllers\SeoController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Sitemap — dynamic XML over published products / headings / catalogues.
|--------------------------------------------------------------------------
*/
Route::get('/sitemap.xml', [SeoController::class, 'sitemap'])->name('sitemap');

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
| account, checkout, etc.). The controller pre-fills meta tags so OG/
| Twitter crawlers see product titles, descriptions, images, and
| JSON-LD without running JS. The SPA still does the page itself.
|
| The negative lookahead keeps /admin and /api from leaking in here.
|--------------------------------------------------------------------------
*/
Route::get('/{any?}', [SeoController::class, 'spa'])
    ->where('any', '^(?!admin|api|sitemap\.xml).*$')
    ->name('store');
