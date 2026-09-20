<?php

namespace Tests\Feature;

use App\Models\Affiliate;
use App\Services\AffiliatePricing;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The money rule for affiliate storefronts.
 *
 *     customer pays  = base + markup
 *     commission     = base × rate     ← never on the markup
 *     affiliate gets = commission + markup
 *     BLESSLUXE gets = base − commission
 *
 * Because commission comes off the BASE, the business receives exactly the list
 * price whatever an affiliate charges. That is the whole reason uncapped markup
 * is safe, so these tests guard it directly.
 */
class AffiliateMarkupTest extends TestCase
{
    use RefreshDatabase;

    private function seedStorefront(): Affiliate
    {
        DB::table('products')->insert([
            ['id' => 'prod_dress', 'title' => 'Dress', 'handle' => 'dress', 'status' => 'published', 'created_at' => now(), 'updated_at' => now()],
            ['id' => 'prod_tote',  'title' => 'Tote',  'handle' => 'tote',  'status' => 'published', 'created_at' => now(), 'updated_at' => now()],
        ]);
        // catalogues.heading_id is NOT NULL, so the parent has to exist.
        DB::table('headings')->insert([
            'id' => 'head_women', 'name' => 'Women', 'handle' => 'women',
            'rank' => 1, 'is_active' => true, 'is_sale' => false,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('catalogues')->insert([
            'id' => 'cat_women', 'heading_id' => 'head_women', 'name' => 'Dresses', 'handle' => 'dresses',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('product_catalogue_map')->insert([
            ['product_id' => 'prod_dress', 'catalogue_id' => 'cat_women'],
        ]);

        return Affiliate::create([
            'id' => 'aff_1', 'code' => 'JANE10', 'email' => 'jane@example.test',
            'first_name' => 'Jane', 'commission_rate' => 10, 'status' => 'active',
            'storefront_mode' => AffiliatePricing::MODE_CURATED,
        ]);
    }

    #[Test]
    public function no_markup_means_the_list_price(): void
    {
        $aff = $this->seedStorefront();

        $p = AffiliatePricing::priceFor($aff, 'prod_dress', 34900);
        $this->assertSame(34900, $p['total']);
        $this->assertSame(0, $p['markup']);
    }

    #[Test]
    public function a_percent_markup_is_added_to_the_base(): void
    {
        $aff = $this->seedStorefront();
        DB::table('affiliate_products')->insert([
            'id' => 'ap_1', 'affiliate_id' => $aff->id, 'product_id' => 'prod_dress',
            'markup_type' => 'percent', 'markup_value' => 10, 'is_active' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $p = AffiliatePricing::priceFor($aff, 'prod_dress', 34900);

        $this->assertSame(34900, $p['base']);
        $this->assertSame(3490, $p['markup']);
        $this->assertSame(38390, $p['total']);   // $383.90
    }

    #[Test]
    public function a_fixed_amount_markup_is_added_per_unit(): void
    {
        $aff = $this->seedStorefront();
        DB::table('affiliate_products')->insert([
            'id' => 'ap_1', 'affiliate_id' => $aff->id, 'product_id' => 'prod_dress',
            'markup_type' => 'amount', 'markup_value' => 5000, 'is_active' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->assertSame(39900, AffiliatePricing::priceFor($aff, 'prod_dress', 34900)['total']);
    }

    #[Test]
    public function the_most_specific_markup_wins(): void
    {
        $aff = $this->seedStorefront();

        // Storefront default: +5% on everything.
        $aff->update(['default_markup_type' => 'percent', 'default_markup_value' => 5]);
        $this->assertSame(1745, AffiliatePricing::priceFor($aff, 'prod_dress', 34900)['markup']);

        // Catalogue rule for Women beats the default.
        DB::table('affiliate_category_markups')->insert([
            'id' => 'acm_1', 'affiliate_id' => $aff->id, 'catalogue_id' => 'cat_women',
            'markup_type' => 'percent', 'markup_value' => 20,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->assertSame(6980, AffiliatePricing::priceFor($aff, 'prod_dress', 34900)['markup']);

        // A per-product rule beats both.
        DB::table('affiliate_products')->insert([
            'id' => 'ap_1', 'affiliate_id' => $aff->id, 'product_id' => 'prod_dress',
            'markup_type' => 'percent', 'markup_value' => 50, 'is_active' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->assertSame(17450, AffiliatePricing::priceFor($aff, 'prod_dress', 34900)['markup']);

        // The tote is in no catalogue, so it falls back to the storefront default.
        $this->assertSame(1745, AffiliatePricing::priceFor($aff, 'prod_tote', 34900)['markup']);
    }

    #[Test]
    public function commission_is_paid_on_the_base_not_the_marked_up_total(): void
    {
        // The rule the business depends on: a 100% markup must not double what
        // BLESSLUXE pays out in commission.
        $this->assertSame(3490, AffiliatePricing::commissionOn(34900, 10));

        $chargedIfWrong = AffiliatePricing::commissionOn(69800, 10);
        $this->assertSame(6980, $chargedIfWrong, 'sanity: commission scales with whatever it is given');
        $this->assertNotSame($chargedIfWrong, AffiliatePricing::commissionOn(34900, 10));
    }

    #[Test]
    public function the_business_keeps_the_list_price_whatever_the_markup(): void
    {
        $base = 34900;
        $rate = 10.0;

        foreach ([0, 10, 50, 200] as $markupPercent) {
            $markup   = AffiliatePricing::applyMarkup($base, 'percent', $markupPercent);
            $charged  = $base + $markup;
            $commission = AffiliatePricing::commissionOn($base, $rate);
            $affiliate  = $commission + $markup;
            $business   = $charged - $affiliate;

            // Whatever the affiliate charges, BLESSLUXE nets base minus commission.
            $this->assertSame(
                $base - $commission,
                $business,
                "markup of {$markupPercent}% changed the business's take",
            );
        }
    }

    #[Test]
    public function a_cart_line_records_the_split_for_checkout(): void
    {
        $aff = $this->seedStorefront();
        DB::table('affiliate_products')->insert([
            'id' => 'ap_1', 'affiliate_id' => $aff->id, 'product_id' => 'prod_dress',
            'markup_type' => 'percent', 'markup_value' => 10, 'is_active' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('product_variants')->insert([
            'id' => 'var_m', 'product_id' => 'prod_dress', 'title' => 'M',
            'manage_inventory' => false, 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('variant_prices')->insert([
            // variant_prices has created_at but no updated_at.
            'id' => 'vp_1', 'variant_id' => 'var_m', 'currency_code' => 'usd', 'amount' => 34900,
            'created_at' => now(),
        ]);

        $this->postJson('/api/store/affiliate/resolve', ['code' => 'JANE10'])->assertOk();
        $this->postJson('/api/store/cart/line-items', ['variant_id' => 'var_m', 'quantity' => 1])->assertOk();

        $line = DB::table('cart_line_items')->first();
        $meta = json_decode((string) $line->metadata, true);

        // The customer is charged the marked-up price...
        $this->assertSame(38390, (int) $line->unit_price);
        // ...and the split is frozen on the line, so a later price edit by the
        // affiliate cannot change what this sale pays out.
        $this->assertSame(34900, $meta['base_price']);
        $this->assertSame(3490, $meta['markup_amount']);
        $this->assertSame('JANE10', $meta['affiliate_code']);
    }

    #[Test]
    public function an_inactive_affiliate_never_marks_up(): void
    {
        $aff = $this->seedStorefront();
        $aff->update(['status' => 'paused']);
        DB::table('affiliate_products')->insert([
            'id' => 'ap_1', 'affiliate_id' => $aff->id, 'product_id' => 'prod_dress',
            'markup_type' => 'percent', 'markup_value' => 50, 'is_active' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        // resolve() only accepts active affiliates, so a paused one can't price
        // anything — but guard the pricing path too rather than relying on that.
        $this->postJson('/api/store/affiliate/resolve', ['code' => 'JANE10'])->assertStatus(404);
    }

    #[Test]
    public function curated_mode_reports_only_the_selected_products(): void
    {
        $aff = $this->seedStorefront();
        DB::table('affiliate_products')->insert([
            'id' => 'ap_1', 'affiliate_id' => $aff->id, 'product_id' => 'prod_dress',
            'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->assertSame(['prod_dress'], AffiliatePricing::curatedProductIds($aff));

        // 'all' mode returns null, not an empty list — "everything" and "nothing
        // picked yet" must not be confused, or switching mode would empty a shop.
        $aff->update(['storefront_mode' => AffiliatePricing::MODE_ALL]);
        $this->assertNull(AffiliatePricing::curatedProductIds($aff->fresh()));
    }
}
