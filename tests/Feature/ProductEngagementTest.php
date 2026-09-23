<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Services\ProductEngagement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Ratings, hearts and comments — and the Bees they pay.
 *
 * Bees are money (100 = $1 off), so most of this file is about the ways
 * somebody would try to earn them twice.
 */
class ProductEngagementTest extends TestCase
{
    use RefreshDatabase;

    private function shopper(string $id = 'cust_1', string $email = 'rudo@example.test'): Customer
    {
        DB::table('customers')->insert([
            'id' => $id, 'email' => $email, 'password' => bcrypt('x'),
            'first_name' => 'Rudo', 'last_name' => 'Moyo', 'loyalty_points' => 0,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return Customer::find($id);
    }

    private function product(string $id = 'prod_1', string $handle = 'dress'): string
    {
        DB::table('products')->insert([
            'id' => $id, 'title' => 'Silk Gown', 'handle' => $handle, 'status' => 'published',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    private function bees(string $customerId): int
    {
        return (int) DB::table('customers')->where('id', $customerId)->value('loyalty_points');
    }

    private function as(Customer $c): static
    {
        Auth::forgetGuards();

        return $this->actingAs($c, 'customer');
    }

    // ─── Earning, once ─────────────────────────────────────────────────────

    #[Test]
    public function each_way_of_speaking_up_pays_once_per_piece_and_never_again(): void
    {
        $c = $this->shopper();
        $this->product();

        $this->as($c)->postJson('/api/account/products/dress/rating', ['stars' => 5])->assertOk()->assertJsonPath('bees', 1);
        $this->as($c)->postJson('/api/account/products/dress/like')->assertOk()->assertJsonPath('bees', 1);
        $this->as($c)->postJson('/api/account/products/dress/comments', ['body' => 'Fits beautifully, wore it to a wedding.'])->assertOk()->assertJsonPath('bees', 2);
        $this->assertSame(4, $this->bees('cust_1'));

        // Changing your mind about the stars pays nothing more.
        $this->as($c)->postJson('/api/account/products/dress/rating', ['stars' => 3])->assertOk()->assertJsonPath('bees', 0);

        // Unheart, heart again: the promise row outlives the like.
        $this->as($c)->postJson('/api/account/products/dress/like')->assertOk()->assertJsonPath('summary.mine.liked', false);
        $this->as($c)->postJson('/api/account/products/dress/like')->assertOk()->assertJsonPath('bees', 0)->assertJsonPath('summary.mine.liked', true);

        // Delete the review and write another: still nothing.
        $id = DB::table('product_comments')->where('customer_id', 'cust_1')->value('id');
        $this->as($c)->deleteJson('/api/account/product-comments/' . $id)->assertOk();
        $this->as($c)->postJson('/api/account/products/dress/comments', ['body' => 'Second go at saying something nice.'])->assertOk()->assertJsonPath('bees', 0);

        $this->assertSame(4, $this->bees('cust_1'));
        $this->assertSame(3, DB::table('product_engagement_rewards')->count());
    }

    #[Test]
    public function the_day_has_a_ceiling_and_hitting_it_never_blocks_anyone_from_speaking(): void
    {
        $c = $this->shopper();
        for ($i = 1; $i <= 7; $i++) $this->product("prod_$i", "piece-$i");

        // Five paid actions, one per piece.
        for ($i = 1; $i <= 5; $i++) {
            $this->as($c)->postJson("/api/account/products/piece-$i/like")->assertOk()->assertJsonPath('bees', 1);
        }
        $this->assertSame(5, $this->bees('cust_1'));

        // The sixth still counts as a like — it simply earns nothing.
        $res = $this->as($c)->postJson('/api/account/products/piece-6/like')->assertOk();
        $this->assertSame(0, $res->json('bees'));
        $this->assertSame(0, $res->json('remaining_today'));
        $this->assertTrue($res->json('summary.mine.liked'));
        $this->assertSame(1, (int) DB::table('products')->where('id', 'prod_6')->value('likes_count'));
        $this->assertSame(5, $this->bees('cust_1'));

        // Tomorrow the allowance is back.
        $this->travel(1)->day();
        $this->as($c)->postJson('/api/account/products/piece-7/like')->assertOk()->assertJsonPath('bees', 1);
        $this->assertSame(6, $this->bees('cust_1'));
    }

    #[Test]
    public function a_few_characters_is_not_a_review_and_earns_nothing(): void
    {
        $c = $this->shopper();
        $this->product();

        $this->as($c)->postJson('/api/account/products/dress/comments', ['body' => 'nice'])->assertStatus(422);
        $this->assertSame(0, $this->bees('cust_1'));
        $this->assertSame(0, DB::table('product_comments')->count());
    }

    #[Test]
    public function nothing_is_paid_while_bees_are_switched_off(): void
    {
        DB::table('settings')->updateOrInsert(['key' => 'blits.enabled'], ['value' => 'false', 'updated_at' => now()]);
        $c = $this->shopper();
        $this->product();

        $this->as($c)->postJson('/api/account/products/dress/rating', ['stars' => 5])->assertOk()->assertJsonPath('bees', 0);
        $this->assertSame(0, $this->bees('cust_1'));
        // …and the rating itself still counted.
        $this->assertSame(1, (int) DB::table('products')->where('id', 'prod_1')->value('rating_count'));
    }

    #[Test]
    public function staff_set_the_rates_and_the_shop_pays_what_they_chose(): void
    {
        $c = $this->shopper();
        $this->product();
        $this->product('prod_2', 'gown');

        // A fresh install seeds the owner's figures.
        $this->assertSame(['rate' => 1, 'like' => 1, 'comment' => 2, 'daily_cap' => 5, 'min_length' => 15], ProductEngagement::settings());

        Auth::forgetGuards();
        $admin = $this->actingAs(\App\Models\User::factory()->create(), 'web');
        $admin->putJson('/api/admin/bees', ['engagement' => ['rate' => 25, 'daily_cap' => 1, 'min_length' => 5]])
            ->assertOk()->assertJsonPath('engagement.rate', 25);

        // Bees still work as before — they share one Save.
        $this->assertSame(100, $admin->getJson('/api/admin/bees')->json('settings.per_usd'));

        $this->as($c)->postJson('/api/account/products/dress/rating', ['stars' => 5])->assertOk()->assertJsonPath('bees', 25);
        // The new cap of one bites immediately.
        $this->as($c)->postJson('/api/account/products/gown/rating', ['stars' => 5])->assertOk()->assertJsonPath('bees', 0);
        // And the shorter minimum is what a review is now measured against.
        $this->as($c)->postJson('/api/account/products/dress/comments', ['body' => 'Lovely'])->assertOk();
        $this->assertSame(25, $this->bees('cust_1'));

        // The page tells the customer the same numbers staff typed.
        $this->assertSame(25, $this->getJson('/api/store/products/dress/engagement')->json('summary.rewards.rate'));
    }

    #[Test]
    public function a_typo_in_the_rates_is_refused_rather_than_costing_a_fortune(): void
    {
        Auth::forgetGuards();
        $admin = $this->actingAs(\App\Models\User::factory()->create(), 'web');

        $admin->putJson('/api/admin/bees', ['engagement' => ['comment' => 100000]])->assertStatus(422);
        $admin->putJson('/api/admin/bees', ['engagement' => ['daily_cap' => 5000]])->assertStatus(422);
        $admin->putJson('/api/admin/bees', ['engagement' => ['min_length' => 0]])->assertStatus(422);

        $this->assertSame(ProductEngagement::DEFAULTS, ProductEngagement::settings());
    }

    #[Test]
    public function a_rate_of_zero_stops_paying_without_stopping_anyone_speaking(): void
    {
        $c = $this->shopper();
        $this->product();
        ProductEngagement::setConfig(['like' => 0]);

        $res = $this->as($c)->postJson('/api/account/products/dress/like')->assertOk();
        $this->assertSame(0, $res->json('bees'));
        $this->assertTrue($res->json('summary.mine.liked'));
        $this->assertSame(0, $this->bees('cust_1'));
        // Nothing was promised, so raising the rate later still pays the first time.
        $this->assertSame(0, DB::table('product_engagement_rewards')->count());
    }

    // ─── What everyone sees ────────────────────────────────────────────────

    #[Test]
    public function reading_is_public_acting_is_not(): void
    {
        $c = $this->shopper();
        $this->product();
        $this->as($c)->postJson('/api/account/products/dress/rating', ['stars' => 4])->assertOk();

        Auth::forgetGuards();
        $res = $this->getJson('/api/store/products/dress/engagement')->assertOk();
        $this->assertEquals([4, 1], [$res->json('summary.average'), $res->json('summary.rating_count')]);
        $this->assertNull($res->json('summary.mine.stars'));          // a stranger has no "mine"
        $this->assertNull($res->json('remaining_today'));

        $this->postJson('/api/account/products/dress/rating', ['stars' => 5])->assertUnauthorized();
        $this->postJson('/api/account/products/dress/like')->assertUnauthorized();
    }

    #[Test]
    public function a_review_never_carries_who_wrote_it_beyond_a_first_name(): void
    {
        $author = $this->shopper();
        $other  = $this->shopper('cust_2', 'tendai@example.test');
        $this->product();
        $this->as($author)->postJson('/api/account/products/dress/comments', ['body' => 'The velvet is heavier than it looks.'])->assertOk();

        $mine = $this->as($author)->getJson('/api/store/products/dress/engagement')->json('comments.0');
        $this->assertSame(['Rudo M.', true], [$mine['author'], $mine['mine']]);

        $theirs = $this->as($other)->getJson('/api/store/products/dress/engagement')->json('comments.0');
        $this->assertFalse($theirs['mine']);                           // no delete button for someone else's words
        $this->assertArrayNotHasKey('customer_id', $theirs);           // and no id to go looking with
        $this->assertArrayNotHasKey('email', $theirs);
    }

    #[Test]
    public function bought_it_is_worked_out_from_paid_orders_not_claimed(): void
    {
        $buyer = $this->shopper();
        $this->product();

        DB::table('orders')->insert(['id' => 'order_1', 'order_number' => 'BL-1', 'customer_id' => 'cust_1', 'email' => 'rudo@example.test',
            'payment_status' => 'paid', 'status' => 'pending', 'subtotal' => 9000, 'total' => 9000, 'currency_code' => 'usd', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('order_line_items')->insert(['id' => 'oli_1', 'order_id' => 'order_1', 'product_id' => 'prod_1',
            'variant_id' => 'var_1', 'title' => 'Silk Gown', 'quantity' => 1, 'unit_price' => 9000]);

        $this->as($buyer)->postJson('/api/account/products/dress/comments', ['body' => 'Arrived in four days, exactly as pictured.'])->assertOk();
        $this->assertTrue($this->getJson('/api/store/products/dress/engagement')->json('comments.0.verified'));
    }

    #[Test]
    public function staff_can_take_a_review_down_and_it_stops_counting(): void
    {
        $c = $this->shopper();
        $this->product();
        $this->as($c)->postJson('/api/account/products/dress/comments', ['body' => 'Something that broke the rules.'])->assertOk();
        $id = DB::table('product_comments')->value('id');

        ProductEngagement::setHidden($id, true);

        Auth::forgetGuards();
        $res = $this->getJson('/api/store/products/dress/engagement')->assertOk();
        $this->assertSame([], $res->json('comments'));
        $this->assertSame(0, $res->json('summary.comments_count'));
        $this->assertSame(1, DB::table('product_comments')->count());   // kept, in case it was wrong

        ProductEngagement::setHidden($id, false);
        $this->assertSame(1, $this->getJson('/api/store/products/dress/engagement')->json('summary.comments_count'));
    }

    #[Test]
    public function a_card_carries_only_the_proof_a_piece_has_actually_earned(): void
    {
        $c = $this->shopper();
        $this->product();
        DB::table('product_variants')->insert(['id' => 'var_1', 'product_id' => 'prod_1', 'title' => 'M', 'manage_inventory' => false, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('variant_prices')->insert(['id' => 'vp_1', 'variant_id' => 'var_1', 'currency_code' => 'usd', 'amount' => 9000, 'created_at' => now()]);

        // A piece nobody has touched says nothing at all.
        $card = fn () => collect($this->getJson('/api/store/products')->json('products'))->firstWhere('handle', 'dress');
        $this->assertSame([null, 0, 0], [$card()['rating'], $card()['likes'], $card()['purchases']]);

        $this->as($c)->postJson('/api/account/products/dress/rating', ['stars' => 4])->assertOk();
        $this->as($c)->postJson('/api/account/products/dress/like')->assertOk();

        Auth::forgetGuards();
        $this->assertSame(['4.0', 1, 1, 0], [$card()['rating']['average_label'], $card()['rating']['count'], $card()['likes'], $card()['purchases']]);
    }

    #[Test]
    public function bought_is_moved_by_real_money_and_taken_back_by_a_refund(): void
    {
        $this->product();
        DB::table('orders')->insert(['id' => 'order_1', 'order_number' => 'BL-1', 'email' => 'a@b.test',
            'payment_status' => 'paid', 'status' => 'pending', 'subtotal' => 18000, 'total' => 18000, 'currency_code' => 'usd', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('order_line_items')->insert(['id' => 'oli_1', 'order_id' => 'order_1', 'product_id' => 'prod_1',
            'variant_id' => 'var_1', 'title' => 'Silk Gown', 'quantity' => 2, 'unit_price' => 9000]);
        DB::table('products')->where('id', 'prod_1')->update(['purchases_count' => 2]);

        \App\Services\OrderRefunds::refund(\App\Models\Order::find('order_1'), 'Changed her mind');

        $this->assertSame(0, (int) DB::table('products')->where('id', 'prod_1')->value('purchases_count'));
    }

    // ─── Trending ──────────────────────────────────────────────────────────

    #[Test]
    public function trending_counts_recent_reaction_and_weighs_words_double(): void
    {
        $a = $this->shopper('cust_1', 'a@test.test');
        $b = $this->shopper('cust_2', 'b@test.test');
        $this->product('prod_hearts', 'hearted');
        $this->product('prod_talked', 'talked-about');
        $this->product('prod_quiet', 'quiet');

        // Two hearts here…
        $this->as($a)->postJson('/api/account/products/hearted/like')->assertOk();
        $this->as($b)->postJson('/api/account/products/hearted/like')->assertOk();
        // …one review there. A review is worth two hearts, so it wins on one.
        $this->as($a)->postJson('/api/account/products/talked-about/comments', ['body' => 'Worth every cent, the fit is perfect.'])->assertOk();
        $this->as($b)->postJson('/api/account/products/talked-about/comments', ['body' => 'Second review saying much the same.'])->assertOk();

        $this->assertSame(['prod_talked', 'prod_hearts'], ProductEngagement::trendingIds());

        // Old reaction stops counting.
        DB::table('product_comments')->update(['created_at' => now()->subDays(40)]);
        $this->assertSame(['prod_hearts'], ProductEngagement::trendingIds());

        Auth::forgetGuards();
        $this->getJson('/api/store/products/trending')->assertOk()->assertJsonPath('products.0.handle', 'hearted');
    }

    #[Test]
    public function the_verdict_is_kept_on_the_product_so_a_grid_never_adds_it_up(): void
    {
        $a = $this->shopper('cust_1', 'a@test.test');
        $b = $this->shopper('cust_2', 'b@test.test');
        $this->product();

        $this->as($a)->postJson('/api/account/products/dress/rating', ['stars' => 5])->assertOk();
        $this->as($b)->postJson('/api/account/products/dress/rating', ['stars' => 4])->assertOk();

        $row = DB::table('products')->where('id', 'prod_1')->first();
        $this->assertSame([2, 9], [(int) $row->rating_count, (int) $row->rating_sum]);
        $this->assertSame(4.5, $this->getJson('/api/store/products/dress/engagement')->json('summary.average'));

        // One person, one voice — the second rating replaced the first.
        $this->as($a)->postJson('/api/account/products/dress/rating', ['stars' => 1])->assertOk();
        $this->assertSame(2, (int) DB::table('product_ratings')->count());
        $this->assertSame(2.5, $this->getJson('/api/store/products/dress/engagement')->json('summary.average'));
    }
}
