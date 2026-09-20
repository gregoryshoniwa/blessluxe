<?php

namespace Tests\Feature;

use App\Models\Affiliate;
use App\Models\Customer;
use App\Models\Scopes\ExclusivityScope;
use App\Models\User;
use App\Services\Exclusivity;
use App\Services\MessageRefs;
use App\Services\Messages;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * "@" product references, and attachments from both sides.
 *
 * The line these tests hold: what the OTHER person sees on a product card was
 * written by the catalogue, never by the sender's browser. A card is rendered
 * with the brand's authority — "BLESSLUXE says this dress is $45" — so a client
 * that could choose that text could put any price in front of a customer.
 */
class MessageMentionsTest extends TestCase
{
    use RefreshDatabase;

    private function affiliate(string $n): Affiliate
    {
        DB::table('customers')->insert([
            'id' => "cust_$n", 'email' => "$n@example.com", 'password' => bcrypt('x'),
            'first_name' => $n, 'last_name' => 'T', 'created_at' => now(), 'updated_at' => now(),
        ]);

        return Affiliate::create([
            'id' => "aff_$n", 'customer_id' => "cust_$n", 'code' => strtoupper($n), 'email' => "$n@example.com",
            'first_name' => $n, 'commission_rate' => 10, 'status' => 'active',
        ]);
    }

    private function product(string $id, string $title, int $cents = 4500, array $attrs = []): void
    {
        DB::table('products')->insert(array_merge([
            'id' => $id, 'title' => $title, 'handle' => str_replace('_', '-', $id), 'status' => 'published',
            'thumbnail' => "/img/$id.jpg", 'created_at' => now(), 'updated_at' => now(),
        ], $attrs));
        DB::table('product_variants')->insert([
            'id' => "var_$id", 'product_id' => $id, 'title' => 'One size',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('variant_prices')->insert([
            'id' => "price_$id", 'variant_id' => "var_$id", 'currency_code' => 'usd',
            'amount' => $cents, 'created_at' => now(),
        ]);
    }

    private function inHeading(string $productId, string $heading): void
    {
        if (! DB::table('headings')->where('id', "head_$heading")->exists()) {
            DB::table('headings')->insert([
                'id' => "head_$heading", 'name' => ucfirst($heading), 'handle' => $heading,
                'rank' => DB::table('headings')->count() + 1, 'is_active' => true, 'is_sale' => false,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('catalogues')->insert([
                'id' => "cat_$heading", 'heading_id' => "head_$heading", 'name' => ucfirst($heading), 'handle' => "c-$heading",
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }
        DB::table('product_catalogue_map')->insert(['product_id' => $productId, 'catalogue_id' => "cat_$heading"]);
    }

    private function asAffiliate(string $n): static
    {
        return $this->actingAs(Customer::find("cust_$n"), 'customer');
    }

    // ─── What a card says ──────────────────────────────────────────────────

    #[Test]
    public function the_card_is_written_by_the_catalogue_not_by_the_sender(): void
    {
        $this->affiliate('jane');
        $this->product('prod_dress', 'Silk Dress', 27900);

        $res = $this->asAffiliate('jane')->postJson('/api/account/affiliate/messages', [
            'body' => 'is this coming back?',
            // Everything but type+id is an attempt to forge the card.
            'refs' => [['type' => 'product', 'id' => 'prod_dress', 'title' => 'FREE TODAY', 'price_label' => '$0.01', 'thumbnail' => 'https://evil.test/x.png']],
        ])->assertOk()->json('message');

        $this->assertSame([[
            'type' => 'product', 'id' => 'prod_dress', 'handle' => 'prod-dress',
            'title' => 'Silk Dress', 'thumbnail' => '/img/prod_dress.jpg', 'price_label' => '$279.00',
        ]], $res['refs']);
    }

    #[Test]
    public function a_product_alone_is_a_complete_message(): void
    {
        $jane = $this->affiliate('jane');
        $this->product('prod_tote', 'Leather Tote');

        $this->asAffiliate('jane')
            ->postJson('/api/account/affiliate/messages', ['refs' => [['type' => 'product', 'id' => 'prod_tote']]])
            ->assertOk();

        // …and the inbox row says what it was, rather than showing a blank line.
        $this->assertSame('🏷 Leather Tote', Messages::adminInbox()['threads'][0]['preview']);
        $this->assertSame('', DB::table('affiliate_messages')->where('affiliate_id', $jane->id)->value('body'));
    }

    #[Test]
    public function a_message_with_nothing_in_it_is_refused(): void
    {
        $this->affiliate('jane');

        $this->asAffiliate('jane')->postJson('/api/account/affiliate/messages', ['body' => '   '])->assertStatus(422);

        // The only thing sent was a reference that doesn't resolve — once it is
        // dropped there is nothing left, and an empty bubble must not be saved.
        $this->asAffiliate('jane')
            ->postJson('/api/account/affiliate/messages', ['refs' => [['type' => 'product', 'id' => 'prod_nope']]])
            ->assertStatus(422);

        $this->assertSame(0, DB::table('affiliate_messages')->count());
    }

    #[Test]
    public function unpublished_products_cannot_be_referenced_or_found(): void
    {
        $jane = $this->affiliate('jane');
        $this->product('prod_draft', 'Secret Drop', 9900, ['status' => 'draft']);

        $this->assertSame([], MessageRefs::resolve([['type' => 'product', 'id' => 'prod_draft']], $jane, false));
        $this->assertSame([], MessageRefs::search($jane, false, 'all', 'Secret')['items']);
    }

    // ─── Exclusivity ───────────────────────────────────────────────────────

    #[Test]
    public function an_affiliate_sees_their_own_exclusive_but_never_someone_elses(): void
    {
        $jane = $this->affiliate('jane');
        $sarah = $this->affiliate('sarah');
        $this->product('prod_excl', 'Exclusive Gown', 50000, ['exclusivity_enabled' => true, 'exclusivity_fee' => 5000]);
        $this->product('prod_open', 'Open Blouse');
        Exclusivity::activate(Exclusivity::beginPurchase('prod_excl', $jane)['id']);
        ExclusivityScope::flush();

        $titles = fn ($viewer, $admin) => array_column(MessageRefs::search($viewer, $admin)['items'], 'title');

        // The holder must be able to talk to us about the piece they paid for.
        $this->assertEqualsCanonicalizing(['Exclusive Gown', 'Open Blouse'], $titles($jane, false));
        // Anyone else must not learn it exists — by browsing, or by guessing its id.
        $this->assertSame(['Open Blouse'], $titles($sarah, false));
        $this->assertSame([], MessageRefs::resolve([['type' => 'product', 'id' => 'prod_excl']], $sarah, false));
        // Staff see the whole catalogue.
        $this->assertEqualsCanonicalizing(['Exclusive Gown', 'Open Blouse'], $titles(null, true));
    }

    // ─── The picker ────────────────────────────────────────────────────────

    #[Test]
    public function tabs_follow_the_shops_headings_and_filter_by_them(): void
    {
        $jane = $this->affiliate('jane');
        $this->product('prod_w', 'Wrap Dress');
        $this->product('prod_m', 'Oxford Shirt');
        $this->inHeading('prod_w', 'women');
        $this->inHeading('prod_m', 'men');

        $all = MessageRefs::search($jane, false);

        $this->assertSame(['All', 'Packs', 'Women', 'Men'], array_column($all['tabs'], 'label'));
        $this->assertCount(2, $all['items']);
        $this->assertSame(['Wrap Dress'], array_column(MessageRefs::search($jane, false, 'women')['items'], 'title'));
        $this->assertSame(['Oxford Shirt'], array_column(MessageRefs::search($jane, false, 'all', 'oxford')['items'], 'title'));
        // A wildcard is a character here, not a pattern.
        $this->assertSame([], MessageRefs::search($jane, false, 'all', '%')['items']);
    }

    #[Test]
    public function results_are_paged(): void
    {
        $jane = $this->affiliate('jane');
        foreach (range(1, 30) as $i) $this->product("prod_$i", "Piece $i");

        $one = MessageRefs::search($jane, false);
        $two = MessageRefs::search($jane, false, 'all', null, 2);

        $this->assertCount(24, $one['items']);
        $this->assertTrue($one['has_more']);
        $this->assertCount(6, $two['items']);
        $this->assertFalse($two['has_more']);
    }

    #[Test]
    public function a_message_carries_at_most_six_references_and_no_duplicates(): void
    {
        $jane = $this->affiliate('jane');
        foreach (range(1, 8) as $i) $this->product("prod_$i", "Piece $i");

        $picked = array_map(fn ($i) => ['type' => 'product', 'id' => "prod_$i"], [1, 1, 2, 3, 4, 5, 6, 7, 8]);

        $refs = MessageRefs::resolve($picked, $jane, false);

        $this->assertLessThanOrEqual(MessageRefs::MAX_PER_MESSAGE, count($refs));
        $this->assertSame(count($refs), count(array_unique(array_column($refs, 'id'))));
    }

    #[Test]
    public function the_picker_is_not_public(): void
    {
        $this->getJson('/api/account/affiliate/mentions')->assertStatus(404);   // "not an affiliate"
        $this->getJson('/api/admin/affiliate-inbox/mentions')->assertUnauthorized();
    }

    // ─── Attachments ───────────────────────────────────────────────────────

    #[Test]
    public function staff_can_send_photos_and_products_too(): void
    {
        $jane = $this->affiliate('jane');
        $this->product('prod_dress', 'Silk Dress', 27900);

        $res = $this->actingAs(User::factory()->create(), 'web')
            ->post("/api/admin/affiliates/{$jane->id}/messages", [
                'body'   => 'Back in stock Friday',
                'refs'   => json_encode([['type' => 'product', 'id' => 'prod_dress']]),   // multipart form
                'images' => [UploadedFile::fake()->image('swatch.png')],
            ], ['Accept' => 'application/json'])
            ->assertOk()
            ->json('message');

        $this->assertSame('Silk Dress', $res['refs'][0]['title']);
        $this->assertCount(1, $res['attachments']);
        @unlink(storage_path('app/public/' . \App\Services\Media::key($res['attachments'][0])));
    }

    #[Test]
    public function an_uploaded_file_is_named_for_what_it_is_not_what_it_claims(): void
    {
        $jane = $this->affiliate('jane');

        // A real image whose NAME ends in .php. Saved under its claimed
        // extension into a web-served folder, that is a file the server may run.
        $res = $this->asAffiliate('jane')
            ->post('/api/account/affiliate/messages', [
                'body' => 'look', 'images' => [UploadedFile::fake()->image('holiday.php')],
            ], ['Accept' => 'application/json']);

        if ($res->status() === 200) {
            $path = $res->json('message.attachments.0');
            $this->assertStringEndsNotWith('.php', $path);
            @unlink(storage_path('app/public/' . \App\Services\Media::key($path)));
        } else {
            // Rejecting it outright is just as good.
            $res->assertStatus(422);
        }
        $this->assertEmpty(glob(storage_path('app/public/uploads/affiliate-messages/*.php')));
    }
}
