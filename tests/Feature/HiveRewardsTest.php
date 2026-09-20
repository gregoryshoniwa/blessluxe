<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\User;
use App\Services\Hive;
use App\Services\HiveRewards;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Try-ons, challenges, and the earnings statement — every way the Hive mints
 * Bees besides accepted answers. Each test is a way someone might try to be
 * paid twice, or for something they didn't buy.
 */
class HiveRewardsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        config(['media.disk' => null, 'filesystems.default' => 'local']);
        DB::table('products')->insert(['id' => 'prod_d', 'title' => 'Silk Dress', 'handle' => 'silk-dress', 'status' => 'published', 'created_at' => now(), 'updated_at' => now()]);
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

    /** A paid (or not) order with one line of the Silk Dress. Returns the line id. */
    private function bought(Customer $c, string $n, string $payment = 'paid'): string
    {
        $cols = array_flip(\Illuminate\Support\Facades\Schema::getColumnListing('orders'));
        DB::table('orders')->insert(array_intersect_key([
            'id' => "order_$n", 'order_number' => "BL-$n", 'customer_id' => $c->id, 'email' => $c->email, 'status' => 'completed',
            'payment_status' => $payment, 'fulfillment_status' => 'delivered', 'currency_code' => 'usd',
            'subtotal' => 4500, 'total' => 4500, 'shipping_total' => 0, 'tax_total' => 0, 'discount_total' => 0,
            'created_at' => now(), 'updated_at' => now(),
        ], $cols));
        DB::table('order_line_items')->insert(['id' => "line_$n", 'order_id' => "order_$n", 'variant_id' => 'var_d', 'product_id' => 'prod_d', 'title' => 'Silk Dress', 'variant_title' => 'Size 14', 'quantity' => 1, 'unit_price' => 4500]);

        return "line_$n";
    }

    private function tryOn(Customer $c, string $line, array $extra = [])
    {
        return $this->as($c)->post('/api/account/hive/looks', $extra + [
            'images' => [UploadedFile::fake()->image('me.jpg')], 'line_item_id' => $line, 'fit' => 'small', 'rating' => 4,
        ], ['Accept' => 'application/json']);
    }

    private function bees(Customer $c): int { return (int) DB::table('customers')->where('id', $c->id)->value('loyalty_points'); }

    // ─── Try-ons ───────────────────────────────────────────────────────────

    #[Test]
    public function a_try_on_of_something_you_bought_earns_bees_and_tags_the_product_itself(): void
    {
        $rudo = $this->member('rudo');
        $line = $this->bought($rudo, 'A');

        $this->assertSame([$line], array_column($this->as($rudo)->getJson('/api/account/hive/tryons/eligible')->json('lines'), 'line_item_id'));

        $res = $this->tryOn($rudo, $line)->assertOk();

        $this->assertSame(HiveRewards::TRY_ON_BEES, $res->json('earned'));
        $this->assertSame(HiveRewards::TRY_ON_BEES, $this->bees($rudo));
        $this->assertSame(['fit' => 'small', 'size_worn' => 'Size 14', 'rating' => 4], $res->json('look.try_on'));
        $this->assertSame('Silk Dress', $res->json('look.refs.0.title'));          // added by the server, not the poster
        $this->assertSame([], $this->as($rudo)->getJson('/api/account/hive/tryons/eligible')->json('lines'));
    }

    #[Test]
    public function one_purchase_pays_once_even_if_the_look_is_deleted_and_posted_again(): void
    {
        $rudo = $this->member('rudo');
        $line = $this->bought($rudo, 'A');

        $this->tryOn($rudo, $line)->assertStatus(200);
        $this->tryOn($rudo, $line)->assertStatus(422);                              // already shown

        $id = DB::table('hive_looks')->value('id');
        $this->as($rudo)->deleteJson("/api/account/hive/looks/$id")->assertOk();

        // Posting again is allowed (the review is still useful) — and is told it earns nothing.
        $this->assertSame(0, $this->as($rudo)->getJson('/api/account/hive/tryons/eligible')->json('lines.0.earns'));
        $this->assertSame(0, $this->tryOn($rudo, $line)->assertOk()->json('earned'));
        $this->assertSame(HiveRewards::TRY_ON_BEES, $this->bees($rudo));
        $this->assertSame(1, DB::table('blits_ledger')->where('reason', 'hive_try_on')->count());
    }

    #[Test]
    public function you_cannot_claim_someone_elses_order_or_an_unpaid_or_refunded_one(): void
    {
        $rudo = $this->member('rudo'); $chipo = $this->member('chipo');
        $hers = $this->bought($chipo, 'A');
        $unpaid = $this->bought($rudo, 'B', 'pending');
        $refunded = $this->bought($rudo, 'C', 'refunded');

        foreach ([$hers, $unpaid, $refunded, 'line_made_up'] as $line) $this->tryOn($rudo, $line)->assertStatus(422);
        $this->tryOn($rudo, $this->bought($rudo, 'D'), ['fit' => ''])->assertStatus(422);   // a try-on must say how it fits

        $this->assertSame(0, $this->bees($rudo));
        $this->assertSame(0, DB::table('hive_looks')->count());
    }

    #[Test]
    public function a_product_page_shows_how_it_fits_with_people_built_like_me_first(): void
    {
        $me = $this->member('viewer', ['bust_cm' => 96, 'waist_cm' => 80, 'hips_cm' => 110, 'fit_visibility' => 'twins']);
        $twin = $this->member('twin', ['bust_cm' => 96, 'waist_cm' => 81, 'hips_cm' => 110, 'fit_visibility' => 'twins']);
        $other = $this->member('other', ['bust_cm' => 80, 'waist_cm' => 62, 'hips_cm' => 86, 'fit_visibility' => 'twins']);
        $shy = $this->member('shy', ['bust_cm' => 96, 'waist_cm' => 80, 'hips_cm' => 110, 'fit_visibility' => 'private']);

        $this->tryOn($twin, $this->bought($twin, 'A'), ['fit' => 'small'])->assertOk();
        $this->travelTo(now()->addMinute());
        $this->tryOn($other, $this->bought($other, 'B'), ['fit' => 'small'])->assertOk();
        $this->travelTo(now()->addMinute());
        $this->tryOn($shy, $this->bought($shy, 'C'), ['fit' => 'true', 'rating' => 5])->assertOk();

        $res = $this->as($me)->getJson('/api/store/hive/products/silk-dress/tryons')->assertOk()->json();

        $this->assertSame(3, $res['total']);
        $this->assertSame(['small' => 67, 'true' => 33, 'large' => 0], $res['summary']);
        $this->assertSame('twin_moyo', $res['tryons'][0]['author']['handle']);      // my twin first, though posted first
        $this->assertGreaterThan(90, $res['tryons'][0]['twin_match']);
        // Someone who keeps their fit private is never scored against me.
        $shyRow = collect($res['tryons'])->firstWhere('author.handle', 'shy_moyo');
        $this->assertNull($shyRow['twin_match']);
        $this->assertStringNotContainsString('110', json_encode($res));              // and nobody's measurements are here
    }

    // ─── Challenges ────────────────────────────────────────────────────────

    private function challenge(array $over = []): string
    {
        $id = 'chal_' . \Illuminate\Support\Str::ulid();
        DB::table('hive_challenges')->insert($over + [
            'id' => $id, 'slug' => 'sunday-best', 'title' => 'Sunday Best', 'prize_bees' => 500, 'winners' => 2,
            'starts_at' => now()->subDay(), 'ends_at' => now()->addDays(3), 'is_published' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    private function enter(Customer $c, ?string $challengeId): string
    {
        return $this->as($c)->post('/api/account/hive/looks', ['images' => [UploadedFile::fake()->image('l.jpg')], 'challenge_id' => $challengeId], ['Accept' => 'application/json'])->assertOk()->json('look.id');
    }

    #[Test]
    public function only_live_published_challenges_are_offered_and_can_be_entered(): void
    {
        $live = $this->challenge();
        $this->challenge(['slug' => 'draft', 'is_published' => false]);
        $over = $this->challenge(['slug' => 'over', 'starts_at' => now()->subDays(9), 'ends_at' => now()->subDays(2)]);
        $this->challenge(['slug' => 'soon', 'starts_at' => now()->addDay(), 'ends_at' => now()->addDays(5)]);

        $this->assertSame(['sunday-best'], array_column($this->getJson('/api/store/hive/challenges')->json('challenges'), 'slug'));
        $this->assertSame('#SundayBest', $this->getJson('/api/store/hive/challenges/sunday-best')->json('challenge.tag'));
        $this->getJson('/api/store/hive/challenges/draft')->assertStatus(404);

        $rudo = $this->member('rudo');
        $in = $this->enter($rudo, $live);
        $late = $this->enter($rudo, $over);                      // too late: it posts as an ordinary look

        $this->assertSame($live, DB::table('hive_looks')->where('id', $in)->value('challenge_id'));
        $this->assertNull(DB::table('hive_looks')->where('id', $late)->value('challenge_id'));
        $this->assertSame([$in], array_column($this->getJson('/api/store/hive/challenges/sunday-best')->json('looks'), 'id'));
        $this->assertSame(1, $this->getJson('/api/store/hive/challenges/sunday-best')->json('challenge.entries'));
    }

    #[Test]
    public function staff_award_a_challenge_once_after_it_ends_one_prize_per_person(): void
    {
        $id = $this->challenge();
        $a = $this->member('rudo'); $b = $this->member('chipo');
        $a1 = $this->enter($a, $id); $a2 = $this->enter($a, $id); $b1 = $this->enter($b, $id);
        $outsider = $this->enter($b, null);
        Auth::forgetGuards();
        $admin = User::factory()->create();
        $award = fn (array $ids) => $this->actingAs($admin, 'web')->postJson("/api/admin/hive/challenges/$id/award", ['look_ids' => $ids]);

        $award([$a1, $b1])->assertStatus(422);                   // still open

        $this->travelTo(now()->addDays(4));
        $award([$a1, $a2])->assertStatus(422);                   // two prizes to one person
        $award([$outsider])->assertStatus(422);                  // not an entry
        $award([$a1, $b1])->assertOk();
        $award([$a1, $b1])->assertStatus(422);                   // final — a second click pays nothing

        $this->assertSame(500, (int) DB::table('customers')->where('id', $a->id)->value('loyalty_points'));
        $this->assertSame(500, (int) DB::table('customers')->where('id', $b->id)->value('loyalty_points'));
        $this->assertSame(2, DB::table('blits_ledger')->where('reason', 'hive_challenge_win')->count());
        $this->assertSame([true, false, true], array_column($this->getJson('/api/store/hive/challenges/sunday-best')->json('looks'), 'won'));   // newest first: b1, a2, a1
        $this->assertSame('awarded', $this->getJson('/api/store/hive/challenges/sunday-best')->json('challenge.state'));

        // Awarded challenges are frozen.
        $this->actingAs($admin, 'web')->putJson("/api/admin/hive/challenges/$id", ['title' => 'Changed', 'prize_bees' => 9, 'winners' => 1, 'starts_at' => now()->subDay(), 'ends_at' => now()])->assertStatus(422);
    }

    #[Test]
    public function staff_create_challenges_and_members_cannot(): void
    {
        $body = ['title' => 'Roora Ready', 'prize_bees' => 300, 'winners' => 3, 'starts_at' => now()->toIso8601String(), 'ends_at' => now()->addWeek()->toIso8601String(), 'is_published' => true];

        $this->as($this->member('rudo'))->postJson('/api/admin/hive/challenges', $body)->assertUnauthorized();

        Auth::forgetGuards();
        $admin = User::factory()->create();
        $this->actingAs($admin, 'web')->postJson('/api/admin/hive/challenges', $body)->assertOk()->assertJsonPath('challenge.slug', 'roora-ready')->assertJsonPath('challenge.state', 'live');
        $this->actingAs($admin, 'web')->postJson('/api/admin/hive/challenges', $body)->assertStatus(422);        // tag taken
        $this->actingAs($admin, 'web')->postJson('/api/admin/hive/challenges', ['ends_at' => now()->subDay()->toIso8601String()] + $body)->assertStatus(422);
    }

    // ─── Earnings ──────────────────────────────────────────────────────────

    #[Test]
    public function the_statement_adds_up_only_what_the_hive_paid(): void
    {
        $rudo = $this->member('rudo');
        $this->tryOn($rudo, $this->bought($rudo, 'A'))->assertOk();
        \App\Services\Bees::credit($rudo->id, 1000, 'order_earn', 'order_A');       // shop Bees are not Hive earnings

        $s = $this->as($rudo)->getJson('/api/account/hive/earnings')->assertOk()->json();

        $this->assertSame(HiveRewards::TRY_ON_BEES, $s['total_bees']);
        $this->assertSame('$0.50', $s['worth_label']);
        $this->assertSame(1050, $s['balance']);
        $this->assertSame('Try-on review', $s['by_reason'][0]['label']);
        $this->assertCount(1, $s['recent']);

        Auth::forgetGuards();
        $this->app['auth']->guard('customer')->logout();
        $this->getJson('/api/account/hive/earnings')->assertStatus(401);
    }
}
