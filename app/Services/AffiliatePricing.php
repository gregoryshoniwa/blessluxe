<?php

namespace App\Services;

use App\Models\Affiliate;
use Illuminate\Support\Facades\DB;

/**
 * What a product costs on an affiliate's storefront.
 *
 * THE MONEY RULE, in one place so it can't drift:
 *
 *     customer pays  = base + markup
 *     commission     = base × rate        ← never on the markup
 *     affiliate gets = commission + markup
 *     BLESSLUXE gets = base − commission
 *
 * Because commission is calculated on the BASE, BLESSLUXE receives exactly the
 * list price on every sale regardless of what an affiliate charges. That is what
 * makes uncapped markup safe: an affiliate pricing at +200% takes all of the
 * extra and costs the business nothing.
 *
 * Markup resolves most-specific-first: the product's own markup, then the
 * affiliate's markup for that catalogue, then their storefront default, then none.
 */
class AffiliatePricing
{
    public const MODE_ALL     = 'all';
    public const MODE_CURATED = 'curated';

    public const MARKUP_PERCENT = 'percent';
    public const MARKUP_AMOUNT  = 'amount';

    /**
     * Split a base price into what the customer pays and who gets what.
     *
     * @return array{base:int, markup:int, total:int, markup_type:?string, markup_value:?int}
     */
    public static function priceFor(?Affiliate $affiliate, string $productId, int $basePrice): array
    {
        $none = [
            'base' => $basePrice, 'markup' => 0, 'total' => $basePrice,
            'markup_type' => null, 'markup_value' => null,
        ];

        if (! $affiliate || $basePrice <= 0) return $none;

        $rule = self::markupRuleFor($affiliate, $productId);
        if (! $rule) return $none;

        $markup = self::applyMarkup($basePrice, $rule['type'], $rule['value']);
        if ($markup <= 0) return $none;

        return [
            'base'         => $basePrice,
            'markup'       => $markup,
            'total'        => $basePrice + $markup,
            'markup_type'  => $rule['type'],
            'markup_value' => $rule['value'],
        ];
    }

    /** Most specific rule wins: product → catalogue → storefront default. */
    private static function markupRuleFor(Affiliate $affiliate, string $productId): ?array
    {
        $row = DB::table('affiliate_products')
            ->where('affiliate_id', $affiliate->id)
            ->where('product_id', $productId)
            ->where('is_active', true)
            ->first();

        if ($row && $row->markup_type && $row->markup_value !== null) {
            return ['type' => $row->markup_type, 'value' => (int) $row->markup_value];
        }

        // The catalogue pivot is product_catalogue_map, not Laravel's default name.
        $cat = DB::table('affiliate_category_markups')
            ->join('product_catalogue_map', 'product_catalogue_map.catalogue_id', '=', 'affiliate_category_markups.catalogue_id')
            ->where('affiliate_category_markups.affiliate_id', $affiliate->id)
            ->where('product_catalogue_map.product_id', $productId)
            ->select('affiliate_category_markups.markup_type', 'affiliate_category_markups.markup_value')
            ->first();

        if ($cat) {
            return ['type' => $cat->markup_type, 'value' => (int) $cat->markup_value];
        }

        if ($affiliate->default_markup_type && $affiliate->default_markup_value !== null) {
            return ['type' => $affiliate->default_markup_type, 'value' => (int) $affiliate->default_markup_value];
        }

        return null;
    }

    /** Percent markups round to the nearest cent; amounts are already cents. */
    public static function applyMarkup(int $base, ?string $type, ?int $value): int
    {
        if (! $type || ! $value || $value <= 0) return 0;

        return $type === self::MARKUP_PERCENT
            ? (int) round($base * $value / 100)
            : (int) $value;
    }

    /**
     * Commission for an attributed line.
     *
     * Takes the BASE, never the charged total — the affiliate already keeps the
     * whole markup, so paying commission on it too would have the business
     * funding an uplift it never received.
     */
    public static function commissionOn(int $baseTotal, float $rate): int
    {
        return (int) round($baseTotal * $rate / 100);
    }

    /** True when this affiliate sells a hand-picked line rather than the whole shop. */
    public static function isCurated(?Affiliate $affiliate): bool
    {
        return $affiliate?->storefront_mode === self::MODE_CURATED;
    }

    /**
     * Product ids an affiliate is selling, or null when they mirror the whole shop.
     *
     * Null rather than an empty array is deliberate: "everything" and "nothing
     * selected yet" are different, and conflating them would silently empty a
     * storefront the moment someone switched to curated mode.
     */
    public static function curatedProductIds(?Affiliate $affiliate): ?array
    {
        if (! self::isCurated($affiliate)) return null;

        return DB::table('affiliate_products')
            ->where('affiliate_id', $affiliate->id)
            ->where('is_active', true)
            ->orderBy('position')
            ->pluck('product_id')
            ->all();
    }
}
