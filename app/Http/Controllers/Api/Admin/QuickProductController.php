<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Services\QuickSeries;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Admin → Quick process → Products: single pieces sold one at a time, each
 * size its own variant. Products created as a series here are left out —
 * they live on the Series tab. Reading a post uses the same reader as Series.
 */
class QuickProductController extends Controller
{
    /** GET /api/admin/quick/products?q=&status=&heading=&origin=&sourcing=&page=&per= */
    public function index(Request $request)
    {
        $q = trim((string) $request->query('q', ''));
        [$heading, $origin, $per] = QuickSeriesController::filters($request);
        $status = in_array($request->query('status'), ['published', 'draft'], true) ? $request->query('status') : null;
        $sourcing = in_array($request->query('sourcing'), ['local', 'import'], true) ? $request->query('sourcing') : null;

        $rows = DB::table('products as p')
            ->leftJoin('suppliers as s', 's.id', '=', 'p.supplier_id')
            // Hide only products that were made AS a series here — a shop product can
            // also run as a series and still sells piece by piece.
            ->where(fn ($w) => $w->whereNull('p.metadata->created_by')->orWhere('p.metadata->created_by', '!=', 'quick_series'))
            ->when($q !== '', fn ($w) => $w->where(fn ($x) => $x->where('p.title', 'like', "%{$q}%")->orWhere('p.handle', 'like', "%{$q}%")->orWhere('s.name', 'like', "%{$q}%")))
            ->when($status, fn ($w) => $w->where('p.status', $status))
            ->when($sourcing, fn ($w) => $w->where('p.sourcing', $sourcing))
            ->when($heading, fn ($w) => QuickSeriesController::inHeading($w, 'p.id', $heading))
            ->when($origin, fn ($w) => $w->where('p.origin_country', $origin))
            ->orderByDesc('p.created_at')->orderByDesc('p.id')
            ->select('p.id', 'p.title', 'p.handle', 'p.status', 'p.sourcing', 'p.thumbnail', 'p.origin_country', 'p.created_at', 'p.purchases_count', 's.name as supplier')
            ->selectSub(fn ($x) => $x->from('product_variants')->whereColumn('product_id', 'p.id')->selectRaw('count(*)'), 'sizes')
            ->selectSub(fn ($x) => $x->from('product_variants')->whereColumn('product_id', 'p.id')->where('manage_inventory', true)->selectRaw('sum(inventory_quantity)'), 'stock')
            ->selectSub(fn ($x) => $x->from('product_variants')->whereColumn('product_id', 'p.id')->selectRaw('min(cost_price)'), 'cost')
            ->selectSub(fn ($x) => $x->from('variant_prices as vp')->join('product_variants as v', 'v.id', '=', 'vp.variant_id')->whereColumn('v.product_id', 'p.id')->where('vp.currency_code', 'usd')->selectRaw('min(vp.amount)'), 'price')
            ->paginate($per);

        // Department names, one query for the page.
        $depts = DB::table('product_catalogue_map as m')->join('catalogues as c', 'c.id', '=', 'm.catalogue_id')->join('headings as h', 'h.id', '=', 'c.heading_id')
            ->whereIn('m.product_id', collect($rows->items())->pluck('id'))->get(['m.product_id', 'h.name as heading', 'c.name as catalogue'])
            ->groupBy('product_id');

        return [
            'rows' => collect($rows->items())->map(fn ($r) => [
                'id'         => $r->id,
                'title'      => $r->title,
                'handle'     => $r->handle,
                'status'     => $r->status,
                'sourcing'   => $r->sourcing,
                'thumbnail'  => $r->thumbnail,
                'supplier'   => $r->supplier,
                'origin'     => $r->origin_country,
                'where'      => optional($depts->get($r->id)?->first(), fn ($d) => "{$d->heading} › {$d->catalogue}"),
                'sizes'      => (int) $r->sizes,
                'stock'      => $r->sourcing === 'local' ? (int) $r->stock : null,
                'sold'       => (int) $r->purchases_count,
                'cost'       => $r->cost !== null ? (int) $r->cost : null,
                'price'      => $r->price !== null ? (int) $r->price : null,
                'created_at' => Carbon::parse($r->created_at)->toIso8601String(),
                'link'       => url("/shop/{$r->handle}"),
            ]),
            'page' => $rows->currentPage(), 'last_page' => $rows->lastPage(), 'total' => $rows->total(), 'per' => $per,
            'from' => $rows->firstItem(), 'to' => $rows->lastItem(),
        ];
    }

    /** POST /api/admin/quick/products  (multipart: fields + images[]) */
    public function store(Request $request)
    {
        foreach (['sizes', 'stock', 'supplier', 'catalogue_ids'] as $k) {
            if (is_string($request->input($k))) $request->merge([$k => json_decode($request->input($k), true)]);
        }
        $publish = $request->boolean('publish');

        $d = $request->validate([
            'title'          => ['required', 'string', 'max:120'],
            'description'    => ['nullable', 'string', 'max:3000'],
            'cost'           => ['required', 'numeric', 'min:0.5', 'max:10000'],
            'margin'         => ['required', 'integer', 'min:0', 'max:500'],
            'fixed'          => ['nullable', 'numeric', 'min:0', 'max:10000'],   // dollars added per piece
            'single_price'   => ['nullable', 'numeric', 'min:0', 'max:10000'],
            'reference'      => ['nullable', 'string', 'max:60'],
            'ai_cost'        => ['nullable', 'numeric', 'min:0', 'max:5'],
            'supplier'       => ['nullable', 'array'],
            'supplier.id'    => ['nullable', 'string', 'exists:suppliers,id'],
            'supplier.name'  => ['nullable', 'string', 'max:120'],
            'supplier.phone' => ['nullable', 'string', 'max:40'],
            'supplier.link'  => ['nullable', 'string', 'max:300'],
            'origin'         => ['nullable', Rule::in(array_keys(QuickSeries::ORIGINS))],
            'sourcing'       => ['required', Rule::in(['local', 'import'])],
            'sizes'          => ['nullable', 'array', 'max:30'],
            'sizes.*'        => ['string', 'max:20'],
            'stock'          => ['nullable', 'array'],
            'stock.*'        => ['integer', 'min:0', 'max:100000'],
            'catalogue_ids'  => ['nullable', 'array'],
            'catalogue_ids.*' => ['string', 'exists:catalogues,id'],
            'images'         => [$publish ? 'required' : 'nullable', 'array', 'max:10'],
            'images.*'       => ['file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:20480'],
        ], ['images.required' => 'Add at least one photo — a piece without a picture won\'t sell.']);

        return QuickSeries::createProduct($d + ['publish' => $publish, 'kind' => 'product'], $request->file('images') ?? []);
    }
}
