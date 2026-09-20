<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Heading;

class HeadingController extends Controller
{
    /**
     * GET /api/store/headings
     *
     * Storefront navigation source. Returns active headings ordered by rank,
     * each with its catalogues attached. The shape matches what the Vue
     * <Header> component expects: a flat array the menu maps over.
     */
    public function index(\Illuminate\Http\Request $request)
    {
        // Browsing an affiliate's hand-picked shop: a category with none of
        // their pieces in it is a tile (and a menu entry) that leads to an empty
        // page. null = not curated = show everything.
        $curated = \App\Services\AffiliatePricing::curatedProductIds(
            \App\Services\AffiliatePricing::viewing($request)
        );
        $hasTheirs = fn ($q) => $q->whereHas('products', fn ($p) => $p->whereIn('products.id', $curated));

        $headings = Heading::query()
            ->where('is_active', true)
            ->when($curated !== null, fn ($q) => $q->whereHas('catalogues', $hasTheirs))
            ->with([
                'catalogues' => fn ($q) => $q
                    ->when($curated !== null, $hasTheirs)
                    ->where('is_active', true)
                    ->orderBy('rank')
                    ->select('id', 'heading_id', 'name', 'handle', 'rank'),
            ])
            ->orderBy('rank')
            ->get(['id', 'name', 'handle', 'rank', 'is_sale', 'image_url']);

        return [
            'headings' => $headings->map(fn ($h) => [
                'id'      => $h->id,
                'name'    => $h->name,
                'handle'  => $h->handle,
                'rank'    => $h->rank,
                'is_sale' => (bool) $h->is_sale,
                'image_url' => $h->image_url,
                'catalogues' => $h->catalogues->map(fn ($c) => [
                    'id'     => $c->id,
                    'name'   => $c->name,
                    'handle' => $c->handle,
                    'rank'   => $c->rank,
                ]),
            ]),
        ];
    }
}
