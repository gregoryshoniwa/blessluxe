<?php

namespace Tests\Feature;

use App\Services\Rtc;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * ICE configuration for browser calls.
 *
 * The thing worth guarding here is not the happy path — it is that TURN
 * credentials are issued per request and never leak into the JS bundle, and
 * that the app still hands back a usable STUN-only config when no relay is
 * configured (which is the default, and must not break calling outright).
 */
class RtcIceTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function without_turn_it_still_returns_usable_stun_servers(): void
    {
        config(['webrtc.turn.urls' => [], 'webrtc.turn.secret' => null, 'webrtc.turn.username' => null]);

        $ice = Rtc::iceServers();

        $this->assertCount(1, $ice['ice_servers']);
        $this->assertStringStartsWith('stun:', $ice['ice_servers'][0]['urls'][0]);
        // The UI reads this to warn honestly instead of silently failing on a
        // network that needs a relay.
        $this->assertFalse($ice['has_relay']);
    }

    #[Test]
    public function hmac_turn_credentials_expire_and_are_not_the_shared_secret(): void
    {
        config([
            'webrtc.turn.urls'   => ['turn:turn.example.com:3478'],
            'webrtc.turn.secret' => 'super-secret-value',
            'webrtc.turn.ttl'    => 600,
        ]);

        $ice = Rtc::iceServers();
        $relay = $ice['ice_servers'][1];

        $this->assertTrue($ice['has_relay']);

        // Username is `<expiry>:blessluxe`, so the credential dies on its own.
        [$expiry] = explode(':', $relay['username']);
        $this->assertGreaterThan(time(), (int) $expiry);
        $this->assertLessThanOrEqual(time() + 600, (int) $expiry);

        // The shared secret must never be handed to a browser.
        $this->assertNotSame('super-secret-value', $relay['credential']);
        $this->assertStringNotContainsString('super-secret-value', json_encode($ice));
        $this->assertSame(
            base64_encode(hash_hmac('sha1', $relay['username'], 'super-secret-value', true)),
            $relay['credential']
        );
    }

    #[Test]
    public function static_turn_credentials_are_passed_through(): void
    {
        config([
            'webrtc.turn.urls'       => ['turn:turn.example.com:3478'],
            'webrtc.turn.secret'     => null,
            'webrtc.turn.username'   => 'blessluxe',
            'webrtc.turn.credential' => 'pw',
        ]);

        $relay = Rtc::iceServers()['ice_servers'][1];

        $this->assertSame('blessluxe', $relay['username']);
        $this->assertSame('pw', $relay['credential']);
    }

    #[Test]
    public function the_ice_endpoint_requires_a_signed_in_customer(): void
    {
        $this->getJson('/api/account/rtc/ice')->assertStatus(401);
    }

    #[Test]
    public function a_signed_in_customer_can_fetch_ice_servers(): void
    {
        DB::table('customers')->insert([
            'id' => 'cust_rtc', 'email' => 'rtc@example.com', 'password' => bcrypt('secret'),
            'first_name' => 'Rtc', 'last_name' => 'User',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->actingAs(\App\Models\Customer::find('cust_rtc'), 'customer')
            ->getJson('/api/account/rtc/ice')
            ->assertOk()
            ->assertJsonStructure(['ice_servers', 'has_relay', 'ring_seconds']);
    }
}
