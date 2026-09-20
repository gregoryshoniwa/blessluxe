<?php

namespace App\Services;

use App\Models\Affiliate;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Paid product exclusivity.
 *
 * While an affiliate holds a product, it is hidden from the main shop and from
 * every other affiliate. Terms are time-boxed and carry a minimum-units
 * condition, mirroring how exclusive distribution agreements actually work:
 * hit the minimum and it renews, miss it and the product returns to open sale.
 *
 * Expiry is evaluated LAZILY, on read, because no scheduled task runs in this
 * deployment. A cron would be tidier, but a lapse that only happens when cron
 * happens to run is worse than one that is always correct at the moment anyone
 * looks.
 */
class Exclusivity
{
    public const SESSION_KIND = 'exclusivity';

    public const PENDING  = 'pending_payment';
    public const ACTIVE   = 'active';
    public const LAPSED   = 'lapsed';
    public const CANCELLED = 'cancelled';

    /**
     * Product ids currently locked by someone OTHER than $viewer.
     *
     * This is the filter every product listing applies. Passing the viewing
     * affiliate means their own exclusives stay visible to them while remaining
     * hidden everywhere else.
     *
     * @return array<int,string>
     */
    public static function hiddenProductIds(?Affiliate $viewer = null): array
    {
        self::lapseExpired();

        return DB::table('product_exclusivities')
            ->where('status', self::ACTIVE)
            ->where('ends_at', '>', now())
            ->when($viewer, fn ($q) => $q->where('affiliate_id', '!=', $viewer->id))
            ->distinct()
            ->pluck('product_id')
            ->all();
    }

    /** The live exclusivity on a product, if any. */
    public static function holderOf(string $productId): ?object
    {
        self::lapseExpired();

        return DB::table('product_exclusivities')
            ->where('product_id', $productId)
            ->where('status', self::ACTIVE)
            ->where('ends_at', '>', now())
            ->first();
    }

    /** Can this affiliate sell this product right now? */
    public static function canSell(string $productId, ?Affiliate $affiliate): bool
    {
        $holder = self::holderOf($productId);

        return ! $holder || ($affiliate && $holder->affiliate_id === $affiliate->id);
    }

    /**
     * What buying exclusivity on this product would cost and commit to, or a
     * reason it isn't on offer.
     */
    public static function quote(string $productId, ?Affiliate $affiliate = null): array
    {
        $product = DB::table('products')->where('id', $productId)->first();

        if (! $product) {
            return ['available' => false, 'reason' => 'That product no longer exists.'];
        }

        // Opt-in: BLESSLUXE decides what may be taken off its own shop.
        if (! $product->exclusivity_enabled || ! $product->exclusivity_fee) {
            return ['available' => false, 'reason' => 'This piece is not offered exclusively.'];
        }

        $holder = self::holderOf($productId);
        if ($holder) {
            $mine = $affiliate && $holder->affiliate_id === $affiliate->id;

            return [
                'available'  => false,
                'held_by_me' => $mine,
                'reason'     => $mine ? 'You already hold this one.' : 'Another affiliate holds this piece.',
                'held_until' => $holder->ends_at,
            ];
        }

        return [
            'available'    => true,
            'product_id'   => $productId,
            'fee_amount'   => (int) $product->exclusivity_fee,
            'fee_label'    => '$' . number_format($product->exclusivity_fee / 100, 2),
            'term_days'    => (int) $product->exclusivity_term_days,
            'min_units'    => (int) $product->exclusivity_min_units,
            'terms'        => self::termsCopy($product),
        ];
    }

    private static function termsCopy(object $product): string
    {
        $base = "You'll be the only place this piece is sold — it comes off the main BLESSLUXE shop "
              . "for {$product->exclusivity_term_days} days.";

        return $product->exclusivity_min_units > 0
            ? $base . " Sell at least {$product->exclusivity_min_units} to keep it; below that it returns to open sale."
            : $base . ' It renews automatically until you cancel.';
    }

    /**
     * Reserve the product pending payment.
     *
     * First to PAY wins, not first to click, so this row is only a placeholder.
     * The product stays on open sale until the money lands.
     */
    public static function beginPurchase(string $productId, Affiliate $affiliate): array
    {
        $quote = self::quote($productId, $affiliate);
        if (! ($quote['available'] ?? false)) {
            throw new \RuntimeException($quote['reason'] ?? 'Not available.');
        }

        $id = 'excl_' . Str::random(16);

        DB::table('product_exclusivities')->insert([
            'id'           => $id,
            'product_id'   => $productId,
            'affiliate_id' => $affiliate->id,
            'status'       => self::PENDING,
            'fee_amount'   => $quote['fee_amount'],
            'term_days'    => $quote['term_days'],
            'min_units'    => $quote['min_units'],
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);

        return ['id' => $id] + $quote;
    }

    /**
     * Money received — the exclusivity goes live.
     *
     * Idempotent, and re-checks that nobody else got there first: two affiliates
     * can both reach Paynow for the same product, and only one can win.
     */
    public static function activate(string $exclusivityId, ?string $paymentSessionId = null): bool
    {
        return DB::transaction(function () use ($exclusivityId, $paymentSessionId) {
            $row = DB::table('product_exclusivities')->where('id', $exclusivityId)->lockForUpdate()->first();
            if (! $row) return false;
            if ($row->status === self::ACTIVE) return true;          // already handled

            // Somebody else paid first.
            $taken = DB::table('product_exclusivities')
                ->where('product_id', $row->product_id)
                ->where('id', '!=', $row->id)
                ->where('status', self::ACTIVE)
                ->where('ends_at', '>', now())
                ->exists();

            if ($taken) {
                DB::table('product_exclusivities')->where('id', $row->id)->update([
                    'status'       => self::CANCELLED,
                    'lapse_reason' => 'Another affiliate paid first — fee refundable.',
                    'updated_at'   => now(),
                ]);
                return false;
            }

            DB::table('product_exclusivities')->where('id', $row->id)->update([
                'status'             => self::ACTIVE,
                'starts_at'          => now(),
                'ends_at'            => now()->addDays((int) $row->term_days),
                'units_sold'         => 0,
                'payment_session_id' => $paymentSessionId,
                'updated_at'         => now(),
            ]);

            return true;
        });
    }

    /** Count a sale toward the current term's minimum. */
    public static function recordSale(string $productId, string $affiliateId, int $units = 1): void
    {
        DB::table('product_exclusivities')
            ->where('product_id', $productId)
            ->where('affiliate_id', $affiliateId)
            ->where('status', self::ACTIVE)
            ->where('ends_at', '>', now())
            ->increment('units_sold', max(1, $units));
    }

    /**
     * Close out terms that have run their course.
     *
     * Hit the minimum and the term rolls on at the same fee; miss it and the
     * product goes back on open sale. That performance condition is what stops
     * a paid exclusive quietly removing an item from the shop forever.
     */
    public static function lapseExpired(): int
    {
        $due = DB::table('product_exclusivities')
            ->where('status', self::ACTIVE)
            ->where('ends_at', '<=', now())
            ->get();

        $closed = 0;

        foreach ($due as $row) {
            $met = $row->min_units === 0 || $row->units_sold >= $row->min_units;

            if ($met && $row->auto_renew) {
                DB::table('product_exclusivities')->where('id', $row->id)->update([
                    'starts_at'  => now(),
                    'ends_at'    => now()->addDays((int) $row->term_days),
                    'units_sold' => 0,
                    'updated_at' => now(),
                ]);
                continue;
            }

            DB::table('product_exclusivities')->where('id', $row->id)->update([
                'status'       => self::LAPSED,
                'lapsed_at'    => now(),
                'lapse_reason' => $met
                    ? 'Not renewed.'
                    : "Sold {$row->units_sold} of {$row->min_units} required.",
                'updated_at'   => now(),
            ]);
            $closed++;
        }

        return $closed;
    }

    /** What an affiliate currently holds, for their dashboard. */
    public static function forAffiliate(string $affiliateId): array
    {
        self::lapseExpired();

        return DB::table('product_exclusivities')
            ->join('products', 'products.id', '=', 'product_exclusivities.product_id')
            ->where('product_exclusivities.affiliate_id', $affiliateId)
            ->whereIn('product_exclusivities.status', [self::ACTIVE, self::PENDING])
            ->orderByDesc('product_exclusivities.created_at')
            ->select(
                'product_exclusivities.*',
                'products.title as product_title',
                'products.handle as product_handle',
                'products.thumbnail as product_thumbnail',
            )
            ->get()
            ->map(fn ($r) => (array) $r + [
                'fee_label'   => '$' . number_format($r->fee_amount / 100, 2),
                'progress'    => $r->min_units > 0 ? "{$r->units_sold} of {$r->min_units}" : null,
                'at_risk'     => $r->min_units > 0 && $r->units_sold < $r->min_units,
            ])
            ->all();
    }
}
