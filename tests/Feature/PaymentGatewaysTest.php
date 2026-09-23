<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\PaymentSession;
use App\Models\User;
use App\Services\Paynow;
use App\Services\Payments\Method;
use App\Services\Payments\Payments;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Gateways and routing: what staff can switch on, where each way of paying
 * goes, what the customer is offered as a result — and that the old
 * Paynow-shaped URLs (which Paynow's dashboard is configured with) still work.
 */
class PaymentGatewaysTest extends TestCase
{
    use RefreshDatabase;

    private function paynowOn(): void
    {
        config(['services.paynow' => ['id' => '1234', 'key' => 'secret-key', 'result_url' => 'https://shop.test/api/store/payments/paynow/ipn', 'return_url' => 'https://shop.test/api/store/payments/paynow/return', 'auth_email_override' => null]]);
    }

    private function velocityOn(): void
    {
        config(['services.velocityafrica' => ['api_key' => 'vk', 'base_url' => 'https://api.velocityafrica.net', 'merchant_phone' => '+263772364284', 'merchant_account' => '263772364284', 'region' => 'ZW', 'item_code' => 'BLESSLUXE-ORDER', 'charge_percent' => 2.5, 'charge_tax_percent' => 0]]);
    }

    private function admin(): static
    {
        Auth::forgetGuards();

        return $this->actingAs(User::factory()->create(), 'web');
    }

    // ─── Defaults and routing ──────────────────────────────────────────────

    #[Test]
    public function a_fresh_install_routes_everything_to_the_one_gateway_that_has_credentials(): void
    {
        $this->paynowOn();

        $s = Payments::settings();

        $this->assertTrue($s['gateways']['paynow']['enabled']);
        $this->assertFalse($s['gateways']['velocityafrica']['enabled']);
        $this->assertFalse($s['gateways']['velocityafrica']['configured']);
        $this->assertSame(['paynow', 'paynow', 'paynow', 'paynow', 'paynow'], array_values($s['routes']));

        // One hosted gateway = one option, listing every method routed to it.
        $options = $this->getJson('/api/store/payments/options')->assertOk()->json('options');
        $this->assertCount(1, $options);
        $this->assertSame('paynow', $options[0]['id']);
        $this->assertSame(Method::ids(), $options[0]['methods']);
        $this->assertSame([], $options[0]['needs']);
    }

    #[Test]
    public function with_no_configured_gateway_nothing_is_offered_and_checkout_says_so(): void
    {
        config(['services.paynow' => [], 'services.velocityafrica' => []]);

        $this->assertSame([], $this->getJson('/api/store/payments/options')->json('options'));
        $this->assertSame([null, null, null, null, null], array_values(Payments::settings()['routes']));

        DB::table('customers')->insert(['id' => 'cust_1', 'email' => 'a@b.test', 'password' => bcrypt('x'), 'first_name' => 'A', 'last_name' => 'B', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('products')->insert(['id' => 'prod_1', 'title' => 'Dress', 'handle' => 'dress', 'status' => 'published', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('product_variants')->insert(['id' => 'var_1', 'product_id' => 'prod_1', 'title' => 'M', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('variant_prices')->insert(['id' => 'vp_1', 'variant_id' => 'var_1', 'currency_code' => 'usd', 'amount' => 4500, 'created_at' => now()]);
        $this->actingAs(Customer::find('cust_1'), 'customer')->postJson('/api/store/cart/line-items', ['variant_id' => 'var_1', 'quantity' => 1])->assertSuccessful();

        $this->postJson('/api/store/payments/initiate', ['email' => 'a@b.test'])->assertStatus(503);
    }

    #[Test]
    public function staff_can_split_methods_between_gateways_and_the_customer_sees_the_split(): void
    {
        $this->paynowOn(); $this->velocityOn();

        $res = $this->admin()->putJson('/api/admin/payments', [
            'gateways' => ['paynow' => ['enabled' => true], 'velocityafrica' => ['enabled' => true]],
            'routes'   => ['ecocash' => 'velocityafrica', 'card' => 'velocityafrica', 'onemoney' => 'paynow', 'zipit' => 'paynow', 'innbucks' => null],
        ])->assertOk();

        $this->assertSame(['ecocash' => 'velocityafrica', 'onemoney' => 'paynow', 'innbucks' => null, 'zipit' => 'paynow', 'card' => 'velocityafrica'], $res->json('settings.routes'));

        // Velocity is direct → one option per method (each asks for a phone); Paynow hosted → one option for both of its methods.
        $ids = array_column($this->getJson('/api/store/payments/options')->json('options'), 'id');
        $this->assertEqualsCanonicalizing(['velocityafrica:ecocash', 'velocityafrica:card', 'paynow'], $ids);
        $eco = collect($this->getJson('/api/store/payments/options')->json('options'))->firstWhere('id', 'velocityafrica:ecocash');
        $this->assertSame(['phone'], $eco['needs']);
        $this->assertSame('EcoCash', $eco['label']);
        $pn = collect($this->getJson('/api/store/payments/options')->json('options'))->firstWhere('id', 'paynow');
        $this->assertSame(['onemoney', 'zipit'], $pn['methods']);
    }

    #[Test]
    public function the_routing_table_can_never_point_somewhere_that_cannot_take_the_money(): void
    {
        $this->paynowOn();                              // Velocity has NO credentials here

        $put = fn (array $body) => $this->admin()->putJson('/api/admin/payments', $body);

        $put(['gateways' => ['velocityafrica' => ['enabled' => true]]])->assertStatus(422);                 // no credentials → can't switch on
        $put(['routes' => ['ecocash' => 'velocityafrica']])->assertStatus(422);                              // routed to a gateway that's off
        $put(['routes' => ['zipit' => 'velocityafrica']])->assertStatus(422);
        $put(['routes' => ['card' => 'stripe']])->assertStatus(422);                                         // unknown gateway
        $this->velocityOn();
        $put(['gateways' => ['velocityafrica' => ['enabled' => true]], 'routes' => ['zipit' => 'velocityafrica']])->assertStatus(422);   // Velocity can't take ZIPIT
        $put(['gateways' => ['velocityafrica' => ['enabled' => true]], 'routes' => ['ecocash' => 'velocityafrica']])->assertOk();

        // Credentials removed later: the saved "on" is ignored and its routes fall away, rather than sending customers into an error.
        config(['services.velocityafrica' => []]);
        $s = Payments::settings();
        $this->assertFalse($s['gateways']['velocityafrica']['enabled']);
        $this->assertNull($s['routes']['ecocash']);

        // Switching a gateway off takes its routes with it.
        $this->velocityOn();
        $put(['gateways' => ['velocityafrica' => ['enabled' => true]], 'routes' => ['ecocash' => 'velocityafrica']])->assertOk();
        $put(['gateways' => ['velocityafrica' => ['enabled' => false]], 'routes' => ['ecocash' => 'velocityafrica']])->assertStatus(422);

        // Members are not staff.
        Auth::forgetGuards();
        $this->getJson('/api/admin/payments')->assertUnauthorized();
    }

    // ─── What paying costs on top ──────────────────────────────────────────

    #[Test]
    public function velocity_quotes_the_charge_it_adds_and_paynow_adds_nothing(): void
    {
        $this->paynowOn(); $this->velocityOn();

        // The live figures: $799.00 + 2.5% = $19.98 charge, $818.98 debited.
        $q = Payments::quote(79900, Payments::gateway('velocityafrica')->surcharge('ecocash'));
        $this->assertSame([['label' => 'Gateway charge (2.5%)', 'amount' => 1998]], $q['lines']);
        $this->assertSame([1998, 81898], [$q['fees'], $q['total']]);

        // Their `tax` field came back 0.00, so nothing is added for it until configured.
        config(['services.velocityafrica.charge_tax_percent' => 15.5]);
        $q = Payments::quote(79900, Payments::gateway('velocityafrica')->surcharge('ecocash'));
        $this->assertSame(['Gateway charge (2.5%)', 'Tax on charge (15.5%)'], array_column($q['lines'], 'label'));
        $this->assertSame([1998, 310], array_column($q['lines'], 'amount'));

        // Paynow's fee comes out of the settlement: the shopper pays the order total.
        $this->assertNull(Payments::gateway('paynow')->surcharge('ecocash'));
        $this->assertSame(['lines' => [], 'fees' => 0, 'total' => 79900], Payments::quote(79900, null));

        // The rule rides on each checkout option so the page can show it.
        $this->admin()->putJson('/api/admin/payments', [
            'gateways' => ['velocityafrica' => ['enabled' => true]],
            'routes'   => ['ecocash' => 'velocityafrica'],
        ])->assertOk();
        $eco = collect($this->getJson('/api/store/payments/options')->json('options'))->firstWhere('id', 'velocityafrica:ecocash');
        $this->assertSame(2.5, $eco['surcharge']['percent']);
    }

    #[Test]
    public function tax_is_a_disclosure_of_what_is_already_in_the_price_never_an_addition(): void
    {
        $this->paynowOn();

        // Off until staff say we're registered.
        $this->assertSame(['enabled' => false, 'rate' => 15.5, 'label' => 'VAT'], Payments::taxSettings());
        $this->assertSame(['enabled' => false, 'rate' => 15.5, 'label' => 'VAT'], $this->getJson('/api/store/payments/options')->json('tax'));

        $this->admin()->putJson('/api/admin/payments', ['tax' => ['enabled' => true, 'rate' => 15.5, 'label' => 'VAT']])->assertOk()
            ->assertJsonPath('settings.tax.enabled', true);
        $this->admin()->putJson('/api/admin/payments', ['tax' => ['rate' => 120]])->assertStatus(422);

        // Switching it on must not move a single cent of what is charged.
        $before = Payments::quote(79900, null);
        $this->assertSame(79900, $before['total']);
    }

    // ─── The old Paynow URLs ───────────────────────────────────────────────

    #[Test]
    public function paynows_configured_ipn_url_still_lands_and_pays_a_session(): void
    {
        $this->paynowOn();
        DB::table('customers')->insert(['id' => 'cust_1', 'email' => 'a@b.test', 'password' => bcrypt('x'), 'first_name' => 'A', 'last_name' => 'B', 'loyalty_points' => 0, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('products')->insert(['id' => 'prod_1', 'title' => 'Dress', 'handle' => 'dress', 'status' => 'published', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('product_variants')->insert(['id' => 'var_1', 'product_id' => 'prod_1', 'title' => 'M', 'manage_inventory' => false, 'created_at' => now(), 'updated_at' => now()]);
        PaymentSession::create([
            'id' => 'payses_1', 'reference' => 'BL-TEST-0001', 'provider' => 'paynow', 'kind' => 'order', 'status' => 'pending',
            'amount' => 4500, 'currency_code' => 'usd', 'email' => 'a@b.test', 'customer_id' => 'cust_1',
            'cart_snapshot' => ['items' => [['variant_id' => 'var_1', 'quantity' => 1, 'unit_price' => 4500, 'metadata' => null]], 'subtotal' => 4500, 'total' => 4500],
        ]);

        // Paynow's payload, hashed the way Paynow hashes it (value-concat + key, SHA512).
        $paynow = Paynow::fromConfig();
        $fields = [['reference', 'BL-TEST-0001'], ['paynowreference', '99001'], ['amount', '45.00'], ['status', 'Paid'], ['pollurl', 'https://www.paynow.co.zw/poll/x']];
        $fields[] = ['hash', $paynow->computeHash($fields)];
        $body = [];
        foreach ($fields as [$k, $v]) $body[$k] = $v;

        // A tampered payload is refused…
        $this->post('/api/store/payments/paynow/ipn', ['amount' => '1.00'] + $body)->assertStatus(400);
        $this->assertSame('pending', PaymentSession::find('payses_1')->status);

        // …the real one pays the session and makes the order, on the OLD url and the new one alike.
        $this->post('/api/store/payments/paynow/ipn', $body)->assertOk();
        $s = PaymentSession::find('payses_1');
        $this->assertSame('paid', $s->status);
        $this->assertSame('99001', $s->provider_reference);
        $this->assertNotNull($s->order_id);
        $this->assertSame('paynow', DB::table('orders')->where('id', $s->order_id)->value('payment_method'));
        $this->assertSame(1, DB::table('orders')->count());

        $this->post('/api/store/payments/paynow/webhook', $body)->assertOk();          // a repeat changes nothing
        $this->assertSame(1, DB::table('orders')->count());

        $this->getJson('/api/store/payments/paynow/status/BL-TEST-0001')->assertOk()->assertJsonPath('session.status', 'paid')->assertJsonPath('session.provider_label', 'Paynow');
        $this->getJson('/api/store/payments/status/BL-TEST-0001')->assertOk()->assertJsonPath('session.status', 'paid');
    }

    #[Test]
    public function a_late_cancelled_never_undoes_a_paid_session(): void
    {
        $this->paynowOn();
        PaymentSession::create(['id' => 'payses_2', 'reference' => 'BL-TEST-0002', 'provider' => 'paynow', 'kind' => 'order', 'status' => 'paid', 'amount' => 100, 'currency_code' => 'usd', 'cart_snapshot' => ['items' => []], 'order_id' => null]);
        $paynow = Paynow::fromConfig();
        $fields = [['reference', 'BL-TEST-0002'], ['status', 'Cancelled']];
        $fields[] = ['hash', $paynow->computeHash($fields)];
        $body = []; foreach ($fields as [$k, $v]) $body[$k] = $v;

        $this->post('/api/store/payments/paynow/ipn', $body)->assertOk();

        $this->assertSame('paid', PaymentSession::find('payses_2')->status);
    }

    #[Test]
    public function an_unknown_gateway_webhook_is_a_404_and_a_gateway_without_callbacks_rejects(): void
    {
        $this->velocityOn();
        $this->post('/api/store/payments/stripe/webhook', [])->assertStatus(404);
        $this->post('/api/store/payments/velocityafrica/webhook', ['anything' => 1])->assertStatus(400);
        Http::assertNothingSent();
    }
}
