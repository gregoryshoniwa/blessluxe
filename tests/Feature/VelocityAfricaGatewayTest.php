<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\PaymentSession;
use App\Services\Payments\Payments;
use App\Services\Payments\VelocityAfrica;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * VelocityAfrica, end to end against a fake of their API, following their
 * "Accept payments" guide: sales order → transaction → poll → mark paid.
 * There are no webhooks, so everything a customer sees comes from polling.
 */
class VelocityAfricaGatewayTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.paynow' => [],
            'services.velocityafrica' => ['api_key' => 'vk_test', 'base_url' => 'https://api.velocityafrica.net', 'merchant_phone' => '0772364284', 'merchant_account' => '', 'region' => 'ZW', 'item_code' => 'BLESSLUXE-ORDER'],
            'app.url' => 'https://shop.test',
        ]);
        DB::table('customers')->insert(['id' => 'cust_1', 'email' => 'rudo@example.test', 'password' => bcrypt('x'), 'first_name' => 'Rudo', 'last_name' => 'Moyo', 'loyalty_points' => 500, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('products')->insert(['id' => 'prod_1', 'title' => 'Silk Dress', 'handle' => 'dress', 'status' => 'published', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('product_variants')->insert(['id' => 'var_1', 'product_id' => 'prod_1', 'title' => 'M', 'manage_inventory' => true, 'inventory_quantity' => 5, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('variant_prices')->insert(['id' => 'vp_1', 'variant_id' => 'var_1', 'currency_code' => 'usd', 'amount' => 4500, 'created_at' => now()]);
        Payments::setConfig(['gateways' => ['velocityafrica' => ['enabled' => true]], 'routes' => ['ecocash' => 'velocityafrica', 'card' => 'velocityafrica']]);
    }

    private function shopper(): static
    {
        Auth::forgetGuards();
        $t = $this->actingAs(Customer::find('cust_1'), 'customer');
        $t->postJson('/api/store/cart/line-items', ['variant_id' => 'var_1', 'quantity' => 2])->assertSuccessful();

        return $t;
    }

    /** Velocity as the guide describes it. `$poll` is what each poll answers, in order. */
    private function fakeVelocity(array $poll = ['PENDING', 'SUCCESS'], array $txExtra = []): void
    {
        Http::fake([
            'api.velocityafrica.net/sales-orders' => Http::response(['externalId' => 'so-trace-1', 'body' => ['grandTotal' => 90.0, 'status' => 'UNPAID']], 201),
            'api.velocityafrica.net/transactions' => Http::response(['body' => ['trace' => 'tx-trace-1', 'paymentStatus' => 'PENDING', 'pollStatus' => 'PENDING'] + $txExtra], 201),
            'api.velocityafrica.net/transactions/poll/*' => Http::sequence(array_map(fn ($s) => Http::response(['body' => ['pollStatus' => $s, 'paymentStatus' => $s]]), $poll)),
            'api.velocityafrica.net/sales-orders/update-workflow/*' => Http::response(['body' => ['salesOrder' => ['status' => 'PAID']]]),
        ]);
    }

    // ─── EcoCash: a USSD prompt, then we poll ──────────────────────────────

    #[Test]
    public function ecocash_creates_a_sales_order_then_a_transaction_and_the_shopper_waits_for_the_prompt(): void
    {
        $this->fakeVelocity();

        $res = $this->shopper()->postJson('/api/store/payments/initiate', ['option' => 'velocityafrica:ecocash', 'phone' => '077 123 4567', 'email' => 'rudo@example.test'])->assertOk();

        $this->assertNull($res->json('redirect_url'));                                   // nobody is redirected
        $this->assertStringContainsString('Approve the EcoCash prompt on +263771234567', $res->json('instruction'));
        $this->assertSame('/checkout/return?reference=' . $res->json('reference'), $res->json('return_path'));

        // Exactly the guide's calls, in order, with the merchant as the credit party and our reference as debitRef.
        Http::assertSentInOrder([
            fn (ClientRequest $r) => str_ends_with($r->url(), '/sales-orders') && $r['currencyCodeString'] === 'USD' && $r['items'][0]['amount'] == 90.0 && $r['items'][0]['itemCode'] === 'BLESSLUXE-ORDER' && $r->hasHeader('X-API-Key', 'vk_test'),
            fn (ClientRequest $r) => str_ends_with($r->url(), '/transactions') && $r['paymentProcessorLabel'] === 'ECOCASH' && $r['authType'] === 'REMOTE'
                && $r['debitPhone'] === '+263771234567' && $r['creditPhone'] === '+263772364284' && $r['creditAccount'] === '263772364284'
                && $r['salesOrderId'] === 'so-trace-1' && $r['amount'] == 90.0 && $r['debitRef'] === $res->json('reference') && ! isset($r['successUrl']),
        ]);

        $s = PaymentSession::where('reference', $res->json('reference'))->first();
        $this->assertSame(['velocityafrica', 'ecocash', 'pending', 'tx-trace-1'], [$s->provider, $s->method, $s->status, $s->poll_url]);
        $this->assertSame('so-trace-1', $s->provider_meta['sales_order_id']);
        $this->assertSame(0, DB::table('orders')->count());

        // First status check: still pending, and the page is told what to say.
        $this->getJson('/api/store/payments/status/' . $s->reference)->assertOk()->assertJsonPath('session.status', 'pending')->assertJsonPath('session.provider_label', 'VelocityAfrica')
            ->assertJsonPath('session.instruction', $res->json('instruction'));

        // Second check (after the throttle window): SUCCESS → the order exists, the sales order is marked paid, stock moved, the cart is empty.
        DB::table('payment_sessions')->where('id', $s->id)->update(['provider_meta' => json_encode($s->provider_meta + ['polled_at' => now()->timestamp - 10])]);
        $this->getJson('/api/store/payments/status/' . $s->reference)->assertOk()->assertJsonPath('session.status', 'paid');

        $s = $s->fresh();
        $this->assertNotNull($s->order_id);
        $order = DB::table('orders')->where('id', $s->order_id)->first();
        $this->assertSame(['ecocash', 'paid', 9000], [$order->payment_method, $order->payment_status, (int) $order->total]);
        $this->assertSame(3, (int) DB::table('product_variants')->where('id', 'var_1')->value('inventory_quantity'));
        $this->assertTrue($s->provider_meta['sales_order_completed']);
        Http::assertSent(fn (ClientRequest $r) => str_ends_with($r->url(), '/sales-orders/update-workflow/so-trace-1') && $r->method() === 'PUT');
        $this->assertSame(0, DB::table('cart_line_items')->count());

        // Polling again after paid asks Velocity nothing more.
        Http::assertSentCount(5);
        $this->getJson('/api/store/payments/status/' . $s->reference)->assertJsonPath('session.status', 'paid');
        Http::assertSentCount(5);
    }

    #[Test]
    public function a_failed_prompt_gives_bees_back_and_leaves_no_order(): void
    {
        $this->fakeVelocity(['FAILED']);

        $res = $this->shopper()->postJson('/api/store/payments/initiate', ['option' => 'velocityafrica:ecocash', 'phone' => '0771234567', 'bees_to_use' => 200])->assertOk();
        $this->assertSame(300, (int) DB::table('customers')->where('id', 'cust_1')->value('loyalty_points'));   // debited up front

        $this->getJson('/api/store/payments/status/' . $res->json('reference'))->assertJsonPath('session.status', 'failed');

        $this->assertSame(500, (int) DB::table('customers')->where('id', 'cust_1')->value('loyalty_points'));   // …and returned
        $this->assertSame(0, DB::table('orders')->count());
        Http::assertNotSent(fn (ClientRequest $r) => str_contains($r->url(), 'update-workflow'));
    }

    // ─── Cards: a redirect ─────────────────────────────────────────────────

    #[Test]
    public function a_card_payment_redirects_to_velocitys_checkout_and_comes_back_through_return(): void
    {
        $this->fakeVelocity(['SUCCESS'], ['checkoutUrl' => 'https://pay.velocityafrica.net/c/abc123']);

        $res = $this->shopper()->postJson('/api/store/payments/initiate', ['option' => 'velocityafrica:card', 'phone' => '+263771234567'])->assertOk();

        $this->assertSame('https://pay.velocityafrica.net/c/abc123', $res->json('redirect_url'));
        Http::assertSent(fn (ClientRequest $r) => str_ends_with($r->url(), '/transactions') && $r['paymentProcessorLabel'] === 'VMC' && $r['authType'] === 'WEB'
            && $r['successUrl'] === 'https://shop.test/api/store/payments/return?reference=' . $res->json('reference') && $r['cancelUrl'] === $r['successUrl']);

        // Back from Velocity: one poll, paid, straight to the confirmation.
        $this->get('/api/store/payments/return?reference=' . $res->json('reference'))
            ->assertRedirect('/checkout/confirmation?order=' . urlencode($res->json('reference')));
        $this->assertSame(1, DB::table('orders')->count());
    }

    #[Test]
    public function a_card_response_without_a_checkout_link_is_refused_plainly_and_charges_nothing(): void
    {
        $this->fakeVelocity();                     // no URL in the transaction response

        $res = $this->shopper()->postJson('/api/store/payments/initiate', ['option' => 'velocityafrica:card', 'phone' => '0771234567', 'bees_to_use' => 100])->assertStatus(502);

        $this->assertStringContainsString("didn't return a card checkout link", $res->json('error'));
        $this->assertSame(0, PaymentSession::count());                                                     // nothing half-started
        $this->assertSame(500, (int) DB::table('customers')->where('id', 'cust_1')->value('loyalty_points'));   // Bees back
    }

    // ─── Input ─────────────────────────────────────────────────────────────

    #[Test]
    public function velocity_needs_a_phone_and_normalises_zimbabwean_numbers(): void
    {
        $this->fakeVelocity();

        $this->shopper()->postJson('/api/store/payments/initiate', ['option' => 'velocityafrica:ecocash'])->assertStatus(422)->assertJsonStructure(['errors' => ['phone']]);
        $this->shopper()->postJson('/api/store/payments/initiate', ['option' => 'velocityafrica:ecocash', 'phone' => '12345'])->assertStatus(502);
        Http::assertNothingSent();

        foreach (['0771234567' => '+263771234567', '+263 77 123 4567' => '+263771234567', '263771234567' => '+263771234567', '00263771234567' => '+263771234567', '771234567' => '+263771234567', '0812345678' => null, '+27821234567' => null] as $in => $want) {
            $this->assertSame($want, VelocityAfrica::phone($in), $in);
        }
    }

    #[Test]
    public function velocitys_own_error_message_is_passed_on_when_it_refuses(): void
    {
        Http::fake(['api.velocityafrica.net/sales-orders' => Http::response(['message' => 'Invalid item code'], 422)]);

        $res = $this->shopper()->postJson('/api/store/payments/initiate', ['option' => 'velocityafrica:ecocash', 'phone' => '0771234567'])->assertStatus(502);

        $this->assertSame('VelocityAfrica: Invalid item code', $res->json('error'));
        $this->assertSame(0, PaymentSession::count());
    }

    // ─── Reconciliation, because there are no webhooks ─────────────────────

    #[Test]
    public function a_shopper_who_closed_the_tab_is_still_given_their_order_by_reconcile(): void
    {
        $this->fakeVelocity(['SUCCESS']);
        $res = $this->shopper()->postJson('/api/store/payments/initiate', ['option' => 'velocityafrica:ecocash', 'phone' => '0771234567'])->assertOk();
        DB::table('payment_sessions')->where('reference', $res->json('reference'))->update(['created_at' => now()->subMinutes(5)]);
        $this->assertSame(0, DB::table('orders')->count());

        $this->artisan('payments:reconcile')->expectsOutputToContain('1 settled')->assertSuccessful();

        $this->assertSame(1, DB::table('orders')->count());
        $this->assertSame('paid', PaymentSession::where('reference', $res->json('reference'))->value('status'));
    }
}
