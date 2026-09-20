<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Services\Hive;
use App\Services\Media;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/** The ranked "For you" feed, and short video on a look. */
class HiveFeedTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        config(['media.disk' => null, 'filesystems.default' => 'local']);
    }

    private function member(string $n, array $fit = []): Customer
    {
        DB::table('customers')->insert(['id' => "cust_$n", 'email' => "$n@example.com", 'password' => bcrypt('x'), 'first_name' => ucfirst($n), 'last_name' => 'Moyo', 'created_at' => now(), 'updated_at' => now()]);
        $c = Customer::find("cust_$n");
        Hive::profile($c);
        DB::table('hive_profiles')->where('customer_id', $c->id)->update($fit + ['adult_confirmed_at' => now()]);

        return $c;
    }

    private function as(Customer $c): static
    {
        Auth::forgetGuards();

        return $this->actingAs($c, 'customer');
    }

    private function look(Customer $c, string $caption, array $extra = []): string
    {
        $this->travelTo(now()->addMinute());

        return $this->as($c)->post('/api/account/hive/looks', $extra + ['images' => [UploadedFile::fake()->image('l.jpg')], 'caption' => $caption], ['Accept' => 'application/json'])->assertOk()->json('look.id');
    }

    private function feed(?Customer $as, string $qs = ''): array
    {
        if ($as) $this->as($as); else { Auth::forgetGuards(); $this->app['auth']->guard('customer')->logout(); }

        return $this->getJson('/api/store/hive/feed' . $qs)->assertOk()->json();
    }

    // ─── Ranking ───────────────────────────────────────────────────────────

    #[Test]
    public function for_you_puts_people_i_follow_and_people_built_like_me_ahead_of_strangers(): void
    {
        $me = $this->member('viewer', ['bust_cm' => 96, 'waist_cm' => 80, 'hips_cm' => 110, 'fit_visibility' => 'twins']);
        $friend = $this->member('friend'); $twin = $this->member('twin', ['bust_cm' => 96, 'waist_cm' => 80, 'hips_cm' => 110, 'fit_visibility' => 'twins']);
        $stranger = $this->member('stranger');

        $this->look($friend, 'from a friend');
        $this->look($twin, 'from my twin');
        $this->look($stranger, 'newest, from a stranger');
        $this->as($me)->postJson('/api/account/hive/follow/friend_moyo')->assertOk();

        $mine = array_column($this->feed($me)['looks'], 'caption');
        $this->assertSame('newest, from a stranger', end($mine));                  // newest, but last for me
        $this->assertEqualsCanonicalizing(['from a friend', 'from my twin'], array_slice($mine, 0, 2));

        // Signed out there is nothing personal to go on: newest first.
        $this->assertSame('newest, from a stranger', $this->feed(null)['looks'][0]['caption']);
    }

    #[Test]
    public function conversation_lifts_a_look_and_one_busy_person_cannot_fill_the_screen(): void
    {
        $busy = $this->member('busy'); $quiet = $this->member('quiet'); $fan = $this->member('fan');
        $talked = $this->look($quiet, 'older but talked about');
        foreach (range(1, 5) as $i) $this->look($busy, "busy $i");
        foreach (range(1, 6) as $i) $this->as($fan)->postJson("/api/account/hive/looks/$talked/comments", ['body' => "comment $i"])->assertOk();

        $order = array_column($this->feed(null)['looks'], 'caption');

        $this->assertSame('older but talked about', $order[0]);
        // Spacing: her five looks don't sit in a block — the last ones sink.
        $this->assertSame('busy 5', $order[1]);
        $this->assertGreaterThan(array_search('busy 5', $order), array_search('busy 1', $order));
    }

    #[Test]
    public function the_ranked_feed_pages_without_repeats_even_while_new_looks_arrive(): void
    {
        $a = $this->member('rudo'); $b = $this->member('chipo');
        foreach (range(1, 20) as $i) $this->look($i % 2 ? $a : $b, "look $i");

        $one = $this->feed(null);
        $this->assertStringStartsWith('r.', $one['next']);

        $this->look($a, 'arrived mid-scroll');                     // must not shift page two
        $two = $this->feed(null, '?before=' . $one['next']);

        $ids = array_merge(array_column($one['looks'], 'id'), array_column($two['looks'], 'id'));
        $this->assertCount(20, $ids);
        $this->assertCount(20, array_unique($ids));
        $this->assertNotContains('arrived mid-scroll', array_column($two['looks'], 'caption'));
        $this->assertNull($two['next']);
        $this->assertSame('arrived mid-scroll', $this->feed(null)['looks'][0]['caption']);   // a fresh load sees it
    }

    #[Test]
    public function older_looks_follow_the_ranked_window_in_date_order_and_hidden_ones_never_appear(): void
    {
        $a = $this->member('rudo');
        $old1 = $this->look($a, 'last month 1'); $old2 = $this->look($a, 'last month 2');
        $this->travelTo(now()->addDays(Hive::RANK_DAYS + 5));
        $fresh = $this->look($a, 'this week');
        $hidden = $this->look($a, 'hidden by staff');
        Hive::setLookStatus($hidden, 'hidden');
        DB::table('hive_profiles')->where('customer_id', $this->member('gone')->id)->update(['suspended_at' => now()]);

        $one = $this->feed(null);
        $this->assertSame(['this week'], array_column($one['looks'], 'caption'));
        $this->assertSame($fresh, $one['next']);                   // window used up → a plain date cursor

        $two = $this->feed(null, '?before=' . $one['next']);
        $this->assertSame(['last month 2', 'last month 1'], array_column($two['looks'], 'caption'));
        $this->assertNull($two['next']);
    }

    // ─── Video ─────────────────────────────────────────────────────────────

    private function clip(): UploadedFile
    {
        return new UploadedFile(base_path('tests/Fixtures/clip.mp4'), 'clip.mp4', 'video/mp4', null, true);
    }

    #[Test]
    public function a_video_look_keeps_its_poster_as_the_image_and_says_what_playing_it_costs(): void
    {
        $rudo = $this->member('rudo');

        $look = $this->as($rudo)->post('/api/account/hive/looks', [
            'images' => [UploadedFile::fake()->image('poster.jpg')], 'video' => $this->clip(), 'video_seconds' => 2.1, 'caption' => 'Twirl',
        ], ['Accept' => 'application/json'])->assertOk()->json('look');

        $this->assertCount(1, $look['images']);                     // grids, share cards and moderation still have a picture
        $this->assertStringEndsWith('.mp4', $look['video']['url']);
        $this->assertSame(2, $look['video']['seconds']);
        $this->assertSame('31 KB', $look['video']['size_label']);
        $this->assertTrue(Media::isUnder($look['video']['url'], "hive/looks/{$rudo->id}"));
        $this->assertNull($this->feed(null)['looks'][0]['try_on']);
        $this->assertSame('31 KB', $this->feed(null)['looks'][0]['video']['size_label']);

        // Taking the look down takes the clip with it.
        $this->as($rudo)->deleteJson("/api/account/hive/looks/{$look['id']}")->assertOk();
        $this->assertFalse(Media::exists($look['video']['url']));
    }

    #[Test]
    public function a_clip_must_be_a_real_short_video_with_one_cover_image(): void
    {
        $rudo = $this->member('rudo');
        $post = fn (array $body) => $this->as($rudo)->post('/api/account/hive/looks', $body, ['Accept' => 'application/json']);
        $poster = [UploadedFile::fake()->image('p.jpg')];

        $post(['images' => $poster, 'video' => $this->clip(), 'video_seconds' => 95])->assertStatus(422);                 // too long
        $post(['images' => $poster, 'video' => $this->clip()])->assertStatus(422);                                          // no length given
        $post(['images' => $poster, 'video' => UploadedFile::fake()->image('not-a-video.mp4'), 'video_seconds' => 5])->assertStatus(422);   // a picture named .mp4
        $post(['images' => [UploadedFile::fake()->image('a.jpg'), UploadedFile::fake()->image('b.jpg')], 'video' => $this->clip(), 'video_seconds' => 2])->assertStatus(422);
        $post(['video' => $this->clip(), 'video_seconds' => 2])->assertStatus(422);                                         // no cover

        $this->assertSame(0, DB::table('hive_looks')->count());
    }

    #[Test]
    public function the_app_tells_the_phone_how_big_a_clip_this_server_really_accepts(): void
    {
        $opts = $this->as($this->member('rudo'))->getJson('/api/account/hive/me')->json('options.video');

        $this->assertSame(Hive::VIDEO_MAX_SECONDS, $opts['max_seconds']);
        $this->assertGreaterThan(0, $opts['max_bytes']);
        $this->assertLessThanOrEqual(Hive::VIDEO_MAX_BYTES, $opts['max_bytes']);
    }
}
