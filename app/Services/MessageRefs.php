<?php

namespace App\Services;

use App\Models\Affiliate;
use App\Models\PackCampaign;
use App\Models\Product;
use App\Models\Scopes\ExclusivityScope;
use Illuminate\Support\Facades\DB;

/**
 * "@" mentions in a conversation: finding catalogue items to reference, and
 * turning the ones chosen into the snapshot stored on the message.
 *
 * The client only ever sends `{type, id}`. Titles, images and prices are read
 * HERE, from the catalogue — a browser is never trusted to say what something
 * is called or what it costs, because that text ends up rendered to the other
 * person as if BLESSLUXE said it.
 *
 * Who is looking matters:
 *   - admin sees the whole published catalogue
 *   - an affiliate sees it minus OTHER affiliates' exclusives, but including
 *     their own. The global ExclusivityScope can't express that (it keys off
 *     the storefront being browsed, not the person signed in), so it is
 *     bypassed and the rule applied explicitly.
 */
class MessageRefs
{
    public const MAX_PER_MESSAGE = 6;
    private const PER_PAGE = 24;

    /**
     * @param  ?Affiliate  $viewer  null = admin (sees everything)
     * @return array{tabs: array, items: array, has_more: bool}
     */
    public static function search(?Affiliate $viewer, bool $isAdmin, string $tab = 'all', ?string $q = null, int $page = 1): array
    {
        $page = max(1, $page);
        $q = trim((string) $q);

        if ($tab === 'packs') {
            [$items, $more] = self::packs($q, $page);
        } else {
            [$items, $more] = self::products($viewer, $isAdmin, $tab === 'all' ? null : $tab, $q, $page);
        }

        return ['tabs' => self::tabs(), 'items' => $items, 'has_more' => $more];
    }

    /** All · Packs · then the shop's own headings (Women, …) in menu order. */
    public static function tabs(): array
    {
        $headings = DB::table('headings')
            ->where('is_active', true)
            ->orderBy('rank')
            ->get(['handle', 'name'])
            ->map(fn ($h) => ['key' => $h->handle, 'label' => $h->name])
            ->all();

        return array_merge(
            [['key' => 'all', 'label' => 'All'], ['key' => 'packs', 'label' => 'Packs']],
            $headings,
        );
    }

    /**
     * Turn what the client picked into what gets stored.
     * Unknown, unpublished or not-visible-to-you items are silently dropped —
     * that is also what stops an affiliate referencing someone else's exclusive
     * by guessing its id.
     *
     * @param  array<int,array{type?:string,id?:string}>  $picked
     * @return array<int,array>
     */
    public static function resolve(array $picked, ?Affiliate $viewer, bool $isAdmin): array
    {
        $picked = array_slice(array_values(array_filter($picked, 'is_array')), 0, self::MAX_PER_MESSAGE);

        $productIds = [];
        $packCodes = [];
        foreach ($picked as $p) {
            $id = (string) ($p['id'] ?? '');
            if ($id === '') continue;
            if (($p['type'] ?? '') === 'product') $productIds[] = $id;
            if (($p['type'] ?? '') === 'pack')    $packCodes[] = $id;
        }

        $products = $productIds
            ? self::productQuery($viewer, $isAdmin)->whereIn('id', $productIds)->get()->keyBy('id')
            : collect();
        $packs = $packCodes
            ? self::packQuery()->whereIn('public_code', $packCodes)->get()->keyBy('public_code')
            : collect();

        // Rebuilt in the order they were picked, which is the order they read.
        $out = [];
        foreach ($picked as $p) {
            $id = (string) ($p['id'] ?? '');
            $hit = match ($p['type'] ?? '') {
                'product' => isset($products[$id]) ? self::productShape($products[$id]) : null,
                'pack'    => isset($packs[$id]) ? self::packShape($packs[$id]) : null,
                default   => null,
            };
            if ($hit && ! in_array($hit['type'] . ':' . $hit['id'], array_map(fn ($o) => $o['type'] . ':' . $o['id'], $out), true)) {
                $out[] = $hit;
            }
        }

        return $out;
    }

    // ─── Products ──────────────────────────────────────────────────────────

    private static function productQuery(?Affiliate $viewer, bool $isAdmin)
    {
        $query = Product::query()
            ->withoutGlobalScope(ExclusivityScope::class)
            ->where('status', 'published')
            ->with([
                'variants' => fn ($v) => $v->orderBy('created_at'),
                'variants.prices' => fn ($p) => $p->where('currency_code', 'usd'),
                'images' => fn ($i) => $i->orderBy('rank')->limit(1),
            ]);

        if (! $isAdmin) {
            $hidden = Exclusivity::hiddenProductIds($viewer);
            if ($hidden) $query->whereNotIn('id', $hidden);
        }

        return $query;
    }

    private static function products(?Affiliate $viewer, bool $isAdmin, ?string $heading, string $q, int $page): array
    {
        $query = self::productQuery($viewer, $isAdmin)
            ->when($heading, fn ($w, $h) => $w
                ->whereHas('catalogues.heading', fn ($hh) => $hh->where('handle', $h)))
            ->when($q !== '', function ($w) use ($q) {
                $like = '%' . addcslashes($q, '%_\\') . '%';
                $w->where(fn ($t) => $t->where('title', 'like', $like)->orWhere('handle', 'like', $like));
            })
            ->orderByDesc('created_at')->orderBy('id');

        $rows = $query->offset(($page - 1) * self::PER_PAGE)->limit(self::PER_PAGE + 1)->get();

        return [
            $rows->take(self::PER_PAGE)->map(fn ($p) => self::productShape($p))->values()->all(),
            $rows->count() > self::PER_PAGE,
        ];
    }

    private static function productShape(Product $p): array
    {
        $price = optional($p->variants->first()?->prices->first())->amount;

        return [
            'type'        => 'product',
            'id'          => $p->id,
            'handle'      => $p->handle,
            'title'       => $p->title,
            'thumbnail'   => $p->thumbnail ?? optional($p->images->first())->url,
            // Formatted here — money is never formatted in the browser.
            'price_label' => $price !== null ? '$' . number_format($price / 100, 2) : null,
        ];
    }

    // ─── Packs ─────────────────────────────────────────────────────────────

    private static function packQuery()
    {
        return PackCampaign::query()
            ->where('status', 'open')
            ->whereNull('deleted_at')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->with(['definition:id,title'])
            ->withCount([
                'slots',
                'slots as slots_available' => fn ($q) => $q->where('status', 'available'),
            ]);
    }

    private static function packs(string $q, int $page): array
    {
        $rows = self::packQuery()
            ->when($q !== '', function ($w) use ($q) {
                $like = '%' . addcslashes($q, '%_\\') . '%';
                $w->where(fn ($t) => $t
                    ->where('title', 'like', $like)
                    ->orWhere('public_code', 'like', $like)
                    ->orWhereHas('definition', fn ($d) => $d->where('title', 'like', $like)));
            })
            ->latest()
            ->offset(($page - 1) * self::PER_PAGE)->limit(self::PER_PAGE + 1)
            ->get();

        return [
            $rows->take(self::PER_PAGE)->map(fn ($c) => self::packShape($c))->values()->all(),
            $rows->count() > self::PER_PAGE,
        ];
    }

    private static function packShape(PackCampaign $c): array
    {
        // Same hero rule as the public packs page: the first slot's product.
        $thumb = DB::table('pack_slots')
            ->join('product_variants', 'product_variants.id', '=', 'pack_slots.variant_id')
            ->join('products', 'products.id', '=', 'product_variants.product_id')
            ->where('pack_slots.pack_campaign_id', $c->id)
            ->whereNull('pack_slots.deleted_at')
            ->orderBy('pack_slots.id')
            ->value('products.thumbnail');

        return [
            'type'        => 'pack',
            'id'          => $c->public_code,
            'handle'      => $c->public_code,
            'title'       => $c->title ?? $c->definition?->title ?? 'Pack',
            'thumbnail'   => $thumb,
            'price_label' => "{$c->slots_available} of {$c->slots_count} slots left",
        ];
    }
}
