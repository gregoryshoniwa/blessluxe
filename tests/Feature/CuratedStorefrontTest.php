<?php

namespace Tests\Feature;

use App\Models\Affiliate;
use App\Models\Scopes\ExclusivityScope;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * A curated affiliate storefront shows only that affiliate's line.
 *
 * These tests exist because the filter was written correctly and still did
 * nothing: /api/store/products ran with the `api` middleware only, so it had no
 * SESSION, the viewing affiliate could never be resolved, and every curated shop
 * silently showed the whole catalogue. Unit-testing the service would not have
 * caught it — only going through the HTTP route does.
 */
class CuratedStorefrontTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        ExclusivityScope::flush();
    }

    private function seedCatalogue(): Affiliate
    {
        foreach (['a', 'b', 'c'] as $k) {
            DB::table('products')->insert([
                'id' => "prod_{$k}", 'title' => "Piece {$k}", 'handle' => "piece-{$k}",
                'status' => 'published', 'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('product_variants')->insert([
                'id' => "var_{$k}", 'product_id' => "prod_{$k}", 'title' => 'One Size',
                'manage_inventory' => false, 'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('variant_prices')->insert([
                'id' => "vp_{$k}", 'variant_id' => "var_{$k}",
                'currency_code' => 'usd', 'amount' => 10000, 'created_at' => now(),
            ]);
        }

        return Affiliate::create([
            'id' => 'aff_1', 'code' => 'JANE', 'email' => 'j@x.test',
            'first_name' => 'Jane', 'commission_rate' => 10, 'status' => 'active',
        ]);
    }

    /** @return array<int,string> product ids the shop endpoint returns */
    private function shopIds(): array
    {
        return array_column($this->getJson('/api/store/products')->json('products'), 'id');
    }

    #[Test]
    public function the_products_endpoint_can_see_the_session(): void
    {
        // The root cause: without `web` on this route there is no session, so
        // affiliate attribution is invisible to the catalogue.
        $route = collect(app('router')->getRoutes()->getRoutes())
            ->first(fn ($r) => $r->uri() === 'api/store/products' && in_array('GET', $r->methods()));

        $this->assertContains('web', $route->gatherMiddleware(), '/api/store/products must have session access.');
    }

    #[Test]
    public function an_affiliate_in_all_mode_shows_the_whole_shop(): void
    {
        $this->seedCatalogue();
        $this->postJson('/api/store/affiliate/resolve', ['code' => 'JANE'])->assertOk();

        $this->assertCount(3, $this->shopIds());
    }

    #[Test]
    public function a_curated_affiliate_shows_only_their_line(): void
    {
        $aff = $this->seedCatalogue();
        $aff->update(['storefront_mode' => 'curated']);
        DB::table('affiliate_products')->insert([
            'id' => 'afp_1', 'affiliate_id' => $aff->id, 'product_id' => 'prod_b',
            'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->postJson('/api/store/affiliate/resolve', ['code' => 'JANE'])->assertOk();

        $this->assertSame(['prod_b'], $this->shopIds());
    }

    #[Test]
    public function a_curated_affiliate_with_nothing_picked_shows_nothing(): void
    {
        $aff = $this->seedCatalogue();
        $aff->update(['storefront_mode' => 'curated']);

        $this->postJson('/api/store/affiliate/resolve', ['code' => 'JANE'])->assertOk();

        // The exact bug reported: "0 pieces you chose" while the shop showed 7.
        $this->assertSame([], $this->shopIds());
    }

    #[Test]
    public function a_plain_visitor_still_sees_the_whole_shop(): void
    {
        $this->seedCatalogue();

        // No affiliate in session — curation must not leak to the main store.
        $this->assertCount(3, $this->shopIds());
    }

    #[Test]
    public function clearing_attribution_restores_the_whole_shop(): void
    {
        $aff = $this->seedCatalogue();
        $aff->update(['storefront_mode' => 'curated']);

        $this->postJson('/api/store/affiliate/resolve', ['code' => 'JANE'])->assertOk();
        $this->assertSame([], $this->shopIds());

        $this->postJson('/api/store/affiliate/clear')->assertOk();
        $this->assertCount(3, $this->shopIds());
    }

    #[Test]
    public function related_and_batch_respect_the_curated_line_too(): void
    {
        $aff = $this->seedCatalogue();
        $aff->update(['storefront_mode' => 'curated']);
        DB::table('affiliate_products')->insert([
            'id' => 'afp_1', 'affiliate_id' => $aff->id, 'product_id' => 'prod_b',
            'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->postJson('/api/store/affiliate/resolve', ['code' => 'JANE'])->assertOk();

        // A wishlist lookup must not surface pieces this shop doesn't carry.
        $batch = $this->postJson('/api/store/products/batch', ['ids' => ['prod_a', 'prod_b', 'prod_c']]);
        $this->assertSame(['prod_b'], array_column($batch->json('products'), 'id'));

        // Nor should recommendations.
        $related = $this->getJson('/api/store/products/piece-b/related');
        $this->assertSame([], array_column($related->json('products'), 'id'));
    }

    #[Test]
    public function the_holder_of_an_exclusive_still_sees_it_on_their_own_shop(): void
    {
        $aff = $this->seedCatalogue();
        DB::table('products')->where('id', 'prod_a')->update([
            'exclusivity_enabled' => true, 'exclusivity_fee' => 5000,
        ]);

        $excl = \App\Services\Exclusivity::beginPurchase('prod_a', $aff);
        \App\Services\Exclusivity::activate($excl['id']);
        ExclusivityScope::flush();

        // Hidden from the main shop...
        $this->assertNotContains('prod_a', $this->shopIds());

        // ...but the affiliate who paid for it must still be able to sell it,
        // which also needs the session to resolve them.
        ExclusivityScope::flush();
        $this->postJson('/api/store/affiliate/resolve', ['code' => 'JANE'])->assertOk();
        ExclusivityScope::flush();
        $this->assertContains('prod_a', $this->shopIds());
    }

    // ─── A curated shop is curated EVERYWHERE, not just in the product grid ─

    /** prod_a → Women/Dresses, prod_b → Men/Shirts, plus one open pack. */
    private function seedShopFurniture(): void
    {
        foreach ([['women', 'Women', 'dresses', 'prod_a', 1], ['men', 'Men', 'shirts', 'prod_b', 2]] as [$h, $name, $c, $product, $rank]) {
            DB::table('headings')->insert([
                'id' => "head_$h", 'name' => $name, 'handle' => $h, 'rank' => $rank,
                'is_active' => true, 'is_sale' => false, 'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('catalogues')->insert([
                'id' => "cat_$c", 'heading_id' => "head_$h", 'name' => ucfirst($c), 'handle' => $c,
                'is_active' => true, 'rank' => 1, 'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('product_catalogue_map')->insert(['product_id' => $product, 'catalogue_id' => "cat_$c"]);
        }

        DB::table('pack_definitions')->insert([
            'id' => 'pdef_1', 'title' => 'Summer drop', 'handle' => 'summer-drop',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('pack_campaigns')->insert([
            'id' => 'pcam_1', 'pack_definition_id' => 'pdef_1', 'host_kind' => 'admin',
            'public_code' => 'PACK1', 'status' => 'open', 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function curate(Affiliate $aff, array $productIds): void
    {
        $aff->update(['storefront_mode' => 'curated']);
        foreach ($productIds as $i => $id) {
            DB::table('affiliate_products')->insert([
                'id' => "afp_x$i", 'affiliate_id' => $aff->id, 'product_id' => $id,
                'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }
    }

    #[Test]
    public function a_curated_shop_lists_no_packs(): void
    {
        $aff = $this->seedCatalogue();
        $this->seedShopFurniture();

        // The full shop has the pack…
        $this->assertCount(1, $this->getJson('/api/store/packs')->json('packs'));

        // …an affiliate's hand-picked shop does not: nobody picked it.
        $this->curate($aff, ['prod_a']);
        $this->postJson('/api/store/affiliate/resolve', ['code' => 'JANE'])->assertOk();

        $res = $this->getJson('/api/store/packs')->assertOk();
        $this->assertSame([], $res->json('packs'));
        // …and the page is told WHY, so it doesn't claim no packs exist anywhere.
        $this->assertTrue($res->json('hidden_by_storefront'));
    }

    #[Test]
    public function an_affiliate_mirroring_the_whole_shop_still_lists_packs(): void
    {
        $this->seedCatalogue();
        $this->seedShopFurniture();

        $this->postJson('/api/store/affiliate/resolve', ['code' => 'JANE'])->assertOk();

        $this->assertCount(1, $this->getJson('/api/store/packs')->json('packs'));
    }

    #[Test]
    public function the_menu_only_offers_categories_the_curated_shop_has_something_in(): void
    {
        $aff = $this->seedCatalogue();
        $this->seedShopFurniture();

        $handles = fn () => array_column($this->getJson('/api/store/headings')->json('headings'), 'handle');
        $this->assertSame(['women', 'men'], $handles());

        // Jane sells one dress. "Men" would be a tile that opens an empty page.
        $this->curate($aff, ['prod_a']);
        $this->postJson('/api/store/affiliate/resolve', ['code' => 'JANE'])->assertOk();

        $this->assertSame(['women'], $handles());

        // Leaving her shop widens the menu again.
        $this->postJson('/api/store/affiliate/clear')->assertOk();
        $this->assertSame(['women', 'men'], $handles());
    }

    #[Test]
    public function an_empty_curated_shop_has_an_empty_menu_rather_than_dead_links(): void
    {
        $aff = $this->seedCatalogue();
        $this->seedShopFurniture();
        $this->curate($aff, []);

        $this->postJson('/api/store/affiliate/resolve', ['code' => 'JANE'])->assertOk();

        $this->assertSame([], $this->getJson('/api/store/headings')->json('headings'));
    }

    #[Test]
    public function the_storefront_is_told_it_is_in_a_curated_shop_and_how_full_it_is(): void
    {
        $aff = $this->seedCatalogue();

        // Whole-shop mode: not curated, and "how many" is meaningless.
        $resolved = $this->postJson('/api/store/affiliate/resolve', ['code' => 'JANE'])->json('affiliate');
        $this->assertFalse($resolved['curated']);
        $this->assertNull($resolved['product_count']);

        // Curated but empty — what the home page needs to say "still choosing"
        // instead of showing shoppers a developer's note about seeding.
        $this->curate($aff, []);
        $active = $this->getJson('/api/store/affiliate/active')->json('affiliate');
        $this->assertTrue($active['curated']);
        $this->assertSame(0, $active['product_count']);

        DB::table('affiliate_products')->insert([
            'id' => 'afp_late', 'affiliate_id' => $aff->id, 'product_id' => 'prod_c',
            'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->assertSame(1, $this->getJson('/api/store/affiliate/active')->json('affiliate.product_count'));
    }

    #[Test]
    public function the_luxe_assistant_only_suggests_what_the_curated_shop_sells(): void
    {
        $aff = $this->seedCatalogue();
        $this->curate($aff, ['prod_b']);

        // The assistant runs inside a storefront request, so give it one that is
        // shopping via Jane — the same session state the widget has.
        $request = \Illuminate\Http\Request::create('/api/store/agent', 'POST');
        $request->setLaravelSession($this->app['session']->driver());
        $request->session()->put('affiliate_code', 'JANE');
        $this->app->instance('request', $request);

        $found = fn () => collect(json_decode(json_encode(
            (new \App\Services\AI\Tools\SearchProductsTool)->execute(['query' => 'Piece', 'limit' => 12], new \App\Services\AI\AgentContext('sess_test'))
        ), true))->flatten()->filter(fn ($v) => is_string($v) && str_starts_with($v, 'prod_'))->values()->all();

        // An assistant recommending a dress this shop doesn't carry is the same
        // leak as the Packs tile — just spoken instead of drawn.
        $this->assertSame(['prod_b'], $found());

        // Outside her shop it searches everything again.
        $request->session()->forget('affiliate_code');
        $this->assertEqualsCanonicalizing(['prod_a', 'prod_b', 'prod_c'], $found());
    }
}
