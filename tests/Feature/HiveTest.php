<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\User;
use App\Services\Hive;
use App\Services\Media;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Bless Hive — pages, fit, looks, follows.
 *
 * Most of these are promises made TO members rather than features: your
 * measurements stay yours, nobody can take your post down alone, a child's
 * safety report is never left waiting, you can't be impersonated.
 */
class HiveTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        config(['media.disk' => null, 'filesystems.default' => 'local']);
    }

    private function member(string $n, array $fit = [], bool $adult = true): Customer
    {
        DB::table('customers')->insert([
            'id' => "cust_$n", 'email' => "$n@example.com", 'password' => bcrypt('x'),
            'first_name' => ucfirst($n), 'last_name' => 'Moyo', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $c = Customer::find("cust_$n");
        Hive::profile($c);
        DB::table('hive_profiles')->where('customer_id', $c->id)->update($fit + ['adult_confirmed_at' => $adult ? now() : null]);

        return $c;
    }

    private function as(Customer $c): static
    {
        \Illuminate\Support\Facades\Auth::forgetGuards();

        return $this->actingAs($c, 'customer');
    }

    private function postLook(Customer $c, array $extra = [])
    {
        return $this->as($c)->post('/api/account/hive/looks', $extra + [
            'images' => [UploadedFile::fake()->image('look.jpg', 900, 1200)], 'caption' => 'Sunday best',
        ], ['Accept' => 'application/json']);
    }

    // ─── Everyone has a page ───────────────────────────────────────────────

    #[Test]
    public function a_customer_gets_a_page_the_first_time_one_is_needed(): void
    {
        DB::table('customers')->insert(['id' => 'cust_new', 'email' => 'tendai@example.com', 'password' => bcrypt('x'), 'first_name' => 'Tendai', 'last_name' => 'Ncube', 'created_at' => now(), 'updated_at' => now()]);

        $me = $this->as(Customer::find('cust_new'))->getJson('/api/account/hive/me')->assertOk()->json('me');

        $this->assertSame('tendai_ncube', $me['handle']);
        $this->assertSame('Tendai Ncube', $me['display_name']);
        $this->assertSame('private', $me['fit_visibility']);          // the most private setting is the default
        $this->assertFalse($me['adult_confirmed']);
        $this->getJson('/api/store/hive/pages/tendai_ncube')->assertOk();
    }

    #[Test]
    public function two_people_with_the_same_name_get_different_handles(): void
    {
        $a = $this->member('rudo'); $b = Customer::find('cust_rudo');
        DB::table('customers')->insert(['id' => 'cust_rudo2', 'email' => 'r2@example.com', 'password' => bcrypt('x'), 'first_name' => 'Rudo', 'last_name' => 'Moyo', 'created_at' => now(), 'updated_at' => now()]);

        $second = Hive::profile(Customer::find('cust_rudo2'));

        $this->assertNotSame(Hive::profile($a)->handle, $second->handle);
        $this->assertStringStartsWith('rudo_moyo', $second->handle);
    }

    #[Test]
    public function a_handle_cannot_impersonate_the_brand_or_collide_with_a_route(): void
    {
        $me = $this->member('rudo');
        $this->member('chipo');

        foreach (['admin', 'BlessLuxe', '@blessluxe_official', 'hive', 'support', 'chipo_moyo', 'ab'] as $bad) {
            $this->as($me)->putJson('/api/account/hive/me', ['handle' => $bad])->assertStatus(422);
        }
        $this->as($me)->putJson('/api/account/hive/me', ['handle' => '  Rudo.Styles  '])->assertOk()->assertJsonPath('me.handle', 'rudo.styles');
    }

    // ─── Measurements are private ──────────────────────────────────────────

    #[Test]
    public function measurements_never_reach_another_person_unless_the_owner_made_them_public(): void
    {
        $fit = ['bust_cm' => 96, 'waist_cm' => 80, 'hips_cm' => 110, 'height_cm' => 165, 'size_dress' => '14', 'body_shape' => 'pear'];
        $rudo = $this->member('rudo', $fit + ['fit_visibility' => 'private']);
        $viewer = $this->member('chipo', ['bust_cm' => 95, 'waist_cm' => 79, 'hips_cm' => 109, 'fit_visibility' => 'twins']);
        $page = fn () => $this->as($viewer)->getJson('/api/store/hive/pages/rudo_moyo')->json('page');

        // private: nothing at all — not even her dress size.
        $this->assertNull($page()['fit']);
        $this->assertNull($page()['twin_match']);

        // twins: sizes and shape (what makes a twin useful) — never the tape measure.
        DB::table('hive_profiles')->where('customer_id', $rudo->id)->update(['fit_visibility' => 'twins']);
        $this->assertSame(['body_shape' => 'pear', 'size_dress' => '14'], $page()['fit']);
        $this->assertStringNotContainsString('110', json_encode($page()));
        $this->assertGreaterThan(90, $page()['twin_match']);

        // public: her choice.
        DB::table('hive_profiles')->where('customer_id', $rudo->id)->update(['fit_visibility' => 'public']);
        $this->assertSame(110, $page()['fit']['hips_cm']);

        // She always sees her own.
        DB::table('hive_profiles')->where('customer_id', $rudo->id)->update(['fit_visibility' => 'private']);
        $this->assertSame(110, $this->as($rudo)->getJson('/api/account/hive/me')->json('me.fit.hips_cm'));
    }

    #[Test]
    public function fit_twins_are_people_built_alike_who_agreed_to_be_matched(): void
    {
        $me = $this->member('rudo', ['bust_cm' => 96, 'waist_cm' => 80, 'hips_cm' => 110, 'fit_visibility' => 'twins']);
        $this->member('close',   ['bust_cm' => 97, 'waist_cm' => 81, 'hips_cm' => 109, 'fit_visibility' => 'twins']);
        $this->member('closer',  ['bust_cm' => 96, 'waist_cm' => 80, 'hips_cm' => 110, 'fit_visibility' => 'public']);
        $this->member('secret',  ['bust_cm' => 96, 'waist_cm' => 80, 'hips_cm' => 110, 'fit_visibility' => 'private']);
        $this->member('distant', ['bust_cm' => 80, 'waist_cm' => 62, 'hips_cm' => 88,  'fit_visibility' => 'twins']);

        $res = $this->as($me)->getJson('/api/account/hive/twins')->assertOk();

        // Best match first; the private one and the differently built one are absent.
        $this->assertSame(['closer_moyo', 'close_moyo'], array_column($res->json('twins'), 'handle'));
        $this->assertTrue($res->json('ready'));

        // If I keep my own fit private I can't browse other people's either.
        DB::table('hive_profiles')->where('customer_id', $me->id)->update(['fit_visibility' => 'private']);
        $res = $this->as($me)->getJson('/api/account/hive/twins');
        $this->assertSame([], $res->json('twins'));
        $this->assertFalse($res->json('ready'));
    }

    // ─── 18+ ───────────────────────────────────────────────────────────────

    #[Test]
    public function posting_liking_and_following_need_the_18_plus_confirmation(): void
    {
        $author = $this->member('rudo');
        $look = $this->postLook($author)->assertOk()->json('look.id');
        $newbie = $this->member('young', [], adult: false);

        $this->postLook($newbie)->assertStatus(403)->assertJsonPath('needs', 'adult_confirmation');
        $this->as($newbie)->postJson("/api/account/hive/looks/$look/like")->assertStatus(403);
        $this->as($newbie)->postJson('/api/account/hive/follow/rudo_moyo')->assertStatus(403);

        $this->as($newbie)->putJson('/api/account/hive/me', ['confirm_adult' => true])->assertOk()->assertJsonPath('me.adult_confirmed', true);
        $this->as($newbie)->postJson('/api/account/hive/follow/rudo_moyo')->assertOk();
    }

    // ─── Looks ─────────────────────────────────────────────────────────────

    #[Test]
    public function a_look_is_photos_plus_products_written_by_the_catalogue(): void
    {
        $me = $this->member('rudo');
        DB::table('products')->insert(['id' => 'prod_d', 'title' => 'Silk Dress', 'handle' => 'silk-dress', 'status' => 'published', 'thumbnail' => '/img/d.jpg', 'created_at' => now(), 'updated_at' => now()]);

        $look = $this->postLook($me, [
            'caption' => '<b>Roora</b> ready', 'occasion' => 'roora',
            'refs' => json_encode([['type' => 'product', 'id' => 'prod_d', 'title' => 'FREE', 'price_label' => '$0']]),
        ])->assertOk()->json('look');

        $this->assertSame('Roora ready', $look['caption']);
        $this->assertSame('Silk Dress', $look['refs'][0]['title']);                  // not "FREE"
        $this->assertTrue(Media::isUnder($look['images'][0], "hive/looks/{$me->id}"));
        $this->assertSame(1, $this->getJson('/api/store/hive/pages/rudo_moyo')->json('page.looks'));
    }

    #[Test]
    public function any_member_can_tag_products_not_only_affiliates(): void
    {
        DB::table('products')->insert(['id' => 'prod_d', 'title' => 'Silk Dress', 'handle' => 'silk-dress', 'status' => 'published', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('products')->insert(['id' => 'prod_x', 'title' => 'Secret Drop', 'handle' => 'secret', 'status' => 'draft', 'created_at' => now(), 'updated_at' => now()]);

        $res = $this->as($this->member('rudo'))->getJson('/api/account/hive/mentions')->assertOk();

        $this->assertSame(['Silk Dress'], array_column($res->json('items'), 'title'));

        \Illuminate\Support\Facades\Auth::forgetGuards();
        $this->app['auth']->guard('customer')->logout();
        $this->getJson('/api/account/hive/mentions')->assertStatus(401);
    }

    #[Test]
    public function a_shared_page_link_carries_the_persons_name_for_the_whatsapp_preview(): void
    {
        $this->member('rudo');

        $this->get('/@rudo_moyo')->assertOk()->assertSee('Rudo Moyo (@rudo_moyo) · Bless Hive', false);
        $this->get('/hive')->assertOk()->assertSee('Bless Hive', false);
    }

    #[Test]
    public function only_the_author_sees_how_many_likes_a_look_has(): void
    {
        $author = $this->member('rudo'); $fan = $this->member('chipo');
        $id = $this->postLook($author)->json('look.id');

        $this->as($fan)->postJson("/api/account/hive/looks/$id/like")->assertOk();
        $this->as($fan)->postJson("/api/account/hive/looks/$id/like")->assertOk();      // a double tap is one like

        $asFan = $this->as($fan)->getJson('/api/store/hive/feed')->json('looks.0');
        $this->assertTrue($asFan['liked']);
        $this->assertNull($asFan['likes']);                                            // no public tally
        $this->assertSame(1, $this->as($author)->getJson('/api/store/hive/feed')->json('looks.0.likes'));

        $this->as($fan)->deleteJson("/api/account/hive/looks/$id/like")->assertOk();
        $this->assertSame(0, (int) DB::table('hive_looks')->where('id', $id)->value('likes_count'));
    }

    #[Test]
    public function the_feed_pages_without_gaps_and_following_shows_only_who_i_follow(): void
    {
        $a = $this->member('rudo'); $b = $this->member('chipo'); $me = $this->member('viewer');
        foreach (range(1, 15) as $i) {
            $this->travelTo(now()->addMinute());
            $this->postLook($i % 2 ? $a : $b, ['caption' => "look $i"])->assertOk();
        }

        $one = $this->getJson('/api/store/hive/feed')->json();
        $two = $this->getJson('/api/store/hive/feed?before=' . $one['next'])->json();

        $this->assertCount(Hive::LOOKS_PER_PAGE, $one['looks']);
        $this->assertSame('look 15', $one['looks'][0]['caption']);
        $this->assertCount(3, $two['looks']);
        $this->assertNull($two['next']);
        $this->assertCount(15, array_unique(array_merge(array_column($one['looks'], 'id'), array_column($two['looks'], 'id'))));

        $this->as($me)->postJson('/api/account/hive/follow/chipo_moyo')->assertOk();
        $following = $this->as($me)->getJson('/api/store/hive/feed?scope=following')->json('looks');
        $this->assertSame(['chipo_moyo'], array_values(array_unique(array_column(array_column($following, 'author'), 'handle'))));
    }

    #[Test]
    public function follower_counts_cannot_be_inflated_and_you_cannot_follow_yourself(): void
    {
        $star = $this->member('rudo'); $fan = $this->member('chipo');

        foreach (range(1, 3) as $_) $this->as($fan)->postJson('/api/account/hive/follow/rudo_moyo')->assertOk();
        $this->assertSame(1, $this->getJson('/api/store/hive/pages/rudo_moyo')->json('page.followers'));

        $this->as($fan)->deleteJson('/api/account/hive/follow/rudo_moyo')->assertOk();
        $this->as($fan)->deleteJson('/api/account/hive/follow/rudo_moyo')->assertOk();
        $this->assertSame(0, (int) DB::table('hive_profiles')->where('customer_id', $star->id)->value('followers_count'));

        $this->as($star)->postJson('/api/account/hive/follow/rudo_moyo')->assertStatus(422);
    }

    #[Test]
    public function only_the_owner_can_take_a_look_down_and_its_photos_go_with_it(): void
    {
        $author = $this->member('rudo'); $other = $this->member('chipo');
        $look = $this->postLook($author)->json('look');

        $this->as($other)->deleteJson("/api/account/hive/looks/{$look['id']}")->assertStatus(404);
        $this->assertTrue(Media::exists($look['images'][0]));

        $this->as($author)->deleteJson("/api/account/hive/looks/{$look['id']}")->assertOk();
        $this->assertFalse(Media::exists($look['images'][0]));
        $this->assertSame(0, (int) DB::table('hive_profiles')->where('customer_id', $author->id)->value('looks_count'));
    }

    // ─── Reports and moderation ────────────────────────────────────────────

    #[Test]
    public function no_single_person_can_take_a_post_down_but_several_can(): void
    {
        $author = $this->member('rudo');
        $id = $this->postLook($author)->json('look.id');
        $visible = fn () => count($this->getJson('/api/store/hive/feed')->json('looks'));

        $troll = $this->member('troll');
        foreach (range(1, 5) as $_) {
            $this->as($troll)->postJson('/api/account/hive/reports', ['type' => 'look', 'id' => $id, 'reason' => 'spam'])->assertOk();
        }
        $this->assertSame(1, $visible());                                // five taps from one person = one report

        foreach (['b', 'c'] as $n) {
            $this->as($this->member($n))->postJson('/api/account/hive/reports', ['type' => 'look', 'id' => $id, 'reason' => 'spam'])->assertOk();
        }
        $this->assertSame(0, $visible());                                // three different people: hidden pending review
        $this->assertSame(0, (int) DB::table('hive_profiles')->where('customer_id', $author->id)->value('looks_count'));
    }

    #[Test]
    public function a_report_about_a_child_hides_the_look_immediately(): void
    {
        $id = $this->postLook($this->member('rudo'))->json('look.id');

        $this->as($this->member('chipo'))->postJson('/api/account/hive/reports', ['type' => 'look', 'id' => $id, 'reason' => 'minor'])->assertOk();

        $this->assertSame('hidden', DB::table('hive_looks')->where('id', $id)->value('status'));
    }

    #[Test]
    public function staff_can_restore_a_wrongly_hidden_look_or_suspend_a_page(): void
    {
        $author = $this->member('rudo');
        $id = $this->postLook($author)->json('look.id');
        $this->as($this->member('chipo'))->postJson('/api/account/hive/reports', ['type' => 'look', 'id' => $id, 'reason' => 'minor']);
        $admin = User::factory()->create();

        \Illuminate\Support\Facades\Auth::forgetGuards();
        $queue = $this->actingAs($admin, 'web')->getJson('/api/admin/hive/reports')->assertOk()->json();
        $this->assertSame(1, $queue['open_count']);
        $this->assertSame('rudo_moyo', $queue['reports'][0]['look']['author']);

        $this->actingAs($admin, 'web')->putJson('/api/admin/hive/reports/' . $queue['reports'][0]['id'], ['decision' => 'dismiss'])->assertOk();
        $this->assertSame('published', DB::table('hive_looks')->where('id', $id)->value('status'));
        $this->assertSame(1, (int) DB::table('hive_profiles')->where('customer_id', $author->id)->value('looks_count'));

        // A suspended page disappears from the feed and can't be opened.
        DB::table('hive_profiles')->where('customer_id', $author->id)->update(['suspended_at' => now()]);
        $this->assertSame([], $this->getJson('/api/store/hive/feed')->json('looks'));
        $this->getJson('/api/store/hive/pages/rudo_moyo')->assertStatus(404);
    }

    #[Test]
    public function moderation_is_staff_only_and_joining_needs_an_account(): void
    {
        \Illuminate\Support\Facades\Auth::forgetGuards();
        $this->getJson('/api/admin/hive/reports')->assertUnauthorized();
        $this->as($this->member('rudo'))->getJson('/api/admin/hive/reports')->assertUnauthorized();

        \Illuminate\Support\Facades\Auth::forgetGuards();
        $this->getJson('/api/account/hive/me')->assertStatus(401);
        $this->getJson('/api/store/hive/feed')->assertOk();            // reading stays open
    }
}
