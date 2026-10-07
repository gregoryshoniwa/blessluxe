<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\QuickSeries;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/** Admin → Quick process → Series: one form from a supplier's post to a live series. */
class QuickSeriesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        config(['filesystems.default' => 'local']);
        DB::table('headings')->insert(['id' => 'head_m', 'name' => 'Men', 'handle' => 'men', 'rank' => 2, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('catalogues')->insert(['id' => 'cat_suits', 'heading_id' => 'head_m', 'name' => 'Suits', 'handle' => 'suits', 'created_at' => now(), 'updated_at' => now()]);
        $this->actingAs(User::factory()->create(), 'web');
    }

    private function publish(array $over = [])
    {
        return $this->post('/api/admin/quick/series', array_merge([
            'title' => 'Three-Piece Check Suit', 'description' => 'Super 200 wool.',
            'cost' => '60', 'margin' => '40', 'single_price' => '85',
            'supplier' => json_encode(['name' => 'Mario casas mens wear', 'phone' => '+90 555 000 0000']),
            'origin' => 'TR', 'open_days' => '14', 'publish' => '1',
            'size_runs' => json_encode([['48', '46', '50'], ['50', '52', '54']]),
            'catalogue_ids' => json_encode(['cat_suits']),
            'images' => [UploadedFile::fake()->image('a.jpg', 600, 800), UploadedFile::fake()->image('b.jpg', 600, 800)],
        ], $over), ['Accept' => 'application/json']);
    }

    #[Test]
    public function a_post_becomes_a_product_and_one_open_series_per_size_run(): void
    {
        $r = $this->publish()->assertOk()->json();
        $this->assertCount(2, $r['codes']);
        $this->assertSame(8400, $r['price']);                                  // $60 + 40% = $84

        $p = DB::table('products')->where('id', $r['product_id'])->first();
        $this->assertSame(['import', 'published', 'TR'], [$p->sourcing, $p->status, $p->origin_country]);
        $this->assertSame(85, json_decode($p->metadata, true)['supplier_single_price']);
        $this->assertSame(2, DB::table('product_images')->where('product_id', $p->id)->count());
        $this->assertTrue(DB::table('product_catalogue_map')->where(['product_id' => $p->id, 'catalogue_id' => 'cat_suits'])->exists());

        // One variant per distinct size, in size order, no stock tracked, cost and price set.
        $v = DB::table('product_variants')->where('product_id', $p->id)->get();
        $this->assertEqualsCanonicalizing(['46', '48', '50', '52', '54'], $v->pluck('title')->all());
        $this->assertSame([0], $v->pluck('manage_inventory')->unique()->values()->all());
        $this->assertSame([6000], $v->pluck('cost_price')->unique()->values()->all());

        // Each run is its own open series, with a deadline; "50" sits in both.
        $camps = DB::table('pack_campaigns')->whereIn('public_code', $r['codes'])->get();
        $this->assertSame(['open'], $camps->pluck('status')->unique()->values()->all());
        $this->assertNotNull($camps[0]->expires_at);
        $this->assertSame(6, DB::table('pack_slots')->whereIn('pack_campaign_id', $camps->pluck('id'))->count());

        // The admin table shows both, with cost, price and fill; search finds them by supplier.
        $rows = $this->getJson('/api/admin/quick/series?q=mario')->assertOk()->json('rows');
        $this->assertCount(2, $rows);
        $this->assertSame([6000, 8400, 0, 3], [$rows[0]['cost'], $rows[0]['price'], $rows[0]['paid'], $rows[0]['slots']]);
        $this->assertSame(0, $this->getJson('/api/admin/quick/series?status=cancelled')->json('total'));

        // The series is on the public listing.
        $this->getJson('/api/store/series/' . $r['codes'][0])->assertOk();

        // The supplier is kept once and found again by name; the margin is remembered.
        $this->publish(['title' => 'Double-Breasted Suit', 'supplier' => json_encode(['name' => 'MARIO CASAS MENS WEAR'])])->assertOk();
        $this->assertSame(1, DB::table('suppliers')->count());
        $this->assertSame('+90 555 000 0000', DB::table('suppliers')->value('phone'));
        $this->assertSame(40, QuickSeries::settings()['margin']);
    }

    #[Test]
    public function a_draft_opens_no_series_and_publishing_needs_a_photo_and_two_sizes(): void
    {
        $this->publish(['images' => []])->assertStatus(422)->assertJsonValidationErrors('images');
        $this->publish(['size_runs' => json_encode([['M']])])->assertStatus(422);

        $r = $this->publish(['publish' => '0', 'images' => []])->assertOk()->json();
        $this->assertSame([], $r['codes']);
        $this->assertSame('draft', DB::table('products')->where('id', $r['product_id'])->value('status'));
        $this->assertSame(0, DB::table('pack_campaigns')->count());
    }

    #[Test]
    public function the_reader_turns_the_ai_answer_into_a_checked_draft_and_saves_nothing(): void
    {
        config(['services.google_ai.key' => 'test']);
        putenv('GOOGLE_AI_API_KEY=test');
        Http::fake(['*' => Http::response(['candidates' => [['content' => ['parts' => [['text' => json_encode([
            'title' => 'Sheer Cape Dress', 'description' => 'Flowing.', 'cost' => 36, 'single_price' => null, 'currency' => 'USD',
            'supplier_name' => 'Volonte Rose', 'supplier_phone' => '+90 536 239 00 91', 'origin' => 'TR',
            'size_runs' => [['44', '38', '40', '42'], ['44', '46', '48', '50'], ['XL']], 'catalogue_id' => 'not-a-real-id',
            'reference' => null, 'colours' => [], 'confidence_note' => null,
        ])]]]]]])]);

        $d = $this->post('/api/admin/quick/series/read', ['shots' => [UploadedFile::fake()->image('post.png')]], ['Accept' => 'application/json'])
            ->assertOk()->json('draft');

        $this->assertSame([['38', '40', '42', '44'], ['44', '46', '48', '50'], ['XL']], $d['size_runs']);   // sorted; a one-size run is shown, not dropped
        $this->assertSame([], $d['catalogue_ids']);                                                 // an id it made up is ignored
        $this->assertSame(['Volonte Rose', null], [$d['supplier']['name'], $d['supplier']['id']]);
        $this->assertSame(0, DB::table('products')->count());
    }
}
