<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Which courier carries an import, and what it costs.
 *
 * Only IMPORT stock is carried by a courier from the supplier. Local stock is
 * already in Zimbabwe, so it attracts no import shipping at all — quoting a courier
 * fee on it would overcharge. `products.sourcing` defaults to 'local' for exactly
 * that reason: the safe direction.
 *
 * Distinct from App\Services\Carriers, which is a static registry of tracking-URL
 * templates. This is the priced, admin-editable list a buyer chooses from.
 */
class Couriers
{
    public const LOCAL  = 'local';
    public const IMPORT = 'import';

    /** @return \Illuminate\Support\Collection<int,object> */
    public static function active()
    {
        return DB::table('couriers')
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get();
    }

    /** Every courier, deactivated ones included — for the admin management screen. */
    public static function all(): array
    {
        return DB::table('couriers')
            ->orderBy('is_active', 'desc')
            ->orderBy('sort_order')
            ->get()
            ->map(fn ($c) => array_merge((array) $c, [
                'base_fee_label'     => '$' . number_format($c->base_fee / 100, 2),
                'per_item_fee_label' => '$' . number_format($c->per_item_fee / 100, 2),
                'is_active'          => (bool) $c->is_active,
                'is_default'         => (bool) $c->is_default,
                // Deleting a courier that carried goods would erase how they
                // travelled, so the UI shows this and offers deactivation instead.
                'in_use'             => DB::table('pack_slots')->where('courier_id', $c->id)->exists()
                                     || DB::table('packages')->where('courier_id', $c->id)->exists()
                                     || DB::table('products')->where('default_courier_id', $c->id)->exists(),
            ]))
            ->all();
    }

    public static function find(?string $id): ?object
    {
        if (! $id) return null;

        return DB::table('couriers')
            ->where('id', $id)
            ->orWhere('code', $id)
            ->first();
    }

    public static function default(): ?object
    {
        return DB::table('couriers')->where('is_active', true)->where('is_default', true)->first()
            ?: self::active()->first();
    }

    /** True when this product has to be carried in by a courier. */
    public static function productNeedsShipping(?string $productId): bool
    {
        if (! $productId) return false;

        return DB::table('products')->where('id', $productId)->value('sourcing') === self::IMPORT;
    }

    /**
     * Quote one courier for a number of imported items.
     *
     * Flat base plus per-item, which is how consolidated freight is actually priced
     * locally. Weight-based pricing is deliberately out of scope — products carry no
     * weight, and inventing one would produce confident nonsense.
     */
    public static function quote(?string $courierId, int $itemCount): array
    {
        $courier = self::find($courierId) ?: self::default();

        if (! $courier || $itemCount < 1) {
            return [
                'courier_id' => $courier->id ?? null,
                'courier'    => $courier->name ?? null,
                'amount'     => 0,
                'label'      => '$0.00',
                'eta_days'   => null,
            ];
        }

        $amount = (int) $courier->base_fee + ((int) $courier->per_item_fee * $itemCount);

        return [
            'courier_id'  => $courier->id,
            'courier'     => $courier->name,
            'description' => $courier->description,
            'amount'      => $amount,
            'label'       => '$' . number_format($amount / 100, 2),
            'eta_days'    => $courier->min_days && $courier->max_days
                ? "{$courier->min_days}–{$courier->max_days} days"
                : null,
        ];
    }

    /**
     * Every courier priced for this basket, so the buyer can compare.
     *
     * Returns an empty list when nothing in the basket is an import — that is the
     * signal for the UI to show no shipping section at all, rather than a $0 row
     * that invites the question "why is shipping free?".
     */
    public static function optionsFor(int $importItemCount): array
    {
        if ($importItemCount < 1) return [];

        return self::active()
            ->map(fn ($c) => array_merge(self::quote($c->id, $importItemCount), [
                'is_default' => (bool) $c->is_default,
            ]))
            ->all();
    }

    /**
     * Split a basket into what needs a courier and what does not.
     *
     * @param  iterable  $lines  anything with ->variant_id and ->quantity
     */
    public static function splitBasket(iterable $lines): array
    {
        $import = [];
        $local  = [];

        foreach ($lines as $line) {
            $productId = DB::table('product_variants')->where('id', $line->variant_id)->value('product_id');
            $needs = self::productNeedsShipping($productId);
            $needs ? $import[] = $line : $local[] = $line;
        }

        return [
            'import' => $import,
            'local'  => $local,
            'import_count' => array_sum(array_map(fn ($l) => (int) $l->quantity, $import)),
            'local_count'  => array_sum(array_map(fn ($l) => (int) $l->quantity, $local)),
            'needs_shipping' => count($import) > 0,
        ];
    }
}
