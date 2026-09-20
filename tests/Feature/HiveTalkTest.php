<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\User;
use App\Services\Hive;
use App\Services\HiveTalk;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Comments, Ask and Activity.
 *
 * The heaviest tests here guard Bees: an accepted answer pays real value
 * (100 Bees = $1), so two accounts must not be able to mint it between them.
 */
class HiveTalkTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        config(['media.disk' => null, 'filesystems.default' => 'local']);
    }

    private function member(string $n, bool $adult = true): Customer
    {
        DB::table('customers')->insert([
            'id' => "cust_$n", 'email' => "$n@example.com", 'password' => bcrypt('x'),
            'first_name' => ucfirst($n), 'last_name' => 'Moyo', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $c = Customer::find("cust_$n");
        Hive::profile($c);
        DB::table('hive_profiles')->where('customer_id', $c->id)->update(['adult_confirmed_at' => $adult ? now() : null]);

        return $c;
    }

    private function as(Customer $c): static
    {
        Auth::forgetGuards();

        return $this->actingAs($c, 'customer');
    }

    private function look(Customer $c): string
    {
        return $this->as($c)->post('/api/account/hive/looks', ['images' => [UploadedFile::fake()->image('l.jpg')]], ['Accept' => 'application/json'])->assertOk()->json('look.id');
    }

    private function question(Customer $c, array $extra = []): string
    {
        return $this->as($c)->post('/api/account/hive/asks', $extra + ['question' => 'What do I wear to a roora in October?'], ['Accept' => 'application/json'])->assertOk()->json('ask.id');
    }

    private function bees(Customer $c): int
    {
        return (int) DB::table('customers')->where('id', $c->id)->value('loyalty_points');
    }

    // ─── Comments ──────────────────────────────────────────────────────────

    #[Test]
    public function a_comment_is_plain_text_counted_once_and_tells_the_author(): void
    {
        $author = $this->member('rudo'); $fan = $this->member('chipo');
        $id = $this->look($author);

        $c = $this->as($fan)->postJson("/api/account/hive/looks/$id/comments", ['body' => ' <script>x</script>Love   this <b>colour</b> '])->assertOk()->json('comment');

        $this->assertSame('xLove this colour', $c['body']);
        $this->assertSame(1, $this->getJson('/api/store/hive/feed')->json('looks.0.comments'));
        $this->assertSame('xLove this colour', $this->getJson("/api/store/hive/looks/$id/comments")->json('comments.0.body'));

        $activity = $this->as($author)->getJson('/api/account/hive/activity')->json();
        $this->assertSame(1, $activity['unread']);
        $this->assertSame('hive_comment', $activity['items'][0]['kind']);
        $this->assertSame("/@rudo_moyo?look=$id", $activity['items'][0]['url']);

        // Commenting on your own look doesn't notify you.
        $this->as($author)->postJson("/api/account/hive/looks/$id/comments", ['body' => 'Thank you!'])->assertOk();
        $this->assertSame(1, $this->as($author)->getJson('/api/account/hive/activity')->json('unread'));

        $this->as($author)->postJson('/api/account/hive/activity/read')->assertOk();
        $this->assertSame(0, $this->as($author)->getJson('/api/account/hive/activity')->json('unread'));
    }

    #[Test]
    public function the_look_owner_can_clear_any_comment_under_their_look_but_a_stranger_cannot(): void
    {
        $author = $this->member('rudo'); $fan = $this->member('chipo'); $other = $this->member('tari');
        $id = $this->look($author);
        $one = $this->as($fan)->postJson("/api/account/hive/looks/$id/comments", ['body' => 'first'])->json('comment.id');
        $two = $this->as($fan)->postJson("/api/account/hive/looks/$id/comments", ['body' => 'second'])->json('comment.id');

        $this->as($other)->deleteJson("/api/account/hive/comments/$one")->assertStatus(404);
        $this->as($author)->deleteJson("/api/account/hive/comments/$one")->assertOk();
        $this->as($fan)->deleteJson("/api/account/hive/comments/$two")->assertOk();

        $this->assertSame(0, (int) DB::table('hive_looks')->where('id', $id)->value('comments_count'));
    }

    #[Test]
    public function comments_need_the_18_plus_confirmation_and_something_to_say(): void
    {
        $id = $this->look($this->member('rudo'));

        $this->as($this->member('young', adult: false))->postJson("/api/account/hive/looks/$id/comments", ['body' => 'hi'])->assertStatus(403)->assertJsonPath('needs', 'adult_confirmation');
        $this->as($this->member('chipo'))->postJson("/api/account/hive/looks/$id/comments", ['body' => '  <b></b> '])->assertStatus(422);
        Auth::forgetGuards();
        $this->app['auth']->guard('customer')->logout();
        $this->postJson("/api/account/hive/looks/$id/comments", ['body' => 'hi'])->assertStatus(401);
    }

    #[Test]
    public function a_heart_or_a_follow_notifies_once_however_many_times_it_is_tapped(): void
    {
        $author = $this->member('rudo'); $fan = $this->member('chipo');
        $id = $this->look($author);

        foreach (range(1, 3) as $_) {
            $this->as($fan)->postJson("/api/account/hive/looks/$id/like")->assertOk();
            $this->as($fan)->postJson('/api/account/hive/follow/rudo_moyo')->assertOk();
        }

        $kinds = array_column($this->as($author)->getJson('/api/account/hive/activity')->json('items'), 'kind');
        sort($kinds);
        $this->assertSame(['hive_follow', 'hive_like'], $kinds);
    }

    // ─── Ask ───────────────────────────────────────────────────────────────

    #[Test]
    public function a_which_one_vote_is_one_each_and_the_tally_is_hidden_until_you_vote(): void
    {
        $asker = $this->member('rudo'); $a = $this->member('chipo'); $b = $this->member('tari');
        $id = $this->question($asker, ['images' => [UploadedFile::fake()->image('a.jpg'), UploadedFile::fake()->image('b.jpg')]]);

        $before = $this->as($a)->getJson("/api/store/hive/asks/$id")->json('ask');
        $this->assertTrue($before['is_poll']);
        $this->assertNull($before['votes']);                       // no peeking at the crowd first

        $this->as($a)->postJson("/api/account/hive/asks/$id/vote", ['option' => 1])->assertOk()->assertJsonPath('votes', [0, 1]);
        $this->as($a)->postJson("/api/account/hive/asks/$id/vote", ['option' => 0])->assertOk()->assertJsonPath('votes', [0, 1]);   // final
        $this->as($b)->postJson("/api/account/hive/asks/$id/vote", ['option' => 1])->assertOk()->assertJsonPath('votes', [0, 2]);

        $this->as($a)->postJson("/api/account/hive/asks/$id/vote", ['option' => 3])->assertStatus(422);        // no such option
        $this->as($asker)->postJson("/api/account/hive/asks/$id/vote", ['option' => 0])->assertStatus(422);    // not on your own
        $this->assertSame([0, 2], $this->as($asker)->getJson("/api/store/hive/asks/$id")->json('ask.votes'));
    }

    #[Test]
    public function an_answer_can_be_a_product_from_the_catalogue_and_the_asker_hears_about_it(): void
    {
        $asker = $this->member('rudo'); $helper = $this->member('chipo');
        DB::table('products')->insert(['id' => 'prod_d', 'title' => 'Silk Dress', 'handle' => 'silk-dress', 'status' => 'published', 'created_at' => now(), 'updated_at' => now()]);
        $id = $this->question($asker);

        $this->as($helper)->postJson("/api/account/hive/asks/$id/answers", ['refs' => [['type' => 'product', 'id' => 'prod_nope']]])->assertStatus(422);
        $res = $this->as($helper)->postJson("/api/account/hive/asks/$id/answers", ['refs' => [['type' => 'product', 'id' => 'prod_d', 'title' => 'FREE']]])->assertOk();

        $this->assertSame('Silk Dress', $res->json('answers.0.refs.0.title'));
        $this->assertSame(1, $res->json('ask.answers'));
        $this->assertSame('hive_answer', $this->as($asker)->getJson('/api/account/hive/activity')->json('items.0.kind'));

        $this->as($asker)->postJson("/api/account/hive/asks/$id/answers", ['body' => 'me too'])->assertStatus(422);   // not your own question
    }

    #[Test]
    public function accepting_an_answer_pays_the_helper_once_and_is_final(): void
    {
        $asker = $this->member('rudo'); $helper = $this->member('chipo'); $other = $this->member('tari');
        $id = $this->question($asker);
        $this->as($helper)->postJson("/api/account/hive/asks/$id/answers", ['body' => 'A wrap dress in emerald.'])->assertOk();
        $second = $this->as($other)->postJson("/api/account/hive/asks/$id/answers", ['body' => 'Try the two-piece.'])->json('answers.1.id');
        $first = DB::table('hive_answers')->where('customer_id', $helper->id)->value('id');

        // Only the asker decides.
        $this->as($other)->postJson("/api/account/hive/asks/$id/accept", ['answer_id' => $first])->assertStatus(422);

        $res = $this->as($asker)->postJson("/api/account/hive/asks/$id/accept", ['answer_id' => $first])->assertOk();
        $this->assertSame(HiveTalk::ACCEPTED_ANSWER_BEES, $res->json('awarded'));
        $this->assertTrue($res->json('ask.solved'));
        $this->assertTrue($res->json('answers.0.accepted'));
        $this->assertSame(HiveTalk::ACCEPTED_ANSWER_BEES, $this->bees($helper));
        $this->assertSame(1, DB::table('blits_ledger')->where('customer_id', $helper->id)->where('reason', 'hive_answer_accepted')->count());

        // Final: no second acceptance, no switching, no un-paying by deleting.
        $this->as($asker)->postJson("/api/account/hive/asks/$id/accept", ['answer_id' => $second])->assertStatus(422);
        $this->as($helper)->deleteJson("/api/account/hive/answers/$first")->assertStatus(422);
        $this->assertSame(0, $this->bees($other));
        $this->assertStringContainsString('25 Bees', $this->as($helper)->getJson('/api/account/hive/activity')->json('items.0.title'));
    }

    #[Test]
    public function two_friends_cannot_farm_bees_from_each_other(): void
    {
        $asker = $this->member('rudo'); $helper = $this->member('chipo');

        foreach (range(1, 3) as $i) {
            $this->travelTo(now()->addMinutes(5));
            $id = $this->question($asker);
            $this->as($helper)->postJson("/api/account/hive/asks/$id/answers", ['body' => "idea $i"])->assertOk();
            $ans = DB::table('hive_answers')->where('ask_id', $id)->value('id');
            $res = $this->as($asker)->postJson("/api/account/hive/asks/$id/accept", ['answer_id' => $ans])->assertOk();
            // The answer is still accepted each time — it just stops paying.
            $this->assertTrue($res->json('ask.solved'));
        }

        $this->assertSame(HiveTalk::ACCEPTED_ANSWER_BEES, $this->bees($helper));

        // After the cool-down the same pair can earn again.
        $this->travelTo(now()->addDays(HiveTalk::SAME_PAIR_COOLDOWN_DAYS + 1));
        $id = $this->question($asker);
        $this->as($helper)->postJson("/api/account/hive/asks/$id/answers", ['body' => 'later'])->assertOk();
        $this->as($asker)->postJson("/api/account/hive/asks/$id/accept", ['answer_id' => DB::table('hive_answers')->where('ask_id', $id)->value('id')])->assertOk();
        $this->assertSame(2 * HiveTalk::ACCEPTED_ANSWER_BEES, $this->bees($helper));
    }

    #[Test]
    public function a_helper_is_paid_for_only_so_many_answers_a_day(): void
    {
        $helper = $this->member('chipo');

        foreach (range(1, HiveTalk::PAID_ACCEPTS_PER_DAY + 2) as $i) {
            $asker = $this->member("asker$i");
            $id = $this->question($asker);
            $this->as($helper)->postJson("/api/account/hive/asks/$id/answers", ['body' => "idea $i"])->assertOk();
            $this->as($asker)->postJson("/api/account/hive/asks/$id/accept", ['answer_id' => DB::table('hive_answers')->where('ask_id', $id)->value('id')])->assertOk();
        }

        $this->assertSame(HiveTalk::PAID_ACCEPTS_PER_DAY * HiveTalk::ACCEPTED_ANSWER_BEES, $this->bees($helper));
    }

    #[Test]
    public function questions_page_filter_by_occasion_and_only_their_owner_removes_them(): void
    {
        $asker = $this->member('rudo'); $other = $this->member('chipo');
        foreach (range(1, 14) as $i) {
            $this->travelTo(now()->addMinute());
            $this->question($asker, ['question' => "Question number $i please?", 'occasion' => $i % 2 ? 'roora' : 'work']);
        }

        $one = $this->getJson('/api/store/hive/asks')->json();
        $two = $this->getJson('/api/store/hive/asks?before=' . $one['next'])->json();
        $this->assertCount(HiveTalk::ASKS_PER_PAGE, $one['asks']);
        $this->assertSame('Question number 14 please?', $one['asks'][0]['question']);
        $this->assertCount(2, $two['asks']);
        $this->assertCount(7, $this->getJson('/api/store/hive/asks?occasion=roora')->json('asks'));

        $id = $one['asks'][0]['id'];
        $this->as($other)->deleteJson("/api/account/hive/asks/$id")->assertStatus(404);
        $this->as($asker)->deleteJson("/api/account/hive/asks/$id")->assertOk();
        $this->getJson("/api/store/hive/asks/$id")->assertStatus(404);
    }

    #[Test]
    public function being_busy_in_one_way_does_not_lock_you_out_of_another(): void
    {
        // Found in the browser: Laravel's plain `throttle:N,1` shares ONE counter
        // across every throttled route, so a few hearts and comments used up the
        // allowance for asking a question. Each kind of action has its own now.
        $author = $this->member('rudo'); $fan = $this->member('chipo');
        $look = $this->look($author);

        foreach (range(1, 15) as $i) {
            $this->as($fan)->postJson("/api/account/hive/looks/$look/like")->assertOk();
            $this->as($fan)->postJson("/api/account/hive/looks/$look/comments", ['body' => "comment $i"])->assertOk();
        }

        $this->question($fan);                                    // still allowed
        $this->as($author)->getJson('/api/account/hive/mentions')->assertOk();

        // …and the limit is per member, not shared by everyone on one network.
        foreach (range(1, 11) as $_) $this->question($fan);        // 12 a minute in all
        $this->as($fan)->post('/api/account/hive/asks', ['question' => 'One more question than allowed?'], ['Accept' => 'application/json'])->assertStatus(429);
        $this->question($author);
    }

    // ─── Moderation ────────────────────────────────────────────────────────

    #[Test]
    public function reported_words_are_hidden_by_several_people_and_staff_can_restore_them(): void
    {
        $author = $this->member('rudo'); $troll = $this->member('troll');
        $look = $this->look($author);
        $cmt = $this->as($troll)->postJson("/api/account/hive/looks/$look/comments", ['body' => 'rude words'])->json('comment.id');

        // You can't report yourself (it would be a free probe of the threshold).
        $this->as($troll)->postJson('/api/account/hive/reports', ['type' => 'comment', 'id' => $cmt, 'reason' => 'harassment'])->assertStatus(422);

        foreach (['a', 'b', 'c'] as $n) {
            $this->as($this->member($n))->postJson('/api/account/hive/reports', ['type' => 'comment', 'id' => $cmt, 'reason' => 'harassment'])->assertOk();
        }
        $this->assertSame([], $this->getJson("/api/store/hive/looks/$look/comments")->json('comments'));
        $this->assertSame(0, (int) DB::table('hive_looks')->where('id', $look)->value('comments_count'));

        Auth::forgetGuards();
        $admin = User::factory()->create();
        $queue = $this->actingAs($admin, 'web')->getJson('/api/admin/hive/reports')->assertOk()->json('reports');
        $this->assertSame('rude words', $queue[0]['talk']['text']);
        $this->assertSame('troll_moyo', $queue[0]['talk']['author']);

        $this->actingAs($admin, 'web')->putJson('/api/admin/hive/reports/' . $queue[0]['id'], ['decision' => 'dismiss'])->assertOk();
        $this->assertSame(1, (int) DB::table('hive_looks')->where('id', $look)->value('comments_count'));
        $this->assertSame(0, DB::table('hive_reports')->where('status', 'open')->count());
    }

    // ─── Discover ──────────────────────────────────────────────────────────

    #[Test]
    public function people_can_be_found_by_name_or_handle_and_the_feed_filters_by_occasion(): void
    {
        $rudo = $this->member('rudo'); $this->member('chipo');
        DB::table('hive_profiles')->where('customer_id', 'cust_chipo')->update(['suspended_at' => now()]);
        $this->as($rudo)->post('/api/account/hive/looks', ['images' => [UploadedFile::fake()->image('l.jpg')], 'occasion' => 'church'], ['Accept' => 'application/json'])->assertOk();
        $this->look($rudo);
        Auth::forgetGuards();
        $this->app['auth']->guard('customer')->logout();

        $this->assertSame(['rudo_moyo'], array_column($this->getJson('/api/store/hive/discover?q=@rud')->json('people'), 'handle'));
        $this->assertSame(['rudo_moyo'], array_column($this->getJson('/api/store/hive/discover?q=Moyo')->json('people'), 'handle'));   // suspended Chipo is absent
        $this->assertSame([], $this->getJson('/api/store/hive/discover?q=%25')->json('people'));
        $this->assertSame(['rudo_moyo'], array_column($this->getJson('/api/store/hive/discover')->json('people'), 'handle'));          // suggestions

        $this->assertCount(1, $this->getJson('/api/store/hive/feed?occasion=church')->json('looks'));
        $this->assertCount(2, $this->getJson('/api/store/hive/feed')->json('looks'));
    }
}
