<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\User;
use App\Services\Bees;
use App\Services\Hive;
use App\Services\HiveLive;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Live sessions by link, and gifts.
 *
 * Gifts move Bees (100 = $1 at checkout) between members, so the heavy tests
 * are about money: nothing is created or lost in a transfer, a retried tap
 * never pays twice, and a stolen account can't be emptied in one evening.
 */
class HiveLiveTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        config(['media.disk' => null, 'filesystems.default' => 'local']);
        Http::fake();                                    // no cover fetches
    }

    private function member(string $n, int $bees = 0, bool $adult = true): Customer
    {
        DB::table('customers')->insert(['id' => "cust_$n", 'email' => "$n@example.com", 'password' => bcrypt('x'), 'first_name' => ucfirst($n), 'last_name' => 'Moyo', 'loyalty_points' => $bees, 'created_at' => now(), 'updated_at' => now()]);
        $c = Customer::find("cust_$n");
        Hive::profile($c);
        DB::table('hive_profiles')->where('customer_id', $c->id)->update(['adult_confirmed_at' => $adult ? now() : null]);

        return $c;
    }

    private function as(string $n): static
    {
        Auth::forgetGuards();

        return $this->actingAs(Customer::find("cust_$n"), 'customer');
    }

    private function bees(string $n): int { return (int) DB::table('customers')->where('id', "cust_$n")->value('loyalty_points'); }

    private function look(string $n): string
    {
        return $this->as($n)->post('/api/account/hive/looks', ['images' => [UploadedFile::fake()->image('l.jpg')]], ['Accept' => 'application/json'])->assertOk()->json('look.id');
    }

    private function schedule(string $host, array $over = [])
    {
        return $this->as($host)->postJson('/api/account/hive/lives', $over + ['title' => 'Sunday styling session', 'url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'starts_at' => now()->addHour()->toIso8601String()]);
    }

    private function give(string $from, string $context, string $id, string $gift = 'rose', ?string $key = null)
    {
        return $this->as($from)->postJson('/api/account/hive/gifts', ['context' => $context, 'id' => $id, 'gift' => $gift, 'key' => $key ?? 'key-' . uniqid()]);
    }

    // ─── Gifts ─────────────────────────────────────────────────────────────

    #[Test]
    public function a_gift_moves_bees_from_one_member_to_another_and_creates_none(): void
    {
        $this->member('fan', 500); $this->member('creator', 40);
        $look = $this->look('creator');
        $before = $this->bees('fan') + $this->bees('creator');

        $res = $this->give('fan', 'look', $look, 'crown')->assertOk();

        $this->assertSame(['bees' => 100, 'balance' => 400, 'label' => 'Crown', 'emoji' => '👑'], $res->json('gift'));
        $this->assertSame(900, $res->json('left_today'));
        $this->assertSame([400, 140], [$this->bees('fan'), $this->bees('creator')]);
        $this->assertSame($before, $this->bees('fan') + $this->bees('creator'));               // a transfer, not a mint
        $this->assertSame([-100, 100], DB::table('blits_ledger')->whereIn('reason', ['hive_gift_sent', 'hive_gift_received'])->orderBy('delta')->pluck('delta')->map(fn ($d) => (int) $d)->all());

        $note = $this->as('creator')->getJson('/api/account/hive/activity')->json('items.0');
        $this->assertSame('hive_gift', $note['kind']);
        $this->assertStringContainsString('Crown', $note['title']);
        // It counts as earned in the Hive, and is spendable like any other Bees.
        $this->assertSame(100, $this->as('creator')->getJson('/api/account/hive/earnings')->json('total_bees'));
    }

    #[Test]
    public function a_retried_tap_never_pays_twice(): void
    {
        $this->member('fan', 500); $this->member('creator');
        $look = $this->look('creator');

        $this->give('fan', 'look', $look, 'bouquet', 'same-key-123')->assertOk();
        $this->give('fan', 'look', $look, 'bouquet', 'same-key-123')->assertOk()->assertJsonPath('gift.balance', 450);   // told it worked — once

        $this->assertSame([450, 50], [$this->bees('fan'), $this->bees('creator')]);
        $this->assertSame(1, DB::table('blits_gift_events')->count());

        // Someone else reusing that key is a different gift, not a free one.
        $this->member('other', 100);
        $this->give('other', 'look', $look, 'bouquet', 'same-key-123')->assertOk();
        $this->assertSame(100, $this->bees('creator'));
    }

    #[Test]
    public function gifts_have_limits_so_an_account_cannot_be_drained(): void
    {
        $this->member('fan', 5000); $this->member('creator'); $this->member('poor', 5); $this->member('young', 500, adult: false);
        $look = $this->look('creator');

        foreach (range(1, 4) as $_) $this->give('fan', 'look', $look, 'diamond')->assertOk();           // 4 × 250 = the daily cap
        $this->give('fan', 'look', $look, 'rose')->assertStatus(422);
        $this->assertSame([4000, 1000], [$this->bees('fan'), $this->bees('creator')]);

        $this->travelTo(now()->addDay()->startOfDay()->addHour());                                       // tomorrow it resets
        $this->give('fan', 'look', $look, 'rose')->assertOk();

        $this->give('poor', 'look', $look, 'rose')->assertStatus(422);                                   // can't afford it
        $this->give('young', 'look', $look, 'rose')->assertStatus(403);                                  // 18+
        $this->give('creator', 'look', $look, 'rose')->assertStatus(422);                                // not to yourself
        $this->give('fan', 'look', $look, 'made-up-gift')->assertStatus(422);                            // only listed gifts — no free amounts
        $this->as('fan')->postJson('/api/account/hive/gifts', ['context' => 'look', 'id' => $look, 'gift' => 'rose', 'key' => 'k-12345678', 'bees' => 99999, 'blits_amount' => 1])->assertOk();
        $this->assertSame(10, (int) DB::table('blits_gift_events')->orderByDesc('created_at')->orderByDesc('id')->value('blits_amount'));

        DB::table('hive_profiles')->where('customer_id', 'cust_creator')->update(['suspended_at' => now()]);
        $this->give('fan', 'look', $look, 'rose')->assertStatus(422);                                    // a suspended page receives nothing
        $this->assertSame(5, $this->bees('poor'));
    }

    #[Test]
    public function if_bees_are_switched_off_nothing_moves(): void
    {
        $this->member('fan', 500); $this->member('creator');
        $look = $this->look('creator');
        Bees::setConfig([Bees::KEY_ENABLED => 'false']);

        $this->give('fan', 'look', $look)->assertStatus(422);
        $this->assertSame([500, 0], [$this->bees('fan'), $this->bees('creator')]);
    }

    // ─── Lives ─────────────────────────────────────────────────────────────

    #[Test]
    public function a_live_is_a_link_we_recognise_with_a_time_and_the_host_runs_it(): void
    {
        $this->member('host'); $this->member('fan'); $this->member('other');

        $this->schedule('host', ['url' => 'https://evil.test/live'])->assertStatus(422);
        $this->schedule('host', ['starts_at' => now()->subDay()->toIso8601String()])->assertStatus(422);
        $live = $this->schedule('host')->assertOk()->json('live');

        $this->assertSame('upcoming', $live['state']);
        $this->assertStringStartsWith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', $live['embed']['url']);
        $this->assertTrue($live['can_start']);                                  // within two hours of the time
        $id = $live['id'];

        // Fans ask to be told; it's one reminder each.
        foreach (range(1, 3) as $_) $this->as('fan')->postJson("/api/account/hive/lives/$id/remind")->assertOk();
        $this->assertSame(1, $this->getJson("/api/store/hive/lives/$id")->json('live.reminders'));

        // Only the host can start it — and then the fan hears, once.
        $this->as('other')->postJson("/api/account/hive/lives/$id/start")->assertStatus(422);
        $this->as('host')->postJson("/api/account/hive/lives/$id/start")->assertOk()->assertJsonPath('live.state', 'live');
        $this->as('host')->postJson("/api/account/hive/lives/$id/start")->assertStatus(422);
        $notes = collect($this->as('fan')->getJson('/api/account/hive/activity')->json('items'))->where('kind', 'hive_live');
        $this->assertCount(1, $notes);
        $this->assertSame("/hive/live/$id", $notes->first()['url']);

        $listing = $this->getJson('/api/store/hive/lives')->json();
        $this->assertSame([$id], array_column($listing['live'], 'id'));
        $this->assertSame([], $listing['upcoming']);

        $this->as('host')->postJson("/api/account/hive/lives/$id/cancel")->assertStatus(422);            // too late to cancel
        $this->as('host')->postJson("/api/account/hive/lives/$id/end")->assertOk()->assertJsonPath('live.state', 'ended');
        $this->assertSame([$id], array_column($this->getJson('/api/store/hive/lives')->json('past'), 'id'));
    }

    #[Test]
    public function with_no_clock_running_the_state_is_still_right(): void
    {
        $this->member('host');
        $early = $this->schedule('host', ['starts_at' => now()->addDays(2)->toIso8601String()])->json('live');
        $this->assertFalse($early['can_start']);                                                         // two days early
        $this->as('host')->postJson("/api/account/hive/lives/{$early['id']}/start")->assertStatus(422);

        $id = $this->schedule('host')->json('live.id');
        $this->travelTo(now()->addHours(4));                                                             // she never showed up
        $this->assertSame('missed', $this->getJson("/api/store/hive/lives/$id")->json('live.state'));

        $id2 = $this->schedule('host')->json('live.id');
        $this->travelTo(now()->addHour());
        $this->as('host')->postJson("/api/account/hive/lives/$id2/start")->assertOk();
        $this->travelTo(now()->addHours(HiveLive::LIVE_TIMEOUT_HOURS + 1));                              // she forgot to end it
        $this->assertSame('ended', $this->getJson("/api/store/hive/lives/$id2")->json('live.state'));
        $this->assertSame([], $this->getJson('/api/store/hive/lives')->json('live'));

        // A host can't flood the schedule.
        $this->member('busy');
        foreach (range(1, HiveLive::MAX_UPCOMING_PER_HOST) as $_) $this->schedule('busy')->assertOk();
        $this->schedule('busy')->assertStatus(422);
    }

    #[Test]
    public function gifts_in_a_live_show_in_the_room_and_only_the_host_sees_the_total(): void
    {
        $this->member('host'); $this->member('fan', 500);
        $id = $this->schedule('host')->json('live.id');
        $this->as('host')->postJson("/api/account/hive/lives/$id/start")->assertOk();

        $this->give('fan', 'live', $id, 'sparkle')->assertOk();
        $this->give('fan', 'live', $id, 'rose')->assertOk();

        $room = $this->as('fan')->getJson("/api/store/hive/lives/$id/gifts")->json();
        $this->assertSame(['Rose', 'Sparkle'], array_column($room['gifts'], 'label'));                   // newest first
        $this->assertSame('Fan Moyo', $room['gifts'][0]['from']);
        $this->assertNull($room['gifts_bees']);                                                          // the room sees gifts, not a tally
        $this->assertSame(35, $this->as('host')->getJson("/api/store/hive/lives/$id/gifts")->json('gifts_bees'));
        $this->assertSame(35, $this->bees('host'));
    }

    #[Test]
    public function a_reported_live_is_hidden_and_staff_can_put_it_back(): void
    {
        $this->member('host');
        $id = $this->schedule('host')->json('live.id');
        $this->member('a'); 
        $this->as('a')->postJson('/api/account/hive/reports', ['type' => 'live', 'id' => $id, 'reason' => 'minor'])->assertOk();
        $this->getJson("/api/store/hive/lives/$id")->assertStatus(404);

        Auth::forgetGuards();
        $admin = User::factory()->create();
        $report = $this->actingAs($admin, 'web')->getJson('/api/admin/hive/reports')->json('reports.0');
        $this->assertSame('Sunday styling session', $report['talk']['text']);
        $this->actingAs($admin, 'web')->putJson("/api/admin/hive/reports/{$report['id']}", ['decision' => 'dismiss'])->assertOk();
        $this->assertSame('upcoming', $this->getJson("/api/store/hive/lives/$id")->json('live.state'));
    }
}
