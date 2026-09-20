<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\User;
use App\Services\Messages;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The properties that keep messaging affordable as it grows.
 *
 * None of these are about correctness on a small dataset — every one of them
 * "worked" with five threads and twenty messages. They are about cost: what a
 * request does when a thread is thousands of messages long and the inbox is
 * thousands of threads deep. Each test names the failure it prevents.
 */
class MessagingScaleTest extends TestCase
{
    use RefreshDatabase;

    private function affiliate(string $n = '1'): string
    {
        DB::table('customers')->insert([
            'id' => "cust_$n", 'email' => "a$n@example.com", 'password' => bcrypt('x'),
            'first_name' => "First$n", 'last_name' => "Last$n",
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('affiliates')->insert([
            'id' => "aff_$n", 'customer_id' => "cust_$n", 'code' => "CODE$n", 'status' => 'active',
            'first_name' => "First$n", 'last_name' => "Last$n", 'email' => "a$n@example.com",
            'commission_rate' => 10, 'created_at' => now(), 'updated_at' => now(),
        ]);

        return "aff_$n";
    }

    private function asAffiliate(string $n = '1'): static
    {
        return $this->actingAs(Customer::find("cust_$n"), 'customer');
    }

    /** Bulk history, one second apart, inserted directly (post() would broadcast each). */
    private function history(string $affiliateId, int $count): void
    {
        $base = now()->subDays(2);
        $rows = [];
        for ($i = 1; $i <= $count; $i++) {
            $at = $base->copy()->addSeconds($i);
            $rows[] = [
                'id' => sprintf('amsg_h%05d', $i), 'affiliate_id' => $affiliateId,
                'sender' => $i % 2 ? 'affiliate' : 'admin', 'author_id' => null,
                'body' => "msg $i", 'read_at' => $at, 'created_at' => $at, 'updated_at' => $at,
            ];
        }
        foreach (array_chunk($rows, 100) as $chunk) DB::table('affiliate_messages')->insert($chunk);
    }

    // ─── Threads ───────────────────────────────────────────────────────────

    #[Test]
    public function a_long_thread_opens_on_its_newest_messages(): void
    {
        // The original bug: `ORDER BY created_at ASC LIMIT 200` returns the
        // OLDEST 200. The day a thread reached message 201, new messages
        // stopped appearing in it — for that affiliate, forever.
        $id = $this->affiliate();
        $this->history($id, 230);

        $page = Messages::window($id);

        $this->assertCount(Messages::WINDOW, $page['messages']);
        $this->assertSame('msg 230', end($page['messages'])['body']);
        $this->assertSame('msg 181', $page['messages'][0]['body']);
        $this->assertTrue($page['has_more']);
    }

    #[Test]
    public function scrolling_back_pages_through_the_whole_history_without_gaps_or_repeats(): void
    {
        $id = $this->affiliate();
        $this->history($id, 130);

        $seen = [];
        $before = null;
        do {
            $page = Messages::window($id, before: $before);
            $seen = array_merge(array_column($page['messages'], 'body'), $seen);
            $before = $page['messages'][0]['id'] ?? null;
        } while ($page['has_more']);

        $this->assertSame(array_map(fn ($i) => "msg $i", range(1, 130)), $seen);
    }

    #[Test]
    public function a_poll_returns_only_what_is_new(): void
    {
        $id = $this->affiliate();
        $this->history($id, 60);
        $last = Messages::window($id)['messages'][Messages::WINDOW - 1]['id'];

        // The quiet case is the common case, and it must be nearly free.
        $this->assertSame([], Messages::window($id, after: $last)['messages']);

        $new = Messages::post($id, 'admin', 'user:1', 'fresh');
        $delta = Messages::window($id, after: $last)['messages'];

        $this->assertCount(1, $delta);
        $this->assertSame($new, $delta[0]['id']);
    }

    #[Test]
    public function messages_sent_in_the_same_second_keep_their_order_and_are_never_skipped(): void
    {
        // created_at has one-second resolution. With random ids, two messages in
        // one second page in arbitrary order and an `after` cursor sitting
        // between them silently drops one. ULID ids make (created_at, id) total.
        $id = $this->affiliate();
        $this->travelTo(now()->startOfSecond());

        $a = Messages::post($id, 'affiliate', 'cust_1', 'one');
        $b = Messages::post($id, 'affiliate', 'cust_1', 'two');
        $c = Messages::post($id, 'affiliate', 'cust_1', 'three');

        $this->assertSame(['one', 'two', 'three'], array_column(Messages::window($id)['messages'], 'body'));
        $this->assertSame([$b, $c], array_column(Messages::window($id, after: $a)['messages'], 'id'));
        $this->assertSame([$a, $b], array_column(Messages::window($id, before: $c)['messages'], 'id'));
    }

    #[Test]
    public function a_cursor_from_another_thread_is_ignored(): void
    {
        $mine = $this->affiliate('1');
        $theirs = $this->affiliate('2');
        Messages::post($mine, 'admin', 'user:1', 'mine');
        $foreign = Messages::post($theirs, 'admin', 'user:1', 'theirs');

        // Falls back to the plain newest window rather than seeking relative to
        // a message the caller has no right to know the position of.
        $page = Messages::window($mine, after: $foreign);

        $this->assertSame(['mine'], array_column($page['messages'], 'body'));
    }

    #[Test]
    public function timestamps_carry_an_offset_so_browsers_do_not_read_them_as_local_time(): void
    {
        $id = $this->affiliate();
        Messages::post($id, 'admin', 'user:1', 'hi');

        $createdAt = Messages::window($id)['messages'][0]['created_at'];

        // A bare "2026-09-20 09:43:35" is parsed by JS as LOCAL time, which put
        // every bubble two hours out for a user in Harare.
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/', $createdAt);
    }

    // ─── Endpoints ─────────────────────────────────────────────────────────

    #[Test]
    public function sending_returns_the_new_message_not_the_whole_thread(): void
    {
        $id = $this->affiliate();
        $this->history($id, 80);

        $res = $this->asAffiliate()
            ->postJson('/api/account/affiliate/messages', ['body' => 'hello'])
            ->assertOk()
            ->json();

        // Returning the thread made each send cost as much as the conversation
        // was long — and grow every time it succeeded.
        $this->assertArrayNotHasKey('messages', $res);
        $this->assertSame('hello', $res['message']['body']);
    }

    #[Test]
    public function a_background_tab_polling_does_not_mark_anything_read(): void
    {
        $id = $this->affiliate();
        $first = Messages::post($id, 'affiliate', 'cust_1', 'first');
        Messages::markRead($id, 'admin');
        Messages::post($id, 'admin', 'user:1', 'are you there?');

        $this->asAffiliate()->getJson("/api/account/affiliate/messages?after=$first&peek=1")->assertOk();
        // Nobody looked, so the admin must still see one tick.
        $this->assertSame(1, Messages::unreadFor($id, 'affiliate'));

        $this->asAffiliate()->getJson("/api/account/affiliate/messages?after=$first")->assertOk();
        $this->assertSame(0, Messages::unreadFor($id, 'affiliate'));
    }

    #[Test]
    public function a_poll_carries_read_state_so_ticks_work_without_a_socket(): void
    {
        $id = $this->affiliate();
        $mine = Messages::post($id, 'affiliate', 'cust_1', 'seen this?');

        $before = $this->asAffiliate()->getJson("/api/account/affiliate/messages?after=$mine")->json();
        $this->assertNull($before['read_upto_id']);

        Messages::markRead($id, 'admin');

        $after = $this->asAffiliate()->getJson("/api/account/affiliate/messages?after=$mine")->json();
        $this->assertSame($mine, $after['read_upto_id']);
    }

    #[Test]
    public function a_burst_of_messages_rings_the_bell_once(): void
    {
        $id = $this->affiliate();
        User::factory()->count(3)->create();

        foreach (['hi', 'are you there', 'hello??', 'one more thing'] as $body) {
            $this->asAffiliate()->postJson('/api/account/affiliate/messages', ['body' => $body])->assertOk();
        }

        // A notification is a row PER ADMIN. Four messages × three admins was
        // twelve rows all saying "this thread is waiting".
        $this->assertSame(3, DB::table('notifications')->where('kind', 'affiliate_message')->count());

        // Once it has been read, the next message is news again.
        Messages::markRead($id, 'admin');
        $this->asAffiliate()->postJson('/api/account/affiliate/messages', ['body' => 'new topic'])->assertOk();
        $this->assertSame(6, DB::table('notifications')->where('kind', 'affiliate_message')->count());
    }

    #[Test]
    public function sending_is_rate_limited(): void
    {
        $this->affiliate();

        for ($i = 0; $i < 30; $i++) {
            $this->asAffiliate()->postJson('/api/account/affiliate/messages', ['body' => "m$i"])->assertOk();
        }

        $this->asAffiliate()->postJson('/api/account/affiliate/messages', ['body' => 'one too many'])
            ->assertStatus(429);
    }

    // ─── The admin inbox ───────────────────────────────────────────────────

    #[Test]
    public function the_inbox_costs_the_same_number_of_queries_however_many_threads_there_are(): void
    {
        foreach (range(1, 3) as $n) Messages::post($this->affiliate((string) $n), 'affiliate', null, "hello $n");
        $few = $this->countQueries(fn () => Messages::adminInbox());

        foreach (range(4, 25) as $n) Messages::post($this->affiliate((string) $n), 'affiliate', null, "hello $n");
        $many = $this->countQueries(fn () => Messages::adminInbox());

        // It used to be 1 + 2N: an unread count and a preview per thread, on a
        // page that refreshes itself every few seconds.
        $this->assertSame($few, $many);
        $this->assertSame(1, $many);
    }

    #[Test]
    public function the_inbox_is_paged_and_ordered_by_latest_activity(): void
    {
        foreach (range(1, 35) as $n) {
            $this->travelTo(now()->addMinute());
            Messages::post($this->affiliate((string) $n), 'affiliate', null, "hello $n");
        }

        $one = Messages::adminInbox();
        $two = Messages::adminInbox(page: 2);

        $this->assertCount(30, $one['threads']);
        $this->assertTrue($one['has_more']);
        $this->assertSame('aff_35', $one['threads'][0]['id']);
        $this->assertCount(5, $two['threads']);
        $this->assertFalse($two['has_more']);
        $this->assertSame([], array_intersect(array_column($one['threads'], 'id'), array_column($two['threads'], 'id')));
    }

    #[Test]
    public function search_and_the_unread_filter_run_on_the_server(): void
    {
        foreach (range(1, 40) as $n) {
            $this->travelTo(now()->addMinute());
            Messages::post($this->affiliate((string) $n), 'affiliate', null, "hello $n");
        }
        // Oldest thread — far off page one, which is all a browser would hold.
        $hit = Messages::adminInbox('CODE1')['threads'];
        $this->assertContains('aff_1', array_column($hit, 'id'));

        foreach (range(2, 40) as $n) Messages::markRead("aff_$n", 'admin');
        $unread = Messages::adminInbox(unreadOnly: true)['threads'];

        $this->assertSame(['aff_1'], array_column($unread, 'id'));
        $this->assertSame(1, $unread[0]['unread']);
        $this->assertSame(1, Messages::adminUnreadTotal());
    }

    #[Test]
    public function search_input_cannot_smuggle_in_wildcards(): void
    {
        Messages::post($this->affiliate('1'), 'affiliate', null, 'hello');

        // '%' would otherwise match every thread in the table.
        $this->assertSame([], Messages::adminInbox('%')['threads']);
        $this->assertSame([], Messages::adminInbox('_')['threads']);
    }

    #[Test]
    public function the_inbox_row_shows_the_latest_message_and_who_sent_it(): void
    {
        $id = $this->affiliate();
        Messages::post($id, 'affiliate', null, 'question');
        $this->travelTo(now()->addMinute());
        Messages::post($id, 'admin', 'user:1', 'answer');

        $row = Messages::adminInbox()['threads'][0];

        $this->assertSame('answer', $row['preview']);
        $this->assertSame('admin', $row['last_sender']);
        $this->assertSame(1, $row['unread']);
    }

    #[Test]
    public function the_sidebar_badge_is_one_query_and_staff_only(): void
    {
        Messages::post($this->affiliate('1'), 'affiliate', null, 'one');
        Messages::post($this->affiliate('2'), 'affiliate', null, 'two');
        Messages::post('aff_2', 'admin', 'user:1', 'a reply is not unread for us');

        // Every admin page asks for this on a timer, so it must stay trivial.
        $this->assertSame(1, $this->countQueries(fn () => Messages::adminUnreadTotal()));

        $this->actingAs(User::factory()->create(), 'web')
            ->getJson('/api/admin/affiliate-inbox/unread')
            ->assertOk()
            // The Hive moderation badge rides the same poll rather than adding a second one.
            ->assertExactJson(['unread_total' => 2, 'hive_reports_open' => 0]);

        // A signed-in CUSTOMER is not staff.
        \Illuminate\Support\Facades\Auth::forgetGuards();
        $this->actingAs(Customer::find('cust_1'), 'customer')
            ->getJson('/api/admin/affiliate-inbox/unread')
            ->assertUnauthorized();
    }

    private function countQueries(callable $fn): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $fn();
        $n = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $n;
    }
}
