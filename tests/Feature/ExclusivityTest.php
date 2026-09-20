<?php

namespace Tests\Feature;

use App\Models\Affiliate;
use App\Models\Product;
use App\Models\Scopes\ExclusivityScope;
use App\Services\Exclusivity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Paid product exclusivity.
 *
 * A held product disappears from the main shop and from every other affiliate.
 * Two properties matter more than the rest:
 *
 *   1. Nothing is purchasable unless BLESSLUXE explicitly enabled it. Because a
 *      grant removes an item from the business's own storefront and is
 *      self-serve, the default must be "not for sale".
 *   2. An exclusive that misses its minimum LAPSES. Otherwise a single payment
 *      could remove a product from the shop indefinitely.
 */
class ExclusivityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        ExclusivityScope::flush();
    }

    private function makeAffiliate(string $id, string $code): Affiliate
    {
        return Affiliate::create([
            'id' => $id, 'code' => $code, 'email' => strtolower($code) . '@x.test',
            'first_name' => $code, 'commission_rate' => 10, 'status' => 'active',
        ]);
    }

    private function makeProduct(string $id, array $attrs = []): void
    {
        DB::table('products')->insert(array_merge([
            'id' => $id, 'title' => ucfirst($id), 'handle' => $id,
            'status' => 'published', 'created_at' => now(), 'updated_at' => now(),
        ], $attrs));
    }

    #[Test]
    public function nothing_is_exclusive_able_unless_admin_enables_it(): void
    {
        $this->makeProduct('prod_a');
        $jane = $this->makeAffiliate('aff_j', 'JANE');

        // The safety default: a self-serve takeover of any product would let an
        // affiliate pull a bestseller off the shop with a card.
        $quote = Exclusivity::quote('prod_a', $jane);
        $this->assertFalse($quote['available']);
        $this->assertStringContainsString('not offered exclusively', $quote['reason']);

        $this->expectException(\RuntimeException::class);
        Exclusivity::beginPurchase('prod_a', $jane);
    }

    #[Test]
    public function an_enabled_product_quotes_its_terms(): void
    {
        $this->makeProduct('prod_a', [
            'exclusivity_enabled' => true, 'exclusivity_fee' => 5000,
            'exclusivity_term_days' => 30, 'exclusivity_min_units' => 5,
        ]);
        $jane = $this->makeAffiliate('aff_j', 'JANE');

        $q = Exclusivity::quote('prod_a', $jane);
        $this->assertTrue($q['available']);
        $this->assertSame('$50.00', $q['fee_label']);
        $this->assertSame(5, $q['min_units']);
        $this->assertStringContainsString('only place this piece is sold', $q['terms']);
        $this->assertStringContainsString('at least 5', $q['terms']);
    }

    #[Test]
    public function an_active_exclusive_hides_the_product_from_the_main_shop(): void
    {
        $this->makeProduct('prod_a', ['exclusivity_enabled' => true, 'exclusivity_fee' => 5000]);
        $this->makeProduct('prod_b');
        $jane = $this->makeAffiliate('aff_j', 'JANE');

        $this->assertCount(2, Product::all());

        $excl = Exclusivity::beginPurchase('prod_a', $jane);
        // Still on open sale — first to PAY wins, not first to click.
        ExclusivityScope::flush();
        $this->assertCount(2, Product::all());

        $this->assertTrue(Exclusivity::activate($excl['id']));
        ExclusivityScope::flush();

        // Gone from every ordinary product query.
        $this->assertSame(['prod_b'], Product::pluck('id')->all());
        // But admin still manages it.
        $this->assertCount(2, Product::withoutGlobalScope(ExclusivityScope::class)->get());
    }

    #[Test]
    public function the_holder_still_sees_their_own_exclusive(): void
    {
        $this->makeProduct('prod_a', ['exclusivity_enabled' => true, 'exclusivity_fee' => 5000]);
        $jane  = $this->makeAffiliate('aff_j', 'JANE');
        $sarah = $this->makeAffiliate('aff_s', 'SARAH');

        Exclusivity::activate(Exclusivity::beginPurchase('prod_a', $jane)['id']);

        $this->assertTrue(Exclusivity::canSell('prod_a', $jane));
        $this->assertFalse(Exclusivity::canSell('prod_a', $sarah));
        $this->assertFalse(Exclusivity::canSell('prod_a', null));   // the main shop

        // Jane's own storefront keeps showing it.
        $this->assertNotContains('prod_a', Exclusivity::hiddenProductIds($jane));
        $this->assertContains('prod_a', Exclusivity::hiddenProductIds($sarah));
    }

    #[Test]
    public function only_one_affiliate_can_hold_a_product(): void
    {
        $this->makeProduct('prod_a', ['exclusivity_enabled' => true, 'exclusivity_fee' => 5000]);
        $jane  = $this->makeAffiliate('aff_j', 'JANE');
        $sarah = $this->makeAffiliate('aff_s', 'SARAH');

        // Both reach Paynow for the same piece — this genuinely happens.
        $janeRow  = Exclusivity::beginPurchase('prod_a', $jane);
        $sarahRow = Exclusivity::beginPurchase('prod_a', $sarah);

        $this->assertTrue(Exclusivity::activate($janeRow['id']));
        // Sarah's payment lands second and must not take it from Jane.
        $this->assertFalse(Exclusivity::activate($sarahRow['id']));

        $held = DB::table('product_exclusivities')->where('status', Exclusivity::ACTIVE)->get();
        $this->assertCount(1, $held);
        $this->assertSame('aff_j', $held->first()->affiliate_id);

        $loser = DB::table('product_exclusivities')->where('id', $sarahRow['id'])->first();
        $this->assertSame(Exclusivity::CANCELLED, $loser->status);
        $this->assertStringContainsString('refundable', $loser->lapse_reason);
    }

    #[Test]
    public function missing_the_minimum_lapses_the_exclusive(): void
    {
        $this->makeProduct('prod_a', [
            'exclusivity_enabled' => true, 'exclusivity_fee' => 5000,
            'exclusivity_term_days' => 30, 'exclusivity_min_units' => 5,
        ]);
        $jane = $this->makeAffiliate('aff_j', 'JANE');

        $excl = Exclusivity::beginPurchase('prod_a', $jane);
        Exclusivity::activate($excl['id']);
        Exclusivity::recordSale('prod_a', 'aff_j', 2);   // short of five

        // Run the term out.
        DB::table('product_exclusivities')->where('id', $excl['id'])->update(['ends_at' => now()->subDay()]);

        Exclusivity::lapseExpired();
        ExclusivityScope::flush();

        $row = DB::table('product_exclusivities')->where('id', $excl['id'])->first();
        $this->assertSame(Exclusivity::LAPSED, $row->status);
        $this->assertStringContainsString('Sold 2 of 5', $row->lapse_reason);

        // Back on open sale — a paid exclusive can't remove an item forever.
        $this->assertContains('prod_a', Product::pluck('id')->all());
    }

    #[Test]
    public function hitting_the_minimum_renews_the_term(): void
    {
        $this->makeProduct('prod_a', [
            'exclusivity_enabled' => true, 'exclusivity_fee' => 5000,
            'exclusivity_term_days' => 30, 'exclusivity_min_units' => 5,
        ]);
        $jane = $this->makeAffiliate('aff_j', 'JANE');

        $excl = Exclusivity::beginPurchase('prod_a', $jane);
        Exclusivity::activate($excl['id']);
        Exclusivity::recordSale('prod_a', 'aff_j', 6);   // beat the minimum

        DB::table('product_exclusivities')->where('id', $excl['id'])->update(['ends_at' => now()->subDay()]);
        Exclusivity::lapseExpired();
        ExclusivityScope::flush();

        $row = DB::table('product_exclusivities')->where('id', $excl['id'])->first();
        $this->assertSame(Exclusivity::ACTIVE, $row->status);
        // Counter resets for the fresh term, or one good month would carry forever.
        $this->assertSame(0, (int) $row->units_sold);
        $this->assertTrue($row->ends_at > now());

        $this->assertNotContains('prod_a', Product::pluck('id')->all());
    }

    #[Test]
    public function an_expired_exclusive_is_lapsed_lazily_on_read(): void
    {
        $this->makeProduct('prod_a', ['exclusivity_enabled' => true, 'exclusivity_fee' => 5000, 'exclusivity_min_units' => 5]);
        $jane = $this->makeAffiliate('aff_j', 'JANE');

        $excl = Exclusivity::beginPurchase('prod_a', $jane);
        Exclusivity::activate($excl['id']);
        DB::table('product_exclusivities')->where('id', $excl['id'])->update(['ends_at' => now()->subDay()]);

        // No cron runs in this deployment, so simply looking must be enough.
        ExclusivityScope::flush();
        $this->assertContains('prod_a', Product::pluck('id')->all());
        $this->assertSame(Exclusivity::LAPSED, DB::table('product_exclusivities')->where('id', $excl['id'])->value('status'));
    }

    #[Test]
    public function a_zero_minimum_renews_indefinitely(): void
    {
        $this->makeProduct('prod_a', [
            'exclusivity_enabled' => true, 'exclusivity_fee' => 5000, 'exclusivity_min_units' => 0,
        ]);
        $jane = $this->makeAffiliate('aff_j', 'JANE');

        $excl = Exclusivity::beginPurchase('prod_a', $jane);
        Exclusivity::activate($excl['id']);
        DB::table('product_exclusivities')->where('id', $excl['id'])->update(['ends_at' => now()->subDay()]);

        Exclusivity::lapseExpired();

        // No performance condition set, so it simply rolls on.
        $this->assertSame(Exclusivity::ACTIVE, DB::table('product_exclusivities')->where('id', $excl['id'])->value('status'));
    }
}
