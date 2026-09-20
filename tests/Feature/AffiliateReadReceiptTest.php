<?php

namespace Tests\Feature;

use App\Events\AffiliateMessagesRead;
use App\Services\Messages;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Read receipts — the second tick.
 *
 * The bug these cover: `markRead` wrote `read_at` correctly, but nothing told
 * the SENDER, so their bubbles sat on a single tick indefinitely. The database
 * was right and the screen was wrong, which is the hardest kind of wrong to
 * notice, because everything you can query looks correct.
 */
class AffiliateReadReceiptTest extends TestCase
{
    use RefreshDatabase;

    private function seedAffiliate(): string
    {
        DB::table('customers')->insert([
            'id' => 'cust_read', 'email' => 'read@example.com', 'password' => bcrypt('secret'),
            'first_name' => 'Ada', 'last_name' => 'L',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('affiliates')->insert([
            'id' => 'aff_read', 'customer_id' => 'cust_read', 'code' => 'ADA', 'status' => 'active',
            'first_name' => 'Ada', 'last_name' => 'L', 'email' => 'read@example.com',
            'commission_rate' => 10, 'created_at' => now(), 'updated_at' => now(),
        ]);

        return 'aff_read';
    }

    #[Test]
    public function reading_announces_itself_so_the_senders_ticks_can_update(): void
    {
        $id = $this->seedAffiliate();
        Messages::post($id, 'affiliate', 'cust_read', 'Any word on the coats?');

        Event::fake([AffiliateMessagesRead::class]);
        $marked = Messages::markRead($id, 'admin');

        $this->assertSame(1, $marked);
        Event::assertDispatched(
            AffiliateMessagesRead::class,
            fn (AffiliateMessagesRead $e) => $e->affiliateId === $id && $e->reader === 'admin'
        );
    }

    #[Test]
    public function a_read_that_changes_nothing_stays_off_the_wire(): void
    {
        $id = $this->seedAffiliate();
        Messages::post($id, 'affiliate', 'cust_read', 'Any word on the coats?');
        Messages::markRead($id, 'admin');

        // Every thread open calls markRead. Broadcasting each time would put a
        // frame on the socket whenever anyone merely glanced at a conversation.
        Event::fake([AffiliateMessagesRead::class]);
        $this->assertSame(0, Messages::markRead($id, 'admin'));
        Event::assertNotDispatched(AffiliateMessagesRead::class);
    }

    #[Test]
    public function reading_never_marks_your_own_messages_read(): void
    {
        $id = $this->seedAffiliate();
        $mine = Messages::post($id, 'affiliate', 'cust_read', 'Mine');
        $theirs = Messages::post($id, 'admin', 'user:1', 'Theirs');

        // The affiliate opening their own inbox must not tick their own
        // bubbles — that would tell the admin their message was read by
        // whoever wrote it.
        Messages::markRead($id, 'affiliate');

        $this->assertNull(DB::table('affiliate_messages')->where('id', $mine)->value('read_at'));
        $this->assertNotNull(DB::table('affiliate_messages')->where('id', $theirs)->value('read_at'));
    }

    #[Test]
    public function the_read_broadcast_is_synchronous_and_correctly_addressed(): void
    {
        $event = new AffiliateMessagesRead('aff_read', 'admin', now()->toIso8601String());

        $this->assertInstanceOf(ShouldBroadcastNow::class, $event);
        $this->assertSame('presence-affiliate.aff_read', (string) $event->broadcastOn());
        $this->assertSame('messages.read', $event->broadcastAs());
        $this->assertSame('admin', $event->broadcastWith()['reader']);
    }

    #[Test]
    public function the_affiliate_can_acknowledge_without_refetching_the_thread(): void
    {
        $id = $this->seedAffiliate();
        Messages::post($id, 'admin', 'user:1', 'Your pieces shipped.');

        $this->actingAs(\App\Models\Customer::find('cust_read'), 'customer')
            ->postJson('/api/account/affiliate/messages/read')
            ->assertOk()
            ->assertJson(['marked' => 1]);

        $this->assertSame(0, Messages::unreadFor($id, 'affiliate'));
    }

    #[Test]
    public function opening_a_thread_reports_where_the_unread_began(): void
    {
        $id = $this->seedAffiliate();
        Messages::post($id, 'admin', 'user:1', 'Old news');
        Messages::markRead($id, 'affiliate');
        $first = Messages::post($id, 'admin', 'user:1', 'First new one');
        Messages::post($id, 'admin', 'user:1', 'Second new one');

        $body = $this->actingAs(\App\Models\Customer::find('cust_read'), 'customer')
            ->getJson('/api/account/affiliate/messages')
            ->assertOk()
            ->json();

        // Opening marks everything read, so without this the client could never
        // draw a "new messages" line — every message already looks read.
        $this->assertSame($first, $body['first_unread_id']);
        $this->assertSame(2, $body['unread_count']);
        $this->assertNotNull(collect($body['messages'])->firstWhere('id', $first)['read_at']);
    }

    #[Test]
    public function a_fully_read_thread_reports_no_boundary(): void
    {
        $id = $this->seedAffiliate();
        Messages::post($id, 'admin', 'user:1', 'Seen it');
        Messages::markRead($id, 'affiliate');

        $boundary = Messages::unreadBoundary($id, 'affiliate');

        $this->assertNull($boundary['id']);
        $this->assertSame(0, $boundary['count']);
    }

    #[Test]
    public function acknowledging_requires_being_a_signed_in_affiliate(): void
    {
        $this->seedAffiliate();

        // `mustBeActive` answers 404 rather than 401 for a caller it cannot
        // resolve to an affiliate — "you are not an affiliate" covers both the
        // signed-out and the not-an-affiliate case without distinguishing them.
        $this->postJson('/api/account/affiliate/messages/read')->assertStatus(404);
    }
}
