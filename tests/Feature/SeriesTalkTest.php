<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\User;
use App\Services\SeriesTalk;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/** The conversation inside a series: who may speak, what a reader sees, what staff can take down. */
class SeriesTalkTest extends TestCase
{
    use RefreshDatabase;

    private function customer(string $id, string $first, string $last): Customer
    {
        DB::table('customers')->insert(['id' => $id, 'email' => "$id@test.test", 'password' => bcrypt('x'), 'first_name' => $first, 'last_name' => $last, 'created_at' => now(), 'updated_at' => now()]);

        return Customer::find($id);
    }

    private function series(string $status = 'open'): void
    {
        DB::table('products')->insert(['id' => 'prod_1', 'title' => 'Gown', 'handle' => 'gown', 'status' => 'published', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('product_variants')->insert(['id' => 'var_1', 'product_id' => 'prod_1', 'title' => 'M', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('pack_definitions')->insert(['id' => 'def_1', 'product_id' => 'prod_1', 'title' => 'Gown run', 'status' => 'published', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('pack_campaigns')->insert(['id' => 'camp_1', 'pack_definition_id' => 'def_1', 'public_code' => 'GOWN1', 'status' => $status, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('pack_slots')->insert(['id' => 'slot_M', 'pack_campaign_id' => 'camp_1', 'variant_id' => 'var_1', 'size_label' => 'M', 'status' => 'available', 'created_at' => now(), 'updated_at' => now()]);
    }

    private function as(Customer $c): static
    {
        Auth::forgetGuards();

        return $this->actingAs($c, 'customer');
    }

    #[Test]
    public function anyone_can_read_only_members_can_speak_and_buyers_wear_a_badge(): void
    {
        $rudo = $this->customer('cust_rudo', 'Rudo', 'Moyo');
        $tendai = $this->customer('cust_tendai', 'Tendai', 'Kaseke');
        $this->series();
        DB::table('pack_slots')->where('id', 'slot_M')->update(['status' => 'paid', 'customer_id' => 'cust_rudo']);

        // A stranger reads; a stranger may not speak.
        Auth::forgetGuards();
        $this->getJson('/api/store/series/GOWN1/talk')->assertOk()->assertJsonPath('starters.0', SeriesTalk::STARTERS[0]);
        $this->postJson('/api/account/series/GOWN1/talk', ['body' => 'hello'])->assertUnauthorized();

        $this->as($rudo)->postJson('/api/account/series/GOWN1/talk', ['body' => 'Fits true to size, go for your usual.'])->assertOk()
            ->assertJsonPath('post.author.name', 'Rudo M.')->assertJsonPath('post.author.in_series', true);
        $this->as($tendai)->postJson('/api/account/series/GOWN1/talk', ['body' => 'Thanks! Taking the S then.'])->assertOk()
            ->assertJsonPath('post.author.in_series', false);                   // asked, hasn't bought

        Auth::forgetGuards();
        $items = $this->getJson('/api/store/series/GOWN1/talk')->json('items');
        $posts = array_values(array_filter($items, fn ($i) => $i['kind'] === 'post'));
        $this->assertCount(2, $posts);
        $this->assertSame(['Rudo M.', 'Tendai K.'], array_column(array_column($posts, 'author'), 'name'));
        $this->assertFalse($posts[0]['author']['mine']);                        // nobody is "me" to a stranger

        // Taking a size shows up in the stream — as initials, never a name.
        $joins = array_values(array_filter($items, fn ($i) => $i['kind'] === 'joined'));
        $this->assertCount(1, $joins);
        $this->assertSame(['RM', 'took size M'], [$joins[0]['author']['initials'], $joins[0]['body']]);
        $this->assertNull($joins[0]['author']['name']);
    }

    #[Test]
    public function the_page_asks_only_for_what_is_new(): void
    {
        $rudo = $this->customer('cust_rudo', 'Rudo', 'Moyo');
        $this->series();
        $this->as($rudo)->postJson('/api/account/series/GOWN1/talk', ['body' => 'First.'])->assertOk();

        $first = $this->getJson('/api/store/series/GOWN1/talk')->assertOk();
        $this->assertCount(1, $first->json('items'));

        $this->travel(2)->minutes();
        $this->as($rudo)->postJson('/api/account/series/GOWN1/talk', ['body' => 'Second.'])->assertOk();

        $delta = $this->getJson('/api/store/series/GOWN1/talk?since=' . urlencode($first->json('now')))->assertOk()->json('items');
        $this->assertSame(['Second.'], array_column($delta, 'body'));
    }

    #[Test]
    public function the_series_filling_is_news_in_the_stream(): void
    {
        $this->series('filled');
        $items = $this->getJson('/api/store/series/GOWN1/talk')->json('items');
        $this->assertSame('filled', end($items)['kind']);
    }

    #[Test]
    public function empty_or_endless_messages_are_refused_and_a_cancelled_series_is_quiet(): void
    {
        $rudo = $this->customer('cust_rudo', 'Rudo', 'Moyo');
        $this->series();
        $this->as($rudo)->postJson('/api/account/series/GOWN1/talk', ['body' => '   '])->assertStatus(422);
        $this->as($rudo)->postJson('/api/account/series/GOWN1/talk', ['body' => str_repeat('x', 600)])->assertStatus(422);
        $this->assertSame(0, DB::table('pack_campaign_posts')->count());

        DB::table('pack_campaigns')->where('id', 'camp_1')->update(['status' => 'cancelled']);
        $this->as($rudo)->postJson('/api/account/series/GOWN1/talk', ['body' => 'Anyone there?'])->assertStatus(422);
    }

    #[Test]
    public function you_can_take_back_your_own_words_and_staff_can_hide_anyones(): void
    {
        $rudo = $this->customer('cust_rudo', 'Rudo', 'Moyo');
        $tendai = $this->customer('cust_tendai', 'Tendai', 'Kaseke');
        $this->series();
        $id = $this->as($rudo)->postJson('/api/account/series/GOWN1/talk', ['body' => 'Mine to delete.'])->json('post.id');
        $other = $this->as($rudo)->postJson('/api/account/series/GOWN1/talk', ['body' => 'Something that broke the rules.'])->json('post.id');

        $this->as($tendai)->deleteJson("/api/account/series-posts/$id")->assertStatus(404);   // not yours
        $this->as($rudo)->deleteJson("/api/account/series-posts/$id")->assertOk();

        Auth::forgetGuards();
        $this->actingAs(User::factory()->create(), 'web')->putJson("/api/admin/series-posts/$other", ['hidden' => true])->assertOk();
        Auth::forgetGuards();
        $this->assertSame([], array_filter($this->getJson('/api/store/series/GOWN1/talk')->json('items'), fn ($i) => $i['kind'] === 'post'));
        $this->assertSame(1, DB::table('pack_campaign_posts')->count());        // kept, in case it was wrong

        // Nothing here pays Bees.
        $this->assertSame(0, (int) DB::table('customers')->where('id', 'cust_rudo')->value('loyalty_points'));
    }
}
