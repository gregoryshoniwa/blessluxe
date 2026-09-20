<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Who may listen to what.
 *
 * Channel auth is the ONLY thing standing between a signed-in stranger and
 * someone else's conversation: the socket server will deliver anything to any
 * connection holding a valid signature, and this endpoint is what issues them.
 *
 * It also guards a subtle trap. Laravel resolves the channel user from a guard
 * list BEFORE the channel callback runs; if `customer` isn't in that list, a
 * customer-only session is rejected outright and the affiliate's chat silently
 * falls back to polling forever — while every admin test passes.
 */
class BroadcastChannelAuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Signing is local (HMAC); nothing here touches a socket server.
        config([
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key'    => 'test-key',
            'broadcasting.connections.reverb.secret' => 'test-secret',
            'broadcasting.connections.reverb.app_id' => 'test-app',
        ]);
        // routes/channels.php registered its callbacks on the `null` driver at
        // boot; load them again onto the driver the test just switched to.
        require base_path('routes/channels.php');

        DB::table('customers')->insert([
            ['id' => 'cust_owner', 'email' => 'owner@example.com', 'password' => bcrypt('x'), 'first_name' => 'Owner', 'last_name' => 'A', 'created_at' => now(), 'updated_at' => now()],
            ['id' => 'cust_other', 'email' => 'other@example.com', 'password' => bcrypt('x'), 'first_name' => 'Other', 'last_name' => 'B', 'created_at' => now(), 'updated_at' => now()],
        ]);
        DB::table('affiliates')->insert([
            'id' => 'aff_chan', 'customer_id' => 'cust_owner', 'code' => 'OWNER', 'status' => 'active',
            'first_name' => 'Owner', 'last_name' => 'A', 'email' => 'owner@example.com',
            'commission_rate' => 10, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    /**
     * Sign in the way a browser is signed in: a session key per guard.
     *
     * Deliberately NOT actingAs(). That calls Auth::shouldUse(), which makes the
     * given guard the DEFAULT for the request — so a customer would authorize
     * here and still be rejected in production, where the default stays `web`.
     */
    private function signedIn(?string $customerId = null, ?User $admin = null): static
    {
        $session = [];
        if ($customerId) $session[Auth::guard('customer')->getName()] = $customerId;
        if ($admin)      $session[Auth::guard('web')->getName()] = $admin->id;

        // Guards memoise their user for the life of the app instance, and one
        // test makes several requests — without this the second request would
        // be answered with the first one's identity.
        Auth::forgetGuards();

        return $this->flushSession()->withSession($session);
    }

    private function authorize(string $channel, array $extra = [])
    {
        return $this->postJson('/broadcasting/auth', ['socket_id' => '1234.5678', 'channel_name' => $channel] + $extra);
    }

    #[Test]
    public function the_affiliate_can_join_their_own_thread_with_only_a_customer_session(): void
    {
        $res = $this->signedIn('cust_owner')
            ->authorize('presence-affiliate.aff_chan')
            ->assertOk();

        $member = json_decode($res->json('channel_data'), true);
        $this->assertSame('cust_owner', (string) $member['user_id']);
        $this->assertSame('affiliate', $member['user_info']['role']);
    }

    #[Test]
    public function another_customer_cannot_listen_to_someone_elses_thread(): void
    {
        $this->signedIn('cust_other')
            ->authorize('presence-affiliate.aff_chan')
            ->assertForbidden();
    }

    #[Test]
    public function an_admin_can_join_any_thread(): void
    {
        $res = $this->signedIn(admin: User::factory()->create())
            ->authorize('presence-affiliate.aff_chan')
            ->assertOk();

        $this->assertSame('admin', json_decode($res->json('channel_data'), true)['user_info']['role']);
    }

    #[Test]
    public function the_admin_inbox_feed_is_staff_only(): void
    {
        // Every affiliate's messages pass through this one channel, so a
        // customer reaching it would read the whole company's conversations.
        $this->signedIn('cust_owner')
            ->authorize('private-admin.inbox')
            ->assertForbidden();

        $this->signedIn(admin: User::factory()->create())
            ->authorize('private-admin.inbox')
            ->assertOk();
    }

    #[Test]
    public function nobody_signed_in_gets_nothing(): void
    {
        $this->authorize('presence-affiliate.aff_chan')->assertForbidden();
        $this->authorize('private-admin.inbox')->assertForbidden();
    }

    #[Test]
    public function a_browser_signed_in_as_both_joins_as_the_side_it_says_it_is(): void
    {
        // Staff who also shop — and anyone testing both halves in one browser —
        // hold both sessions at once. Defaulting them to "admin" makes both tabs
        // the SAME presence member, so neither ever sees the other come online
        // and typing/seen go quiet for no visible reason.
        $admin = User::factory()->create();

        $asAffiliate = json_decode($this->signedIn('cust_owner', $admin)
            ->authorize('presence-affiliate.aff_chan', ['as' => 'affiliate'])
            ->assertOk()->json('channel_data'), true);

        $asAdmin = json_decode($this->signedIn('cust_owner', $admin)
            ->authorize('presence-affiliate.aff_chan', ['as' => 'admin'])
            ->assertOk()->json('channel_data'), true);

        $this->assertSame('affiliate', $asAffiliate['user_info']['role']);
        $this->assertSame('admin', $asAdmin['user_info']['role']);
        // Distinct members, or presence collapses the two tabs into one.
        $this->assertNotSame((string) $asAffiliate['user_id'], (string) $asAdmin['user_id']);
    }
}
