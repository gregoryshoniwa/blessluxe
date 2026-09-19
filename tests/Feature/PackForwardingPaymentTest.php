<?php

namespace Tests\Feature;

use App\Services\PackForwarding;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The money test.
 *
 * PaynowController creates an Order for any paid session that has no order_id.
 * A forwarding fee is exactly that — a paid session with no order — so without the
 * `kind` discriminator a shipping fee would mint a second Order whose total is the
 * fee, credit Blits on it, and potentially accrue affiliate commission.
 *
 * These assertions exist so that regression can never land silently.
 */
class PackForwardingPaymentTest extends TestCase
{
    use RefreshDatabase;

    private function makeSlotWithOrder(): array
    {
        // pack_slots.variant_id is a real FK, so the parent rows have to exist.
        DB::table('products')->insert([
            'id' => 'prod_test', 'title' => 'Test Dress', 'handle' => 'test-dress',
            'status' => 'published', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('product_variants')->insert([
            'id' => 'var_test', 'product_id' => 'prod_test', 'title' => 'M',
            'sku' => 'test-m', 'created_at' => now(), 'updated_at' => now(),
        ]);

        DB::table('orders')->insert([
            'id' => 'order_test1', 'order_number' => 'BL-TEST-0001',
            'email' => 'buyer@example.test', 'currency_code' => 'usd',
            'total' => 34900, 'subtotal' => 34900, 'shipping_total' => 0,
            'discount_total' => 0, 'tax_total' => 0,
            'status' => 'completed', 'payment_status' => 'paid',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        DB::table('pack_definitions')->insert([
            'id' => 'pdef_test', 'pack_kind' => 'single', 'title' => 'Test pack',
            'handle' => 'test-pack', 'status' => 'published',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        DB::table('pack_campaigns')->insert([
            'id' => 'pcam_test', 'pack_definition_id' => 'pdef_test',
            'host_kind' => 'admin', 'public_code' => 'TESTPACK01',
            'status' => 'open', 'created_at' => now(), 'updated_at' => now(),
        ]);

        DB::table('pack_slots')->insert([
            'id' => 'pslot_test', 'pack_campaign_id' => 'pcam_test',
            'variant_id' => 'var_test', 'size_label' => 'M',
            'status' => 'paid', 'order_id' => 'order_test1',
            'delivery_preference' => 'forward', 'forward_fee_amount' => 2500,
            'forward_fee_status' => 'quoted',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        DB::table('payment_sessions')->insert([
            'id' => 'ps_fee1', 'reference' => 'FEE-REF-1',
            'provider' => 'paynow', 'kind' => PackForwarding::SESSION_KIND,
            'status' => 'pending', 'amount' => 2500, 'currency_code' => 'usd',
            'order_id' => null,
            'cart_snapshot' => json_encode([
                'kind' => PackForwarding::SESSION_KIND,
                'pack_slot_id' => 'pslot_test',
                'fee_amount' => 2500,
            ]),
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return ['slot' => 'pslot_test', 'session' => 'ps_fee1'];
    }

    #[Test]
    public function paying_a_forwarding_fee_creates_no_order_and_no_blits(): void
    {
        $this->makeSlotWithOrder();

        $ordersBefore = DB::table('orders')->count();
        $blitsBefore  = DB::table('blits_ledger')->count();
        $affBefore    = DB::table('affiliate_sales')->count();

        PackForwarding::markFeePaid(\App\Models\PaymentSession::find('ps_fee1'));

        $this->assertSame($ordersBefore, DB::table('orders')->count(), 'A shipping fee must never create an Order.');
        $this->assertSame($blitsBefore, DB::table('blits_ledger')->count(), 'A shipping fee must never earn Blits.');
        $this->assertSame($affBefore, DB::table('affiliate_sales')->count(), 'A shipping fee must never accrue affiliate commission.');

        $this->assertSame('paid', DB::table('pack_slots')->where('id', 'pslot_test')->value('forward_fee_status'));
    }

    #[Test]
    public function a_duplicate_ipn_is_a_no_op(): void
    {
        $this->makeSlotWithOrder();
        DB::table('users')->insert([
            'id' => 1, 'name' => 'Admin', 'email' => 'a@b.test',
            'password' => 'x', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $session = \App\Models\PaymentSession::find('ps_fee1');

        PackForwarding::markFeePaid($session);
        $ordersAfterFirst = DB::table('orders')->count();
        $notesAfterFirst  = DB::table('notifications')->count();

        // IPN and the return-poll both fire in practice; the second must do nothing.
        PackForwarding::markFeePaid($session->fresh());

        $this->assertSame($ordersAfterFirst, DB::table('orders')->count());
        $this->assertSame(1, DB::table('pack_slots')->where('forward_fee_status', 'paid')->count());

        // The observable duplicate: without the guard, admin is told twice that a
        // fee was paid. Asserting the status alone would pass either way, since
        // re-setting paid -> paid changes nothing.
        $this->assertSame(
            $notesAfterFirst,
            DB::table('notifications')->count(),
            'A repeated IPN must not notify admin twice.'
        );
        $this->assertGreaterThan(0, $notesAfterFirst, 'The first payment should notify admin once.');
    }

    #[Test]
    public function collect_is_the_default_so_a_piece_is_never_stranded(): void
    {
        $this->makeSlotWithOrder();

        DB::table('pack_slots')->insert([
            'id' => 'pslot_default', 'pack_campaign_id' => 'pcam_test',
            'variant_id' => 'var_test', 'size_label' => 'L', 'status' => 'paid',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->assertSame(
            'collect',
            DB::table('pack_slots')->where('id', 'pslot_default')->value('delivery_preference'),
            'Default must be collect: it is free, needs no address and owes nothing.'
        );
    }

    #[Test]
    public function switching_away_from_a_paid_forward_is_refused(): void
    {
        $this->makeSlotWithOrder();
        PackForwarding::markFeePaid(\App\Models\PaymentSession::find('ps_fee1'));

        // Self-serve here would silently create a refund liability.
        $this->expectException(\RuntimeException::class);
        PackForwarding::setPreference('pslot_test', PackForwarding::PREF_COLLECT);
    }

    #[Test]
    public function preference_cannot_change_once_locked(): void
    {
        $this->makeSlotWithOrder();
        DB::table('pack_slots')->where('id', 'pslot_test')->update(['preference_locked_at' => now()]);

        $this->expectException(\RuntimeException::class);
        PackForwarding::setPreference('pslot_test', PackForwarding::PREF_FORWARD, [
            'first_name' => 'A', 'line1' => '1 St', 'city' => 'Harare', 'country' => 'ZW',
        ]);
    }

    #[Test]
    public function forwarding_requires_a_labellable_address(): void
    {
        $this->makeSlotWithOrder();
        DB::table('pack_slots')->where('id', 'pslot_test')->update(['forward_fee_status' => 'none']);

        // orders.shipping_address has no name or phone, so it can never be used here.
        $this->expectException(\RuntimeException::class);
        PackForwarding::setPreference('pslot_test', PackForwarding::PREF_FORWARD, [
            'line1' => '1 St', 'city' => 'Harare', 'country' => 'ZW',
        ]);
    }
}
