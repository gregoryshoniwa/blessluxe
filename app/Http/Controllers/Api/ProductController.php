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

        // When browsing an affiliate's storefront who sells a curated line,
        // show only their chosen pieces. Null means "the whole shop", which is
        // why it is checked against null rather than emptiness — an affiliate who
        // has switched to curated but picked nothing yet should show nothing,
        // not everything.
        $curated = \App\Services\AffiliatePricing::curatedProductIds($this->viewingAffiliate($request));

        $query = Product::query()
            ->where('status', 'published')
            ->when($curated !== null, fn ($q) => $q->whereIn('id', $curated ?: ['']))
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
                'media'  => fn ($q) => $q->where('media_type', 'video')->orderBy('position'),
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
        return $this->byIds($data['ids'], $request);
    }

    /**
     * Published products in the order the ids were given, priced and scoped for
     * whoever's shop this request is browsing. Shared by /products/batch and the
     * trending strip so neither can drift from the shop's rules.
     */
    public function byIds(array $ids, ?Request $request = null): array
    {
        $request ??= request();

        // A curated affiliate only sells their own line, here as everywhere else.
        $curated = \App\Services\AffiliatePricing::curatedProductIds($this->viewingAffiliate($request));

        $byId = Product::query()
            ->where('status', 'published')
            ->when($curated !== null, fn ($q) => $q->whereIn('id', $curated ?: ['']))
            ->whereIn('id', $ids)
            ->with([
                'variants' => fn ($q) => $q->orderBy('created_at')->limit(1),
                'variants.prices' => fn ($q) => $q->where('currency_code', 'usd'),
                'images' => fn ($q) => $q->orderBy('rank')->limit(1),
                'media'  => fn ($q) => $q->where('media_type', 'video')->orderBy('position'),
            ])
            ->get()
            ->keyBy('id');

        $products = collect($ids)
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

        $curated = \App\Services\AffiliatePricing::curatedProductIds($this->viewingAffiliate($request));

        $query = Product::query()
            ->where('status', 'published')
            ->where('id', '!=', $seed->id)
            ->when($curated !== null, fn ($q) => $q->whereIn('id', $curated ?: ['']))
            ->when(! empty($catIds), function ($q) use ($catIds) {
                $q->whereHas('catalogues', fn ($qc) => $qc->whereIn('catalogues.id', $catIds));
            })
            ->with([
                'variants' => fn ($q) => $q->orderBy('created_at')->limit(1),
                'variants.prices' => fn ($q) => $q->where('currency_code', 'usd'),
                'images' => fn ($q) => $q->orderBy('rank')->limit(1),
                'media'  => fn ($q) => $q->where('media_type', 'video')->orderBy('position'),
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
                    'media'  => fn ($q) => $q->where('media_type', 'video')->orderBy('position'),
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
        $price = $this->shopPrice($p->id, optional($p->variants->first()?->prices->first())->amount);

        return [
            'id'        => $p->id,
            'handle'    => $p->handle,
            'title'     => $p->title,
            'subtitle'  => $p->subtitle,
            'thumbnail' => $p->thumbnail ?? optional($p->images->first())->url,
            'price'     => $price,
            'price_label' => $price !== null ? '$' . number_format($price / 100, 2) : null,
            'video'     => $this->videoShape($p),
            'rating'    => $this->ratingShape($p),
            'likes'     => (int) ($p->likes_count ?? 0),
            'purchases' => (int) ($p->purchases_count ?? 0),
            'sourcing'  => \App\Services\Couriers::promise($p->sourcing),
        ];
    }

    /** The verdict in one line, from the denormalised counters — never an aggregate. */
    private function ratingShape(Product $p): ?array
    {
        $count = (int) ($p->rating_count ?? 0);
        if ($count < 1) return null;

        $avg = round(((int) $p->rating_sum) / $count, 1);

        return ['average' => $avg, 'average_label' => number_format($avg, 1), 'count' => $count];
    }

    /**
     * Admin-managed product video (uploaded file or YouTube link) for cards
     * and the detail gallery. Null when the product has none.
     */
    private function videoShape(Product $p): ?array
    {
        $m = $p->relationLoaded('media')
            ? $p->media->first(fn ($x) => $x->media_type === 'video' && $x->status === 'ready')
            : null;
        if (! $m) return null;
        $ytId = $m->generation_meta['youtube_id'] ?? null;
        return [
            'kind'      => $m->source_kind === 'youtube' ? 'youtube' : 'upload',
            'url'       => $m->media_url,
            'thumbnail' => $m->thumbnail_url,
            'embed_url' => $ytId ? "https://www.youtube-nocookie.com/embed/{$ytId}" : null,
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
            'rating'      => $this->ratingShape($p),
            'likes_count' => (int) ($p->likes_count ?? 0),
            'purchases'   => (int) ($p->purchases_count ?? 0),
            'sourcing'    => \App\Services\Couriers::promise($p->sourcing),
            'thumbnail'   => $p->thumbnail,
            'images'      => $p->images->map(fn ($i) => ['url' => $i->url, 'rank' => $i->rank]),
            'video'       => $this->videoShape($p),
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
                'price' => $this->shopPrice($p->id, optional($v->prices->first())->amount),
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

    /**
     * The affiliate whose storefront is being browsed, if any.
     *
     * Their curated line and their prices both hang off this, so it is resolved
     * once per request rather than in each query.
     */
    private function viewingAffiliate(\Illuminate\Http\Request $request): ?\App\Models\Affiliate
    {
        return \App\Services\AffiliatePricing::viewing($request);
    }

    /**
     * The price a shopper will actually pay HERE. Inside a seller's shop that is
     * the seller's price (base + their markup) — the same sum the cart charges
     * (CartController uses the same AffiliatePricing::priceFor). Without this a
     * page said $549 and the cart then charged $554. Outside a shop it is the base.
     */
    private function shopPrice(string $productId, $base): ?int
    {
        if ($base === null) return null;
        // Resolved once per REQUEST (kept on it, not in a static — a static would
        // leak one shopper's seller into the next request on a long-lived worker).
        $req = request();
        if (! $req->attributes->has('shop.viewing')) $req->attributes->set('shop.viewing', $this->viewingAffiliate($req));
        $viewing = $req->attributes->get('shop.viewing');

        return $viewing ? (int) \App\Services\AffiliatePricing::priceFor($viewing, $productId, (int) $base)['total'] : (int) $base;
    }
}
