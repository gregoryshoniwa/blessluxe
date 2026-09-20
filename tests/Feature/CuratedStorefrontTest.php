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
}
