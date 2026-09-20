<?php

namespace Tests\Feature;

use App\Models\Affiliate;
use App\Models\PaymentSession;
use App\Models\Scopes\ExclusivityScope;
use App\Services\Exclusivity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Paying for exclusivity.
 *
 * Same hazard as the pack-forwarding fee: PaynowController mints an Order for
 * any paid session without one, so an exclusivity fee must be discriminated by
 * `kind` or a $50 payment becomes a $50 "sale" that earns Blits.
 */
class ExclusivityPaymentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        ExclusivityScope::flush();
    }

    private function setup2(): array
    {
        DB::table('products')->insert([
            'id' => 'prod_a', 'title' => 'Dress', 'handle' => 'dress', 'status' => 'published',
            'exclusivity_enabled' => true, 'exclusivity_fee' => 5000,
            'exclusivity_term_days' => 30, 'exclusivity_min_units' => 3,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $customer = \App\Models\Customer::create([
            'id' => 'cust_1', 'email' => 'jane@example.test', 'first_name' => 'Jane',
            'password' => bcrypt('x'),
        ]);

        $aff = Affiliate::create([
            'id' => 'aff_1', 'code' => 'JANE', 'email' => 'jane@example.test',
            'first_name' => 'Jane', 'commission_rate' => 10, 'status' => 'active',
            'customer_id' => $customer->id,
        ]);

        return [$customer, $aff];
    }

    private function paidSession(string $exclusivityId): PaymentSession
    {
        return PaymentSession::create([
            'id' => 'payses_x', 'reference' => 'EXCL-1', 'provider' => 'paynow',
            'kind' => Exclusivity::SESSION_KIND, 'status' => 'pending',
            'amount' => 5000, 'currency_code' => 'usd', 'email' => 'jane@example.test',
            'order_id' => null,
            'cart_snapshot' => [
                'kind' => Exclusivity::SESSION_KIND,
                'exclusivity_id' => $exclusivityId,
                'product_id' => 'prod_a',
            ],
        ]);
    }

    #[Test]
    public function paying_the_fee_creates_no_order_and_no_blits(): void
    {
        [, $aff] = $this->setup2();
        $excl = Exclusivity::beginPurchase('prod_a', $aff);
        $session = $this->paidSession($excl['id']);

        $ordersBefore = DB::table('orders')->count();
        $blitsBefore  = DB::table('blits_ledger')->count();

        // What the IPN branch does on `paid`.
        Exclusivity::activate($excl['id'], $session->id);

        $this->assertSame($ordersBefore, DB::table('orders')->count(), 'A right is not a sale.');
        $this->assertSame($blitsBefore, DB::table('blits_ledger')->count());
        $this->assertSame(Exclusivity::ACTIVE, DB::table('product_exclusivities')->where('id', $excl['id'])->value('status'));
    }

    #[Test]
    public function the_product_leaves_the_main_shop_only_once_paid(): void
    {
        [, $aff] = $this->setup2();
        $excl = Exclusivity::beginPurchase('prod_a', $aff);

        // Reserved but unpaid — still on open sale, because first to PAY wins.
        ExclusivityScope::flush();
        $this->assertContains('prod_a', \App\Models\Product::pluck('id')->all());

        Exclusivity::activate($excl['id'], 'payses_x');
        ExclusivityScope::flush();

        $this->assertNotContains('prod_a', \App\Models\Product::pluck('id')->all());
    }

    #[Test]
    public function a_second_payer_loses_and_is_flagged_for_refund(): void
    {
        [, $jane] = $this->setup2();
        $sarahCustomer = \App\Models\Customer::create([
            'id' => 'cust_2', 'email' => 's@example.test', 'first_name' => 'Sarah', 'password' => bcrypt('x'),
        ]);
        $sarah = Affiliate::create([
            'id' => 'aff_2', 'code' => 'SARAH', 'email' => 's@example.test',
            'first_name' => 'Sarah', 'commission_rate' => 10, 'status' => 'active',
            'customer_id' => $sarahCustomer->id,
        ]);

        $janeRow  = Exclusivity::beginPurchase('prod_a', $jane);
        $sarahRow = Exclusivity::beginPurchase('prod_a', $sarah);

        $this->assertTrue(Exclusivity::activate($janeRow['id'], 'payses_j'));
        // Sarah's money arrives second — she must not take it from Jane.
        $this->assertFalse(Exclusivity::activate($sarahRow['id'], 'payses_s'));

        $loser = DB::table('product_exclusivities')->where('id', $sarahRow['id'])->first();
        $this->assertSame(Exclusivity::CANCELLED, $loser->status);
        $this->assertStringContainsString('refundable', $loser->lapse_reason);
    }

    #[Test]
    public function an_affiliate_cannot_pay_for_someone_elses_reservation(): void
    {
        [$jane] = $this->setup2();
        $otherCustomer = \App\Models\Customer::create([
            'id' => 'cust_2', 'email' => 'x@example.test', 'first_name' => 'X', 'password' => bcrypt('x'),
        ]);
        $other = Affiliate::create([
            'id' => 'aff_2', 'code' => 'OTHER', 'email' => 'x@example.test',
            'first_name' => 'X', 'commission_rate' => 10, 'status' => 'active',
            'customer_id' => $otherCustomer->id,
        ]);

        $theirs = Exclusivity::beginPurchase('prod_a', $other);

        // A reservation id alone must never be enough.
        $this->actingAs($jane, 'customer')
            ->postJson("/api/store/payments/paynow/exclusivity/{$theirs['id']}")
            ->assertStatus(403);
    }

    #[Test]
    public function checkout_counts_units_toward_the_minimum(): void
    {
        [, $aff] = $this->setup2();
        $excl = Exclusivity::beginPurchase('prod_a', $aff);
        Exclusivity::activate($excl['id'], 'payses_x');

        // Without this being called at checkout, every exclusive would lapse at
        // the end of its first term no matter how well it sold.
        Exclusivity::recordSale('prod_a', $aff->id, 2);
        Exclusivity::recordSale('prod_a', $aff->id, 1);

        $this->assertSame(3, (int) DB::table('product_exclusivities')->where('id', $excl['id'])->value('units_sold'));

        DB::table('product_exclusivities')->where('id', $excl['id'])->update(['ends_at' => now()->subDay()]);
        Exclusivity::lapseExpired();

        // Minimum met, so the term rolls on.
        $this->assertSame(Exclusivity::ACTIVE, DB::table('product_exclusivities')->where('id', $excl['id'])->value('status'));
    }

    #[Test]
    public function a_reservation_cannot_be_paid_twice(): void
    {
        [$jane, $aff] = $this->setup2();
        $excl = Exclusivity::beginPurchase('prod_a', $aff);
        Exclusivity::activate($excl['id'], 'payses_x');

        $this->actingAs($jane, 'customer')
            ->postJson("/api/store/payments/paynow/exclusivity/{$excl['id']}")
            ->assertStatus(422);
    }
}
