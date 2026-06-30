<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Catalogue;

class CatalogueController extends Controller
{
    public function index()
    {
        return [
            'catalogues' => Catalogue::query()
                ->where('is_active', true)
                ->with('heading:id,name,handle,is_sale')
                ->orderBy('rank')
                ->get(['id', 'name', 'handle', 'heading_id', 'rank', 'thumbnail'])
                ->map(fn ($c) => [
                    'id'        => $c->id,
                    'name'      => $c->name,
                    'handle'    => $c->handle,
                    'thumbnail' => $c->thumbnail,
                    'rank'      => $c->rank,
                    'heading'   => $c->heading ? [
                        'name'    => $c->heading->name,
                        'handle'  => $c->heading->handle,
                        'is_sale' => (bool) $c->heading->is_sale,
                    ] : null,
                ]),
        ];
    }

    public function show(string $idOrHandle)
    {
        $catalogue = Catalogue::query()
            ->where('handle', $idOrHandle)
            ->orWhere('id', $idOrHandle)
            ->with('heading:id,name,handle,is_sale')
            ->first();

        if (! $catalogue) {
            return response()->json(['error' => 'Catalogue not found'], 404);
        }

        return [
            'catalogue' => [
                'id'          => $catalogue->id,
                'name'        => $catalogue->name,
                'handle'      => $catalogue->handle,
                'description' => $catalogue->description,
                'thumbnail'   => $catalogue->thumbnail,
                'heading'     => $catalogue->heading ? [
                    'name'    => $catalogue->heading->name,
                    'handle'  => $catalogue->heading->handle,
                    'is_sale' => (bool) $catalogue->heading->is_sale,
                ] : null,
            ],
        ];
    }
}
