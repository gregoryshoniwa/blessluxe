<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CartLineItem;
use App\Models\PackCampaign;
use App\Models\PackSlot;
use App\Models\ProductVariant;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Public pack endpoints — the customer-facing group-buy flow.
 *
 *   GET   /store/packs/{code}                — view a campaign + its slots
 *   POST  /store/packs/{code}/slots/{id}/reserve  — 10-minute hold
 *   POST  /store/packs/{code}/slots/{id}/release  — drop the hold
 *
 * Reservation creates a cart_line_item for the matching variant tagged
 * with the slot_id in metadata so the checkout flow can flip the slot to
 * `paid` once the order materialises.
 */
class PackController extends Controller
{
    public const RESERVATION_MINUTES = 10;

    /**
     * Rating, hearts and sales of the piece a series is for — the same numbers
     * its product card shows, never a separate tally.
     *
     * @return array{rating:?array,likes:int,purchases:int}|null
     */
    public static function reputation($product): ?array
    {
        if (! $product) return null;
        $count = (int) ($product->rating_count ?? 0);
        $avg = $count > 0 ? round(((int) $product->rating_sum) / $count, 1) : null;

        return [
            'rating'    => $avg === null ? null : ['average' => $avg, 'average_label' => number_format($avg, 1), 'count' => $count],
            'likes'     => (int) ($product->likes_count ?? 0),
            'purchases' => (int) ($product->purchases_count ?? 0),
            'sourcing'  => \App\Services\Couriers::promise($product->sourcing ?? null),
        ];
    }

    /** "RM" for Rudo Moyo. The most a public page ever says about a buyer. */
    public static function initials($customer): ?string
    {
        if (! $customer) return null;
        $a = mb_substr(trim((string) $customer->first_name), 0, 1);
        $b = mb_substr(trim((string) $customer->last_name), 0, 1);
        $out = mb_strtoupper($a . $b);

        return $out !== '' ? $out : null;
    }

    /**
     * Sweeps expired reservations back to `available`. Runs on every read so
     * we don't need a cron — the storefront page itself heals the campaign.
     */
    private function reapExpired(string $campaignId): void
    {
        PackSlot::where('pack_campaign_id', $campaignId)
            ->where('status', 'reserved')
            ->whereNotNull('reserved_until')
            ->where('reserved_until', '<', now())
            ->update([
                'status'        => 'available',
                'customer_id'   => null,
                'reserved_until' => null,
                'updated_at'    => now(),
            ]);
    }

    /**
     * GET /api/store/packs
     *
     * Public catalogue of open campaigns. Closed/filled/cancelled campaigns
     * are hidden — they're stale conversion targets.
     */
    public function index(Request $request)
    {
        // A curated affiliate shop sells only what that affiliate chose, and a
        // pack is never something they chose — so their shop lists none. (A
        // direct link to a pack still opens: that is someone following a link
        // they were sent, not this shop advertising it.)
        $viewing = \App\Services\AffiliatePricing::viewing($request);
        if (\App\Services\AffiliatePricing::isCurated($viewing)) {
            return ['packs' => [], 'categories' => [], 'pagination' => null, 'hidden_by_storefront' => true];
        }

        $open = fn () => PackCampaign::query()
            ->where('status', 'open')
            ->whereNull('deleted_at')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()));

        // The filter tree is built from EVERYTHING open, not from this page of
        // results — a tab must never vanish because its series are on page two.
        $placedAll = self::categoriesOf($open()->pluck('id')->all());

        // ── Filters, all on the server, so paging and filtering can't disagree ──
        $q         = trim((string) $request->query('q', ''));
        $heading   = (string) $request->query('heading', '');
        $catalogue = (string) $request->query('catalogue', '');
        $where     = (string) $request->query('where', '');            // local | import
        $sort      = (string) $request->query('sort', 'closest');
        $limit     = max(1, min(48, (int) $request->query('limit', 12)));

        $query = $open()
            ->with(['definition:id,title,handle,description,pack_kind'])
            ->withCount([
                'slots',
                'slots as slots_available' => fn ($s) => $s->where('status', 'available'),
                'slots as slots_paid'      => fn ($s) => $s->where('status', 'paid'),
            ]);

        $viaProduct = fn ($cb) => $query->whereHas('slots', fn ($s) => $s->whereNull('deleted_at')->whereHas('variant.product', $cb));
        if ($heading !== '')   $viaProduct(fn ($p) => $p->whereHas('catalogues.heading', fn ($h) => $h->where('handle', $heading)));
        if ($catalogue !== '') $viaProduct(fn ($p) => $p->whereHas('catalogues', fn ($c) => $c->where('handle', $catalogue)));
        if ($where === 'import') $viaProduct(fn ($p) => $p->where('sourcing', \App\Services\Couriers::IMPORT));
        if ($where === 'local')  $viaProduct(fn ($p) => $p->where(fn ($w) => $w->whereNull('sourcing')->orWhere('sourcing', '!=', \App\Services\Couriers::IMPORT)));
        if ($q !== '') {
            $like = '%' . $q . '%';
            $query->where(fn ($w) => $w
                ->where('title', 'like', $like)
                ->orWhere('public_code', 'like', $like)
                ->orWhereHas('definition', fn ($d) => $d->where('title', 'like', $like)->orWhere('description', 'like', $like))
                // "dress" finds a series in Dresses whatever its title says.
                ->orWhereHas('slots.variant.product.catalogues', fn ($c) => $c->where('name', 'like', $like)->orWhereHas('heading', fn ($h) => $h->where('name', 'like', $like))));
        }

        match ($sort) {
            // Nearly there first: the series two sizes short is the one worth joining.
            'closest' => $query->orderByRaw('(slots_count - slots_paid) asc')->latest(),
            // A deadline first, soonest at the top; the undated after them.
            'ending'  => $query->orderByRaw('CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END')->orderBy('expires_at')->latest(),
            default   => $query->latest(),
        };

        $paginator = $query->paginate($limit);
        $campaigns = $paginator->getCollection();
        $ids = $campaigns->pluck('id')->all();

        // The piece behind each card, and who is already in — one query each
        // for the whole page, never one per card.
        $heroes = PackSlot::whereIn('pack_campaign_id', $ids)->whereNull('deleted_at')
            ->with(['variant.product:id,thumbnail,sourcing,rating_count,rating_sum,likes_count,purchases_count', 'variant.product.media'])
            ->orderBy('size_label')->get()->groupBy('pack_campaign_id');
        $people = PackSlot::whereIn('pack_campaign_id', $ids)->where('status', 'paid')->whereNotNull('customer_id')
            ->with('customer:id,first_name,last_name')->get()->groupBy('pack_campaign_id')
            ->map(fn ($rows) => $rows->unique('customer_id')->map(fn ($r) => self::initials($r->customer))->filter()->values()->all());

        return [
            'categories' => self::facets($placedAll),
            // What the whole board is doing right now — the hook above the fold.
            'stats'      => self::stats($open),
            'activity'   => self::activity($open),
            'pagination' => [
                'page'      => $paginator->currentPage(),
                'per_page'  => $paginator->perPage(),
                'total'     => $paginator->total(),
                'last_page' => $paginator->lastPage(),
                'has_more'  => $paginator->hasMorePages(),
            ],
            'packs' => $campaigns->map(function (PackCampaign $c) use ($placedAll, $heroes, $people) {
                $slots = $heroes->get($c->id, collect());
                // The tile's picture: the first size still open, else any.
                $hero = $slots->firstWhere('status', 'available') ?? $slots->first();
                $product = $hero?->variant?->product;
                $placed = $placedAll[$c->id] ?? [];

                return [
                    'public_code'    => $c->public_code,
                    'reputation'     => self::reputation($product),
                    'video'          => $product ? \App\Http\Controllers\Api\ProductController::videoShape($product) : null,
                    'people'         => $people->get($c->id, []),
                    'title'          => $c->title ?? $c->definition?->title,
                    'description'    => $c->definition?->description,
                    'thumbnail'      => $product?->thumbnail,
                    'host_kind'      => $c->host_kind,
                    'expires_at'     => $c->expires_at?->toIso8601String(),
                    'slots_total'     => $c->slots_count,
                    'slots_available' => $c->slots_available,
                    'slots_paid'      => $c->slots_paid,
                    'needs'           => max(0, $c->slots_count - $c->slots_paid),
                    'headings'        => array_values(array_unique(array_column($placed, 'heading'))),
                    'catalogues'      => array_values(array_unique(array_column($placed, 'catalogue'))),
                ];
            })->values(),
        ];
    }

    /** The three numbers a stranger glances at: how much is on, how many are in, what closes today. */
    private static function stats(\Closure $open): array
    {
        $ids = $open()->pluck('id');

        return [
            'open'          => $ids->count(),
            'people'        => (int) PackSlot::whereIn('pack_campaign_id', $ids)->where('status', 'paid')->whereNotNull('customer_id')->distinct()->count('customer_id'),
            'closing_today' => (int) $open()->whereNotNull('expires_at')->where('expires_at', '<=', now()->endOfDay())->count(),
        ];
    }

    /**
     * The last things that happened across every open series — someone taking
     * a size, a series filling — as a ticker. Initials only; a size being taken
     * is news, the buyer's name is not.
     */
    private static function activity(\Closure $open, int $limit = 14): array
    {
        $ids = $open()->pluck('id');

        $joins = PackSlot::whereIn('pack_campaign_id', $ids)->where('status', 'paid')->whereNotNull('customer_id')->whereNull('deleted_at')
            ->with(['customer:id,first_name,last_name', 'campaign:id,public_code,title,pack_definition_id', 'campaign.definition:id,title'])
            ->orderByDesc('updated_at')->limit($limit)->get()
            ->map(fn ($s) => [
                'kind'     => 'joined',
                'initials' => self::initials($s->customer),
                'size'     => $s->size_label,
                'series'   => $s->campaign?->title ?: $s->campaign?->definition?->title,
                'code'     => $s->campaign?->public_code,
                'at'       => $s->updated_at?->toIso8601String(),
            ]);

        // Series that just filled are the best news on the board; they left the
        // "open" list, so look at them directly.
        $filled = PackCampaign::where('status', 'filled')->whereNull('deleted_at')->where('updated_at', '>=', now()->subDays(7))
            ->with('definition:id,title')->orderByDesc('updated_at')->limit(3)->get()
            ->map(fn ($c) => ['kind' => 'filled', 'series' => $c->title ?: $c->definition?->title, 'code' => $c->public_code, 'at' => $c->updated_at?->toIso8601String()]);

        return $joins->concat($filled)->sortByDesc('at')->take($limit)->values()->all();
    }

    /**
     * Which headings and catalogues each series falls under, read from the
     * catalogues of the products in its slots. One query for the whole page.
     * The Sale heading is not a place in the shop, so it never counts.
     *
     * @return array<string,array<int,array{heading:string,heading_name:string,catalogue:string,catalogue_name:string}>>
     */
    private static function categoriesOf(array $campaignIds): array
    {
        if (! $campaignIds) return [];

        $rows = DB::table('pack_slots as s')
            ->join('product_variants as v', 'v.id', '=', 's.variant_id')
            ->join('product_catalogue_map as m', 'm.product_id', '=', 'v.product_id')
            ->join('catalogues as c', 'c.id', '=', 'm.catalogue_id')
            ->join('headings as h', 'h.id', '=', 'c.heading_id')
            ->whereIn('s.pack_campaign_id', $campaignIds)
            ->whereNull('s.deleted_at')
            ->where('c.is_active', true)
            ->where('h.is_active', true)
            ->where('h.is_sale', false)
            ->distinct()
            ->get([
                's.pack_campaign_id', 'h.handle as heading', 'h.name as heading_name', 'h.rank as heading_rank',
                'c.handle as catalogue', 'c.name as catalogue_name', 'c.rank as catalogue_rank',
            ]);

        $out = [];
        foreach ($rows as $r) $out[$r->pack_campaign_id][] = (array) $r;

        return $out;
    }

    /**
     * The filter tree: headings in the shop's own order, each with the
     * catalogues that have a series in them and how many.
     */
    private static function facets(array $placed): array
    {
        $headings = [];
        foreach ($placed as $campaignId => $rows) {
            $seenH = []; $seenC = [];
            foreach ($rows as $r) {
                $h = $r['heading'];
                $headings[$h] ??= ['handle' => $h, 'name' => $r['heading_name'], 'rank' => (int) $r['heading_rank'], 'count' => 0, 'catalogues' => []];
                if (! isset($seenH[$h])) { $headings[$h]['count']++; $seenH[$h] = true; }

                $c = $r['catalogue'];
                $headings[$h]['catalogues'][$c] ??= ['handle' => $c, 'name' => $r['catalogue_name'], 'rank' => (int) $r['catalogue_rank'], 'count' => 0];
                if (! isset($seenC[$c])) { $headings[$h]['catalogues'][$c]['count']++; $seenC[$c] = true; }
            }
        }

        $byRank = fn ($a, $b) => [$a['rank'], $a['name']] <=> [$b['rank'], $b['name']];
        foreach ($headings as &$h) {
            $cats = array_values($h['catalogues']);
            usort($cats, $byRank);
            $h['catalogues'] = array_map(fn ($c) => array_diff_key($c, ['rank' => 1]), $cats);
        }
        unset($h);
        $list = array_values($headings);
        usort($list, $byRank);

        return array_map(fn ($h) => array_diff_key($h, ['rank' => 1]), $list);
    }

    public function show(string $code)
    {
        $campaign = PackCampaign::query()
            ->where('public_code', strtoupper($code))
            ->whereNull('deleted_at')
            ->with(['definition'])
            ->first();
        if (! $campaign) {
            return response()->json(['error' => 'Pack not found.'], 404);
        }

        $this->reapExpired($campaign->id);

        $customerId = optional(Auth::guard('customer')->user())->id;

        $slots = PackSlot::query()
            ->where('pack_campaign_id', $campaign->id)
            ->with([
                'variant.product:id,title,handle,thumbnail,description,sourcing,rating_count,rating_sum,likes_count,purchases_count',
                'variant.product.images' => fn ($q) => $q->orderBy('rank'),
                'variant.prices' => fn ($q) => $q->where('currency_code', 'usd'),
                // Only to draw two initials beside a PAID size. Never a name, never
                // for a hold — a hold is a promise, a payment is a fact.
                'customer:id,first_name,last_name',
            ])
            ->orderBy('size_label')
            ->get()
            ->map(function (PackSlot $s) use ($customerId) {
                $price = optional($s->variant?->prices->first())->amount;
                return [
                    'id'            => $s->id,
                    'status'        => $s->status,
                    'is_mine'       => $customerId && $s->customer_id === $customerId,
                    'size_label'    => $s->size_label,
                    'reserved_until'=> $s->reserved_until?->toIso8601String(),
                    'buyer'         => $s->status === 'paid' ? self::initials($s->customer) : null,
                    'product' => [
                        'id'        => $s->variant?->product?->id,
                        'title'     => $s->variant?->product?->title,
                        'handle'    => $s->variant?->product?->handle,
                        'thumbnail' => $s->variant?->product?->thumbnail,
                    ],
                    'variant' => [
                        'id'    => $s->variant?->id,
                        'title' => $s->variant?->title,
                        'price' => $price,
                        'price_label' => $price !== null ? '$' . number_format($price / 100, 2) : null,
                    ],
                ];
            });

        $totals = [
            'total'      => $slots->count(),
            'available'  => $slots->where('status', 'available')->count(),
            'reserved'   => $slots->where('status', 'reserved')->count(),
            'paid'       => $slots->where('status', 'paid')->count(),
        ];
        $totals['needs'] = max(0, $totals['total'] - $totals['paid']);           // what stands between this and shipping
        $totals['fill_percent'] = $totals['total'] ? (int) round($totals['paid'] / $totals['total'] * 100) : 0;

        // The piece the series is for, in full: the gallery, the words, the price.
        // Every slot is normally the same product; the first says it for all.
        $hero = PackSlot::where('pack_campaign_id', $campaign->id)->with(['variant.product.images' => fn ($q) => $q->orderBy('rank'), 'variant.product.media', 'variant.prices' => fn ($q) => $q->where('currency_code', 'usd')])->first();
        $product = $hero?->variant?->product;
        $heroPrice = optional($hero?->variant?->prices->first())->amount;

        return [
            'campaign' => [
                'id'          => $campaign->id,
                'public_code' => $campaign->public_code,
                'product'     => $product ? [
                    'id'          => $product->id,
                    'title'       => $product->title,
                    'handle'      => $product->handle,
                    'description' => $product->description,
                    'images'      => array_values(array_unique(array_filter(array_merge(
                        [$product->thumbnail],
                        $product->images->pluck('url')->all(),
                    )))),
                    'price_label' => $heroPrice !== null ? '$' . number_format($heroPrice / 100, 2) : null,
                    // The same clip the product page shows, in the gallery here.
                    'video'       => \App\Http\Controllers\Api\ProductController::videoShape($product),
                ] : null,
                // Who is already in: two initials each, paid sizes only, no names.
                // It's the thing a stranger looks for before joining — "is anyone
                // actually in this?" — and it gives nothing away.
                'people'      => PackSlot::where('pack_campaign_id', $campaign->id)->where('status', 'paid')->whereNotNull('customer_id')
                    ->with('customer:id,first_name,last_name')->get()->unique('customer_id')
                    ->map(fn ($s) => self::initials($s->customer))->filter()->values()->all(),
                // Inherited from the piece, so the series page says what the
                // product page says rather than starting a second scoreboard.
                'reputation'  => self::reputation($slots->isNotEmpty() ? PackSlot::where('pack_campaign_id', $campaign->id)->with('variant.product')->first()?->variant?->product : null),
                'title'       => $campaign->title,
                'status'      => $campaign->status,
                'host_kind'   => $campaign->host_kind,
                'expires_at'  => $campaign->expires_at?->toIso8601String(),
                'definition'  => $campaign->definition ? [
                    'title'       => $campaign->definition->title,
                    'description' => $campaign->definition->description,
                    'pack_kind'   => $campaign->definition->pack_kind,
                ] : null,
                'reservation_minutes' => self::RESERVATION_MINUTES,
            ],
            'totals' => $totals,
            'slots'  => $slots,
        ];
    }

    /**
     * Claim a slot for the signed-in customer for the next 10 minutes.
     * Atomic: takes a row lock on the slot so two simultaneous reserves
     * for the same slot don't both succeed. Adds the variant to the cart
     * with `metadata.pack_slot_id` so checkout knows to flip it to paid.
     */
    public function reserve(Request $request, string $code, string $slotId)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) {
            return response()->json(['error' => 'Sign in to reserve a slot.'], 401);
        }

        $campaign = PackCampaign::where('public_code', strtoupper($code))->whereNull('deleted_at')->first();
        if (! $campaign) return response()->json(['error' => 'Pack not found.'], 404);
        if ($campaign->status !== 'open') {
            return response()->json(['error' => 'Pack is no longer accepting reservations.'], 422);
        }

        $this->reapExpired($campaign->id);

        // abort(response()->json(...)) inside the transaction throws
        // HttpResponseException — DB::transaction rolls back, Laravel's
        // exception handler renders the JSON response. No try/catch needed.
        $result = DB::transaction(function () use ($slotId, $campaign, $customer, $request) {
            $slot = PackSlot::query()
                ->where('id', $slotId)
                ->where('pack_campaign_id', $campaign->id)
                ->lockForUpdate()
                ->first();
            if (! $slot) {
                abort(response()->json(['error' => 'Slot not found.'], 404));
            }
            $isMine = $slot->status === 'reserved' && $slot->customer_id === $customer->id;
            if ($slot->status !== 'available' && ! $isMine) {
                abort(response()->json(['error' => 'Sorry — someone else just claimed that slot.'], 409));
            }

            $slot->update([
                'status'         => 'reserved',
                'customer_id'    => $customer->id,
                'reserved_until' => now()->addMinutes(self::RESERVATION_MINUTES),
            ]);

            // Add (or upsert) a cart line for this slot so checkout sees it.
            $cartId = $request->session()->get('cart_id');
            if (! $cartId) {
                $cartId = 'cart_' . Str::random(20);
                DB::table('carts')->insert(['id' => $cartId, 'created_at' => now(), 'updated_at' => now()]);
                $request->session()->put('cart_id', $cartId);
            }

            $variant = ProductVariant::with(['prices' => fn ($q) => $q->where('currency_code', 'usd')])
                ->find($slot->variant_id);
            $unitPrice = (int) (optional($variant?->prices->first())->amount ?? 0);

            // One cart line per slot — keyed by slot_id, not just variant_id.
            $existing = DB::table('cart_line_items')
                ->where('cart_id', $cartId)
                ->where('metadata->pack_slot_id', $slot->id)
                ->first();
            if (! $existing) {
                CartLineItem::create([
                    'id'         => 'cli_' . Str::random(20),
                    'cart_id'    => $cartId,
                    'variant_id' => $slot->variant_id,
                    'quantity'   => 1,
                    'unit_price' => $unitPrice,
                    'metadata'   => [
                        'pack_slot_id'     => $slot->id,
                        'pack_campaign_id' => $campaign->id,
                        'pack_public_code' => $campaign->public_code,
                    ],
                ]);
            }
            return ['slot' => $slot->fresh()];
        });

        return ['slot' => $result['slot'], 'reservation_minutes' => self::RESERVATION_MINUTES];
    }

    /** Release a slot the customer is currently holding. */
    public function release(Request $request, string $code, string $slotId)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) {
            return response()->json(['error' => 'Sign in to release a slot.'], 401);
        }

        $campaign = PackCampaign::where('public_code', strtoupper($code))->whereNull('deleted_at')->first();
        if (! $campaign) return response()->json(['error' => 'Pack not found.'], 404);

        DB::transaction(function () use ($slotId, $campaign, $customer, $request) {
            $slot = PackSlot::query()
                ->where('id', $slotId)
                ->where('pack_campaign_id', $campaign->id)
                ->where('customer_id', $customer->id)
                ->where('status', 'reserved')
                ->lockForUpdate()
                ->first();
            if (! $slot) return;
            $slot->update([
                'status'         => 'available',
                'customer_id'    => null,
                'reserved_until' => null,
            ]);
            // Drop the matching cart line.
            $cartId = $request->session()->get('cart_id');
            if ($cartId) {
                DB::table('cart_line_items')
                    ->where('cart_id', $cartId)
                    ->where('metadata->pack_slot_id', $slot->id)
                    ->delete();
            }
        });

        return ['ok' => true];
    }

    /**
     * GET /api/store/couriers
     *
     * Public: the options and prices a buyer chooses between for imported stock.
     * Priced per piece; a basket with no imports gets an empty list, which is the
     * signal to show no shipping section at all.
     */
    public function couriers(Request $request)
    {
        $items = max(1, (int) $request->query('items', 1));

        return ['couriers' => \App\Services\Couriers::optionsFor($items)];
    }

    /**
     * Mark slot(s) paid + link them to an order line item.
     *
     * @param  array<string,string>  $slotLineIds  slot id => order line item id
     */
    public static function markPaidForOrder(string $orderId, array $items, array $slotLineIds = []): void
    {
        // $items is the cart_snapshot items array — each may carry
        // metadata.pack_slot_id which we already passed through Paynow's
        // session. Flip each one to 'paid' and stamp the order link.
        foreach ($items as $it) {
            $slotId = $it['metadata']['pack_slot_id'] ?? null;
            if (! $slotId) continue;
            DB::table('pack_slots')
                ->where('id', $slotId)
                ->whereIn('status', ['reserved', 'available'])
                ->update([
                    'status'         => 'paid',
                    'order_id'       => $orderId,
                    'line_item_id'   => $slotLineIds[$slotId] ?? null,
                    'reserved_until' => null,
                    'updated_at'    => now(),
                ]);
        }
        // Promote the campaign to "filled" once every slot is paid.
        $touchedCampaigns = DB::table('pack_slots')
            ->whereIn('id', array_filter(array_map(fn ($it) => $it['metadata']['pack_slot_id'] ?? null, $items)))
            ->pluck('pack_campaign_id')
            ->unique();
        foreach ($touchedCampaigns as $campaignId) {
            // whereNull('deleted_at') matters: pack_slots is soft-deleting, and a
            // single removed slot would otherwise keep the campaign from ever filling.
            $unpaid = DB::table('pack_slots')
                ->where('pack_campaign_id', $campaignId)
                ->whereNull('deleted_at')
                ->where('status', '!=', 'paid')
                ->count();
            if ($unpaid === 0) {
                $flipped = DB::table('pack_campaigns')
                    ->where('id', $campaignId)
                    ->where('status', '!=', 'filled')            // once, however many pay in the same second
                    ->update(['status' => 'filled', 'updated_at' => now()]);
                if ($flipped) self::tellEveryoneItFilled($campaignId);
            }
        }

        // A slot going paid — and a campaign filling — both change what the buyer's
        // order is waiting on, so refresh the derived summary.
        \App\Services\Shipping::syncOrderFulfillment($orderId);
    }

    /**
     * Every buyer in a series gets one line the moment the last size is paid.
     * In a WhatsApp group this is the message that never comes; here it is
     * the one thing everyone was waiting to hear.
     */
    private static function tellEveryoneItFilled(string $campaignId): void
    {
        $campaign = PackCampaign::with('definition')->find($campaignId);
        if (! $campaign) return;
        $title = $campaign->title ?: ($campaign->definition?->title ?? 'Your series');

        $buyers = DB::table('pack_slots')->where('pack_campaign_id', $campaignId)
            ->where('status', 'paid')->whereNotNull('customer_id')->whereNull('deleted_at')
            ->distinct()->pluck('customer_id');

        foreach ($buyers as $customerId) {
            try {
                \App\Services\Notifications::forCustomer(
                    $customerId,
                    'series_filled',
                    "{$title} is full",
                    'Every size is claimed and paid. The series is being ordered now — your order page shows where it stands.',
                    '/shop/series/' . $campaign->public_code,
                );
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning('[series] could not notify a buyer it filled', ['campaign' => $campaignId, 'customer' => $customerId, 'error' => $e->getMessage()]);
            }
        }
    }
}
