<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\PaymentSession;
use App\Services\Payments\Payments;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * BlessedPay (pay.blessluxe.com), end to end against a fake of its API: start
 * a payment, send the shopper to its page, then learn the outcome from its
 * signed callback or by asking.
 */
class BlessedPayGatewayTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'whsec_shop_test';

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.paynow' => [],
            'services.velocityafrica' => [],
            'services.blessedpay' => ['base_url' => 'https://pay.blessluxe.test', 'api_key' => 'sk_live_abc123', 'signing_secret' => self::SECRET, 'timeout' => 5],
            'app.url' => 'https://shop.test',
        ]);
        DB::table('customers')->insert(['id' => 'cust_1', 'email' => 'rudo@example.test', 'password' => bcrypt('x'), 'first_name' => 'Rudo', 'last_name' => 'Moyo', 'loyalty_points' => 500, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('products')->insert(['id' => 'prod_1', 'title' => 'Silk Dress', 'handle' => 'dress', 'status' => 'published', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('product_variants')->insert(['id' => 'var_1', 'product_id' => 'prod_1', 'title' => 'M', 'manage_inventory' => true, 'inventory_quantity' => 5, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('variant_prices')->insert(['id' => 'vp_1', 'variant_id' => 'var_1', 'currency_code' => 'usd', 'amount' => 4500, 'created_at' => now()]);
        Payments::setConfig(['gateways' => ['blessedpay' => ['enabled' => true]], 'routes' => ['ecocash' => 'blessedpay', 'card' => 'blessedpay']]);
    }

    private function shopper(): static
    {
        Auth::forgetGuards();
        $t = $this->actingAs(Customer::find('cust_1'), 'customer');
        $t->postJson('/api/store/cart/line-items', ['variant_id' => 'var_1', 'quantity' => 2])->assertSuccessful();

        return $t;
    }

    /** A payment as BlessedPay's API describes it. */
    private function payment(string $reference, array $over = []): array
    {
        return $over + [
            'id' => 'pay_01abc', 'status' => 'pending', 'mode' => 'live', 'amount' => '90.00', 'fee' => '0.00', 'charged' => '90.00', 'currency' => 'USD',
            'reference' => $reference, 'method' => null, 'gateway_reference' => null, 'redirect_url' => 'https://pay.blessluxe.test/p/pay_01abc',
        ];
    }

    /** Start a payment for two dresses (USD 90.00) and return its reference. */
    private function start(): string
    {
        Http::fake(['pay.blessluxe.test/api/v1/payments' => fn (ClientRequest $r) => Http::response($this->payment($r['reference']), 201)]);

        return $this->shopper()->postJson('/api/store/payments/initiate', ['option' => 'blessedpay', 'email' => 'rudo@example.test'])->assertOk()->json('reference');
    }

    /** The callback exactly as BlessedPay signs it. */
    private function notice(array $payment, ?int $at = null, string $secret = self::SECRET)
    {
        $body = json_encode(['event' => 'payment.' . $payment['status'], 'payment' => $payment]);
        $t = $at ?? time();

        return $this->call('POST', '/api/store/payments/blessedpay/webhook', [], [], [], [
            'CONTENT_TYPE' => 'application/json', 'HTTP_X_BLESSEDPAY_SIGNATURE' => "t={$t},v1=" . hash_hmac('sha256', "{$t}.{$body}", $secret),
        ], $body);
    }

    #[Test]
    public function it_is_one_option_and_the_shopper_chooses_how_to_pay_on_blessedpays_page(): void
    {
        $options = $this->getJson('/api/store/payments/options')->assertOk()->json('options');

        $this->assertCount(1, $options);
        $this->assertSame(['blessedpay', 'BlessedPay', ['ecocash', 'card'], [], null], [$options[0]['id'], $options[0]['label'], $options[0]['methods'], $options[0]['needs'], $options[0]['surcharge']]);
    }

    #[Test]
    public function starting_a_payment_asks_blessedpay_once_and_sends_the_shopper_to_its_checkout(): void
    {
        Http::fake(['pay.blessluxe.test/api/v1/payments' => fn (ClientRequest $r) => Http::response($this->payment($r['reference']), 201)]);

        $res = $this->shopper()->postJson('/api/store/payments/initiate', ['option' => 'blessedpay', 'email' => 'rudo@example.test'])->assertOk();
        $reference = $res->json('reference');

        $this->assertSame('https://pay.blessluxe.test/p/pay_01abc', $res->json('redirect_url'));
        Http::assertSent(fn (ClientRequest $r) => $r->url() === 'https://pay.blessluxe.test/api/v1/payments'
            && $r->hasHeader('Authorization', 'Bearer sk_live_abc123')
            && $r->hasHeader('Idempotency-Key', $reference)                                    // a retry can never start a second payment
            && $r['amount'] === '90.00' && $r['currency'] === 'USD' && $r['reference'] === $reference
            && $r['callback_url'] === 'https://shop.test/api/store/payments/blessedpay/webhook'
            && str_starts_with($r['return_url'], 'https://shop.test/api/store/payments/return?reference='));
        Http::assertSentCount(1);

        $s = PaymentSession::where('reference', $reference)->first();
        $this->assertSame(['blessedpay', 'pending', 'pay_01abc', 'pay_01abc', 9000], [$s->provider, $s->status, $s->poll_url, $s->provider_reference, (int) $s->amount]);
        $this->assertSame(0, DB::table('orders')->count());
    }

    #[Test]
    public function blessedpays_own_reason_is_shown_when_it_refuses_to_start(): void
    {
        Http::fake(['pay.blessluxe.test/api/v1/payments' => Http::response(['error' => ['code' => 'company_not_approved', 'message' => 'This company is waiting for approval. Use a test key until it is approved.']], 403)]);

        $res = $this->shopper()->postJson('/api/store/payments/initiate', ['option' => 'blessedpay', 'email' => 'rudo@example.test']);

        $this->assertGreaterThanOrEqual(400, $res->status());
        $this->assertStringContainsString('waiting for approval', $res->getContent());
        $this->assertSame(0, PaymentSession::count());                                         // nothing is left behind
    }

    #[Test]
    public function a_signed_callback_pays_the_session_and_makes_the_order_once(): void
    {
        $reference = $this->start();
        $paid = $this->payment($reference, ['status' => 'paid', 'method' => 'ecocash', 'gateway_reference' => 'MP260113.1234.A1', 'fee' => '0.91', 'charged' => '90.91']);

        // Not ours, or not recent: refused, and nothing changes.
        $this->notice($paid, secret: 'someone-elses-secret')->assertStatus(400);
        $this->notice($paid, at: time() - 3600)->assertStatus(400);
        $this->postJson('/api/store/payments/blessedpay/webhook', ['event' => 'payment.paid', 'payment' => $paid])->assertStatus(400); // unsigned
        $this->assertSame('pending', PaymentSession::where('reference', $reference)->value('status'));

        $this->notice($paid)->assertOk();

        $s = PaymentSession::where('reference', $reference)->first();
        $this->assertSame(['paid', 'MP260113.1234.A1', 'pay_01abc'], [$s->status, $s->provider_reference, $s->poll_url]);
        $this->assertSame(['ecocash', 91, 9091], [$s->provider_meta['paid_with'], $s->provider_meta['fee_on_top'], $s->provider_meta['total_charged']]);
        $order = DB::table('orders')->where('id', $s->order_id)->first();
        // The order is for the goods: a fee on top is BlessedPay's, never revenue here. It records how they actually paid.
        $this->assertSame(['ecocash', 'paid', 9000], [$order->payment_method, $order->payment_status, (int) $order->total]);
        $this->assertSame(3, (int) DB::table('product_variants')->where('id', 'var_1')->value('inventory_quantity'));

        $this->notice($paid)->assertOk();                                                    // BlessedPay retries: still one order
        $this->notice($this->payment($reference, ['status' => 'cancelled']))->assertOk();    // and a late "cancelled" never undoes it
        $this->assertSame(1, DB::table('orders')->count());
        $this->assertSame('paid', $s->fresh()->status);
    }

    #[Test]
    public function a_paid_notice_for_a_different_amount_is_not_accepted(): void
    {
        $reference = $this->start();

        $this->notice($this->payment($reference, ['status' => 'paid', 'amount' => '9.00', 'charged' => '9.00']))->assertOk();
        $this->assertSame('pending', PaymentSession::where('reference', $reference)->value('status'));

        $this->notice($this->payment($reference, ['status' => 'paid', 'currency' => 'ZWG']))->assertOk();
        $this->assertSame('pending', PaymentSession::where('reference', $reference)->value('status'));
        $this->assertSame(0, DB::table('orders')->count());
    }

    #[Test]
    public function coming_back_from_the_checkout_asks_blessedpay_and_lands_on_the_confirmation(): void
    {
        $reference = $this->start();
        Http::fake(['pay.blessluxe.test/api/v1/payments/pay_01abc' => Http::response($this->payment($reference, ['status' => 'paid', 'method' => 'card', 'gateway_reference' => 'FT26317ABCD']))]);

        // BlessedPay adds its own payment_id / reference / status to the address: the status there is never trusted.
        $back = $this->get('/api/store/payments/return?reference=' . $reference . '&payment_id=pay_01abc&reference=' . $reference . '&status=failed');

        $s = PaymentSession::where('reference', $reference)->first();
        $this->assertSame(['paid', 'FT26317ABCD'], [$s->status, $s->provider_reference]);
        $this->assertSame('card', DB::table('orders')->where('id', $s->order_id)->value('payment_method'));
        $back->assertRedirect('/checkout/confirmation?order=' . urlencode(DB::table('orders')->where('id', $s->order_id)->value('order_number')));
    }

    #[Test]
    public function a_failed_payment_gives_the_bees_back_and_an_unreachable_blessedpay_changes_nothing(): void
    {
        $reference = $this->start();
        $s = PaymentSession::where('reference', $reference)->first();

        Http::fake(['pay.blessluxe.test/*' => fn () => throw new \Illuminate\Http\Client\ConnectionException('timed out')]);
        $this->assertSame('pending', Payments::refresh($s, force: true)->status);

        $this->notice($this->payment($reference, ['status' => 'failed']))->assertOk();
        $this->assertSame('failed', $s->fresh()->status);
        $this->assertSame(0, DB::table('orders')->count());
        $this->assertSame(5, (int) DB::table('product_variants')->where('id', 'var_1')->value('inventory_quantity'));
    }

    #[Test]
    public function staff_choose_whether_the_checkout_opens_in_a_pop_up_or_on_its_own_page(): void
    {
        Http::fake(['pay.blessluxe.test/api/v1/payments' => fn (ClientRequest $r) => Http::response($this->payment($r['reference']), 201)]);
        $start = fn () => $this->shopper()->postJson('/api/store/payments/initiate', ['option' => 'blessedpay', 'email' => 'rudo@example.test'])->assertOk();

        // Until staff say otherwise it is the full page, as before.
        $this->assertSame([true, 'page'], [Payments::settings()['gateways']['blessedpay']['popup'], Payments::settings()['gateways']['blessedpay']['checkout']]);
        $this->assertNull($start()->json('popup'));

        Payments::setConfig(['gateways' => ['blessedpay' => ['enabled' => true, 'checkout' => 'popup']]]);
        $res = $start();
        $this->assertSame('https://pay.blessluxe.test/js/blessedpay.js', $res->json('popup.script'));
        $this->assertSame('https://shop.test/api/store/payments/return?reference=' . $res->json('reference'), $res->json('popup.done_url'));
        $this->assertSame('https://pay.blessluxe.test/p/pay_01abc', $res->json('redirect_url'));      // still there: the fallback if the script can't load

        // Saving something else (a route) keeps the choice; nonsense is refused; other gateways have no such choice.
        Payments::setConfig(['routes' => ['card' => null]]);
        $this->assertSame('popup', Payments::settings()['gateways']['blessedpay']['checkout']);
        $this->assertIsString(Payments::setConfig(['gateways' => ['blessedpay' => ['enabled' => true, 'checkout' => 'sideways']]]));
        $this->assertSame([false, 'page'], [Payments::settings()['gateways']['paynow']['popup'], Payments::settings()['gateways']['paynow']['checkout']]);
    }
}
