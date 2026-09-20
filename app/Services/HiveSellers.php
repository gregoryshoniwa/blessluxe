<?php

namespace App\Services;

use App\Models\Affiliate;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Bless Hive — sellers.
 *
 * A seller is an APPROVED AFFILIATE. Nothing here moves money or invents a new
 * kind of account: commission, Paynow checkout and payouts are the affiliate
 * process exactly as it already works. What this adds is the Hive side of it —
 *
 *   trust        a verified badge, and a reputation made of buyers' try-ons on
 *                orders that seller was credited for (never self-reported)
 *   a shop       the seller's own line, at their prices, on their Hive page
 *   attribution  tapping a product under a seller's look puts the shopper in
 *                that seller's shop (the same session `affiliate_code` a shop
 *                link sets), so the sale is theirs by the normal route
 *   proof        which of their looks led to sales
 */
class HiveSellers
{
    /**
     * customer_id → affiliate code, for every active seller. One query per
     * request however many badges are drawn. Kept on the REQUEST, not in a
     * static, so a long-lived worker (or a test) never sees a stale list.
     *
     * @return array<string,string>
     */
    public static function map(): array
    {
        $req = request();
        if (! $req->attributes->has('hive.sellers')) {
            $req->attributes->set('hive.sellers', DB::table('affiliates')->where('status', 'active')->whereNotNull('customer_id')
                ->pluck('code', 'customer_id')->all());
        }

        return $req->attributes->get('hive.sellers');
    }

    public static function isSeller(?string $customerId): bool
    {
        return $customerId !== null && isset(self::map()[$customerId]);
    }

    public static function forCustomer(string $customerId): ?Affiliate
    {
        return Affiliate::where('customer_id', $customerId)->where('status', 'active')->first();
    }

    // ─── Reputation ────────────────────────────────────────────────────────

    /**
     * Built only from things the seller can't write themselves: sales the shop
     * credited to them, and try-ons by the buyers of those very orders.
     */
    public static function reputation(Affiliate $seller): array
    {
        $sales = DB::table('affiliate_sales')->where('affiliate_id', $seller->id)->whereNotIn('status', ['cancelled', 'refunded', 'reversed'])->count();

        $tryons = DB::table('hive_looks as l')
            ->join('order_line_items as li', 'li.id', '=', 'l.line_item_id')
            ->join('affiliate_sales as s', 's.order_id', '=', 'li.order_id')
            ->where('s.affiliate_id', $seller->id)->where('l.status', 'published')
            // A seller reviewing their own shop isn't a buyer's word.
            ->where('l.customer_id', '!=', (string) $seller->customer_id);

        $count = (clone $tryons)->count();
        $avg = (clone $tryons)->whereNotNull('l.rating')->avg('l.rating');

        return [
            // Banded on purpose: the exact figure is the seller's business, the scale is the shopper's.
            'sales_label'   => $sales >= 100 ? '100+ sales' : ($sales >= 25 ? '25+ sales' : ($sales >= 10 ? '10+ sales' : ($sales >= 1 ? 'First sales made' : 'New seller'))),
            'rating'        => $avg ? round((float) $avg, 1) : null,
            'reviews'       => $count,
            'seller_since'  => Carbon::parse($seller->created_at, config('app.timezone'))->toIso8601String(),
        ];
    }

    /** What buyers of this seller posted. */
    public static function buyerTryOns(Affiliate $seller, ?object $viewer, int $limit = 12): array
    {
        return DB::table('hive_looks as l')
            ->join('hive_profiles as p', 'p.customer_id', '=', 'l.customer_id')
            ->join('order_line_items as li', 'li.id', '=', 'l.line_item_id')
            ->join('affiliate_sales as s', 's.order_id', '=', 'li.order_id')
            ->where('s.affiliate_id', $seller->id)->where('l.status', 'published')->whereNull('p.suspended_at')
            ->where('l.customer_id', '!=', (string) $seller->customer_id)
            ->orderByDesc('l.created_at')->limit($limit)
            ->get(['l.*', 'p.handle', 'p.display_name', 'p.avatar_url'])
            ->map(fn ($l) => Hive::presentLook($l, $viewer))->all();
    }

    // ─── The shop on their page ────────────────────────────────────────────

    /**
     * The seller's line at the seller's prices. Curated shops show their picks
     * in the seller's order; open shops show the newest of the catalogue.
     * Pieces exclusive to a DIFFERENT seller never appear.
     */
    public static function products(Affiliate $seller, int $limit = 24): array
    {
        $hidden = Exclusivity::hiddenProductIds($seller);
        $curated = AffiliatePricing::isCurated($seller);

        $q = DB::table('products as pr')->where('pr.status', 'published')
            ->when($hidden, fn ($w) => $w->whereNotIn('pr.id', $hidden));
        if ($curated) {
            $q->join('affiliate_products as ap', fn ($j) => $j->on('ap.product_id', '=', 'pr.id')->where('ap.affiliate_id', $seller->id)->where('ap.is_active', true))
                ->orderBy('ap.position')->orderByDesc('ap.created_at');
        } else {
            $q->orderByDesc('pr.created_at');
        }
        $rows = $q->limit($limit)->get(['pr.id', 'pr.handle', 'pr.title', 'pr.thumbnail']);

        // Cheapest USD variant price per product, in one query.
        $base = DB::table('product_variants as v')->join('variant_prices as vp', 'vp.variant_id', '=', 'v.id')
            ->whereIn('v.product_id', $rows->pluck('id'))->where('vp.currency_code', 'usd')
            ->groupBy('v.product_id')->selectRaw('v.product_id, MIN(vp.amount) as amount')->pluck('amount', 'product_id');

        return [
            'curated'  => $curated,
            'products' => $rows->map(function ($p) use ($seller, $base) {
                $cents = isset($base[$p->id]) ? AffiliatePricing::priceFor($seller, $p->id, (int) $base[$p->id])['total'] : null;

                return ['id' => $p->id, 'handle' => $p->handle, 'title' => $p->title, 'thumbnail' => $p->thumbnail,
                    'price_label' => $cents !== null ? '$' . number_format($cents / 100, 2) : null];
            })->all(),
        ];
    }

    // ─── Directory ─────────────────────────────────────────────────────────

    public static function directory(?object $viewer, int $limit = 12): array
    {
        $codes = self::map();
        if (! $codes) return [];

        $mine = $viewer ? Hive::followedIds($viewer->customer_id) : [];

        return DB::table('hive_profiles')->whereIn('customer_id', array_keys($codes))->whereNull('suspended_at')
            ->orderByDesc('followers_count')->orderByDesc('looks_count')->limit($limit)->get()
            ->map(fn ($p) => Hive::present($p, $viewer, in_array($p->customer_id, $mine, true)))->all();
    }

    // ─── For the seller ────────────────────────────────────────────────────

    /** Which of my looks sent shoppers who then bought. Labels are made here, never in the browser. */
    public static function dashboard(Affiliate $seller): array
    {
        $lines = DB::table('order_line_items as li')->join('orders as o', 'o.id', '=', 'li.order_id')
            ->where('o.payment_status', 'paid')->whereNotNull('li.metadata')
            ->where('li.metadata->affiliate_code', $seller->code)->whereNotNull('li.metadata->hive_look_id')
            ->get(['li.metadata', 'li.quantity', 'li.unit_price']);

        $byLook = [];
        foreach ($lines as $li) {
            $id = json_decode((string) $li->metadata, true)['hive_look_id'] ?? null;
            if (! $id) continue;
            $byLook[$id] ??= ['items' => 0, 'cents' => 0];
            $byLook[$id]['items'] += (int) $li->quantity;
            $byLook[$id]['cents'] += (int) $li->quantity * (int) $li->unit_price;
        }
        arsort($byLook);

        $looks = DB::table('hive_looks')->whereIn('id', array_keys($byLook))->get(['id', 'images', 'caption'])->keyBy('id');

        return [
            'code'             => $seller->code,
            'commission_rate'  => (float) $seller->commission_rate,
            'earnings_label'   => '$' . number_format(((int) $seller->total_earnings) / 100, 2),
            'hive_items_sold'  => array_sum(array_column($byLook, 'items')),
            'hive_sales_label' => '$' . number_format(array_sum(array_column($byLook, 'cents')) / 100, 2),
            'looks_that_sold'  => collect($byLook)->take(10)->map(fn ($v, $id) => [
                'id' => $id, 'image' => isset($looks[$id]) ? (json_decode((string) $looks[$id]->images, true)[0] ?? null) : null,
                'caption' => $looks[$id]->caption ?? null, 'items' => $v['items'], 'sales_label' => '$' . number_format($v['cents'] / 100, 2),
            ])->values()->all(),
        ];
    }

    // ─── My closet ─────────────────────────────────────────────────────────

    /** Everything I've bought, newest first, with the try-on I posted for it (if any). Mine alone to see. */
    public static function closet(string $customerId, int $limit = 60): array
    {
        $rows = DB::table('order_line_items as li')->join('orders as o', 'o.id', '=', 'li.order_id')
            ->leftJoin('hive_looks as l', fn ($j) => $j->on('l.line_item_id', '=', 'li.id')->where('l.customer_id', $customerId))
            ->leftJoin('products as pr', 'pr.id', '=', 'li.product_id')
            ->where('o.customer_id', $customerId)->where('o.payment_status', 'paid')
            ->orderByDesc('o.created_at')->limit($limit)
            ->get(['li.id', 'li.title', 'li.variant_title', 'li.thumbnail', 'li.product_id', 'pr.handle', 'pr.status as product_status', 'o.order_number', 'o.created_at', 'l.id as look_id']);

        $paid = DB::table('hive_tryon_rewards')->whereIn('line_item_id', $rows->pluck('id'))->pluck('line_item_id')->flip();

        return $rows->map(fn ($r) => [
            'line_item_id' => $r->id, 'title' => $r->title, 'variant' => $r->variant_title, 'thumbnail' => $r->thumbnail,
            'product_handle' => $r->product_status === 'published' ? $r->handle : null,
            'order_number' => $r->order_number, 'bought_at' => Carbon::parse($r->created_at, config('app.timezone'))->toIso8601String(),
            'look_id' => $r->look_id,
            'earns' => $r->look_id || isset($paid[$r->id]) ? 0 : HiveRewards::TRY_ON_BEES,
        ])->all();
    }
}
