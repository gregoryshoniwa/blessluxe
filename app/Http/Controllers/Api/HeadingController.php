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
    public function index()
    {
        $headings = Heading::query()
            ->where('is_active', true)
            ->with([
                'catalogues' => fn ($q) => $q
                    ->where('is_active', true)
                    ->orderBy('rank')
                    ->select('id', 'heading_id', 'name', 'handle', 'rank'),
            ])
            ->orderBy('rank')
            ->get(['id', 'name', 'handle', 'rank', 'is_sale']);

        return [
            'headings' => $headings->map(fn ($h) => [
                'id'      => $h->id,
                'name'    => $h->name,
                'handle'  => $h->handle,
                'rank'    => $h->rank,
                'is_sale' => (bool) $h->is_sale,
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
