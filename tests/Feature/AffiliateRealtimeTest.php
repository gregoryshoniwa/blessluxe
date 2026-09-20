<?php

namespace Tests\Feature;

use App\Events\AffiliateMessageSent;
use App\Services\Messages;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Realtime delivery of affiliate messages.
 *
 * The failure this file exists to prevent is not a crash — it is silence. A
 * queued broadcast with no queue worker looks completely healthy on localhost
 * (`composer dev` runs `queue:listen`, which drains the jobs table) and is dead
 * the moment it deploys, because production runs no worker. The chat simply
 * stops being live and falls back to the 5s poll, which nobody notices for
 * weeks. So the contract is asserted here rather than trusted to a docblock.
 */
class AffiliateRealtimeTest extends TestCase
{
    use RefreshDatabase;

    private function seedAffiliate(): string
    {
        DB::table('customers')->insert([
            'id' => 'cust_realtime', 'email' => 'aff@example.com',
            'password' => bcrypt('secret'), 'first_name' => 'Ada', 'last_name' => 'L',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        DB::table('affiliates')->insert([
            'id' => 'aff_realtime', 'customer_id' => 'cust_realtime',
            'code' => 'ADA', 'status' => 'approved',
            'first_name' => 'Ada', 'last_name' => 'L', 'email' => 'aff@example.com',
            'commission_rate' => 10,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return 'aff_realtime';
    }

    #[Test]
    public function the_broadcast_is_synchronous_not_queued(): void
    {
        // ShouldBroadcast (queued) would sit in the jobs table forever in
        // production. ShouldBroadcastNow sends inside the request.
        $this->assertInstanceOf(
            ShouldBroadcastNow::class,
            new AffiliateMessageSent('aff_x', ['id' => 'amsg_x']),
            'AffiliateMessageSent must broadcast synchronously — no queue worker runs in production.'
        );
    }

    #[Test]
    public function posting_a_message_broadcasts_it_to_the_affiliate_thread(): void
    {
        $affiliateId = $this->seedAffiliate();
        Event::fake([AffiliateMessageSent::class]);

        $id = Messages::post($affiliateId, 'admin', 'user:1', 'Your pieces shipped.');

        Event::assertDispatched(
            AffiliateMessageSent::class,
            function (AffiliateMessageSent $e) use ($affiliateId, $id) {
                return $e->affiliateId === $affiliateId
                    && $e->message['id'] === $id
                    && $e->message['sender'] === 'admin'
                    && $e->message['body'] === 'Your pieces shipped.';
            }
        );
    }

    #[Test]
    public function it_publishes_to_the_thread_and_to_the_admin_feed_and_nowhere_else(): void
    {
        $event = new AffiliateMessageSent('aff_realtime', ['id' => 'amsg_1']);

        $channels = array_map('strval', $event->broadcastOn());

        // The thread is a PRESENCE channel: both sides need to know the other is
        // there, which is what makes online, typing and "seen" meaningful.
        // The admin feed is the single subscription that keeps the inbox list
        // live however many affiliates exist. Any third channel is a leak.
        $this->assertSame(['presence-affiliate.aff_realtime', 'private-admin.inbox'], $channels);
        $this->assertSame('message.sent', $event->broadcastAs());
        $this->assertSame(['message' => ['id' => 'amsg_1']], $event->broadcastWith());
    }

    #[Test]
    public function a_broadcast_failure_never_loses_a_saved_message(): void
    {
        $affiliateId = $this->seedAffiliate();

        // A socket server that is down or misconfigured must not cost the user
        // their message — it is already in the database, and the poll fallback
        // will surface it within seconds.
        Event::listen(AffiliateMessageSent::class, function () {
            throw new \RuntimeException('reverb is down');
        });

        $id = Messages::post($affiliateId, 'affiliate', 'cust_realtime', 'Can I get this in a 12?');

        $this->assertDatabaseHas('affiliate_messages', [
            'id' => $id,
            'affiliate_id' => $affiliateId,
            'body' => 'Can I get this in a 12?',
        ]);
    }
}
