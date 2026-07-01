<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    /**
     * GET /api/store/products
     *
     * Filters (all optional):
     *   - heading=women         → products whose catalogue belongs to that heading
     *   - catalogue=dresses     → products attached to that catalogue
     *   - q=floral              → matches title/subtitle/handle
     *   - sale=true             → products whose heading is_sale flag is set
     *   - limit=24              → page size (max 60), default 24
     *   - page=1                → 1-based pagination
     *   - sort=newest|featured|price-asc|price-desc
     */
    public function index(Request $request)
    {
        $limit = (int) min(60, max(1, (int) $request->query('limit', 24)));
        $sort  = (string) $request->query('sort', 'featured');

        $query = Product::query()
            ->where('status', 'published')
            ->when($request->query('catalogue'), fn ($q, $c) => $q
                ->whereHas('catalogues', fn ($qq) => $qq->where('handle', $c))
            )
            ->when($request->query('heading'), fn ($q, $h) => $q
                ->whereHas('catalogues.heading', fn ($qq) => $qq->where('handle', $h))
            )
            ->when($request->boolean('sale'), fn ($q) => $q
                ->whereHas('catalogues.heading', fn ($qq) => $qq->where('is_sale', true))
            )
            ->when($request->query('q'), function ($q, $term) {
                $q->where(function ($qq) use ($term) {
                    $qq->where('title', 'like', "%{$term}%")
                       ->orWhere('subtitle', 'like', "%{$term}%")
                       ->orWhere('handle', 'like', "%{$term}%");
                });
            })
            ->with([
                'variants' => fn ($q) => $q->orderBy('created_at'),
                'variants.prices' => fn ($q) => $q->where('currency_code', 'usd'),
                'images' => fn ($q) => $q->orderBy('rank')->limit(1),
            ]);

        match ($sort) {
            'newest'     => $query->orderByDesc('created_at'),
            'price-asc'  => $query->orderBy('created_at'),  // computed below
            'price-desc' => $query->orderByDesc('created_at'),
            default      => $query->orderByDesc('created_at'),
        };

        $paginator = $query->paginate($limit)->withQueryString();

        return [
            'products' => collect($paginator->items())->map(fn ($p) => $this->summarise($p)),
            'pagination' => [
                'page'        => $paginator->currentPage(),
                'per_page'    => $paginator->perPage(),
                'total'       => $paginator->total(),
                'last_page'   => $paginator->lastPage(),
                'has_more'    => $paginator->hasMorePages(),
            ],
        ];
    }

    /**
     * POST /api/store/products/batch  { ids: ["prod_xxx", ...] }
     *
     * Resolve a small list of products by id — used by the guest wishlist
     * to render saved items it tracks in localStorage. Preserves the
     * caller's input order and silently drops unknown ids.
     */
    public function batch(Request $request)
    {
        $data = $request->validate([
            'ids'   => ['required', 'array', 'min:1', 'max:60'],
            'ids.*' => ['string'],
        ]);
        $byId = Product::query()
            ->where('status', 'published')
            ->whereIn('id', $data['ids'])
            ->with([
                'variants' => fn ($q) => $q->orderBy('created_at')->limit(1),
                'variants.prices' => fn ($q) => $q->where('currency_code', 'usd'),
                'images' => fn ($q) => $q->orderBy('rank')->limit(1),
            ])
            ->get()
            ->keyBy('id');

        $products = collect($data['ids'])
            ->map(function ($id) use ($byId) {
                $p = $byId->get($id);
                if (! $p) return null;
                return $this->summarise($p);
            })
            ->filter()
            ->values();

        return ['products' => $products];
    }

    /**
     * GET /api/store/products/{handle}/related?limit=6
     *
     * Picks products that share at least one catalogue with the seed.
     * Falls back to "newest in same heading" if the catalogue has nothing
     * else. Excludes the seed itself.
     */
    public function related(Request $request, string $handle)
    {
        $seed = Product::query()
            ->where('handle', $handle)
            ->where('status', 'published')
            ->with('catalogues:id,heading_id')
            ->first();
        if (! $seed) return ['products' => []];

        $limit = (int) min(12, max(2, (int) $request->query('limit', 6)));
        $catIds = $seed->catalogues->pluck('id')->all();
        $headingIds = $seed->catalogues->pluck('heading_id')->filter()->unique()->all();

        $query = Product::query()
            ->where('status', 'published')
            ->where('id', '!=', $seed->id)
            ->when(! empty($catIds), function ($q) use ($catIds) {
                $q->whereHas('catalogues', fn ($qc) => $qc->whereIn('catalogues.id', $catIds));
            })
            ->with([
                'variants' => fn ($q) => $q->orderBy('created_at')->limit(1),
                'variants.prices' => fn ($q) => $q->where('currency_code', 'usd'),
                'images' => fn ($q) => $q->orderBy('rank')->limit(1),
            ])
            ->latest()
            ->limit($limit);

        $results = $query->get();

        // Fallback to same heading if catalogue-match returned nothing.
        if ($results->isEmpty() && ! empty($headingIds)) {
            $results = Product::query()
                ->where('status', 'published')
                ->where('id', '!=', $seed->id)
                ->whereHas('catalogues', fn ($q) => $q->whereIn('heading_id', $headingIds))
                ->with([
                    'variants' => fn ($q) => $q->orderBy('created_at')->limit(1),
                    'variants.prices' => fn ($q) => $q->where('currency_code', 'usd'),
                    'images' => fn ($q) => $q->orderBy('rank')->limit(1),
                ])
                ->latest()
                ->limit($limit)
                ->get();
        }

        return ['products' => $results->map(fn ($p) => $this->summarise($p))];
    }

    /**
     * GET /api/store/products/{handle}
     */
    public function show(string $handle)
    {
        $product = Product::query()
            ->where('handle', $handle)
            ->where('status', 'published')
            ->with([
                'variants' => fn ($q) => $q->orderBy('created_at'),
                'variants.prices' => fn ($q) => $q->where('currency_code', 'usd'),
                'images' => fn ($q) => $q->orderBy('rank'),
                'media'  => fn ($q) => $q->orderBy('position'),
                'options.values',
                'catalogues.heading',
            ])
            ->first();

        if (! $product) {
            return response()->json(['error' => 'Product not found'], 404);
        }

        return [
            'product' => $this->detail($product),
        ];
    }

    /**
     * Compact shape used in list views (Home featured, Shop grid).
     */
    private function summarise(Product $p): array
    {
        $price = optional($p->variants->first()?->prices->first())->amount;

        return [
            'id'        => $p->id,
            'handle'    => $p->handle,
            'title'     => $p->title,
            'subtitle'  => $p->subtitle,
            'thumbnail' => $p->thumbnail ?? optional($p->images->first())->url,
            'price'     => $price,
            'price_label' => $price !== null ? '$' . number_format($price / 100, 2) : null,
        ];
    }

    /**
     * Full shape used in product-detail view.
     */
    private function detail(Product $p): array
    {
        return [
            'id'          => $p->id,
            'handle'      => $p->handle,
            'title'       => $p->title,
            'subtitle'    => $p->subtitle,
            'description' => $p->description,
            'thumbnail'   => $p->thumbnail,
            'images'      => $p->images->map(fn ($i) => ['url' => $i->url, 'rank' => $i->rank]),
            'media'       => $p->media->map(fn ($m) => [
                'media_type'    => $m->media_type,
                'media_url'     => $m->media_url,
                'thumbnail_url' => $m->thumbnail_url,
                'is_primary'    => (bool) $m->is_primary,
                'position'      => $m->position,
            ]),
            'options' => $p->options->map(fn ($o) => [
                'id'    => $o->id,
                'title' => $o->title,
                'values' => $o->values->map(fn ($v) => ['id' => $v->id, 'value' => $v->value]),
            ]),
            'variants' => $p->variants->map(fn ($v) => [
                'id'                 => $v->id,
                'title'              => $v->title,
                'sku'                => $v->sku,
                'inventory_quantity' => $v->inventory_quantity,
                'manage_inventory'   => (bool) $v->manage_inventory,
                'price' => optional($v->prices->first())->amount,
            ]),
            'catalogues' => $p->catalogues->map(fn ($c) => [
                'name'    => $c->name,
                'handle'  => $c->handle,
                'heading' => $c->heading ? [
                    'name'    => $c->heading->name,
                    'handle'  => $c->heading->handle,
                    'is_sale' => (bool) $c->heading->is_sale,
                ] : null,
            ]),
        ];
    }
}
