<?php

namespace Tests\Feature;

use App\Models\Affiliate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * How affiliate attribution actually behaves.
 *
 * Attribution is stamped onto each CART LINE at the moment it is added, from
 * whatever code is in the session. That single design choice answers most
 * questions about this feature, so these tests pin it down rather than leaving
 * it to be rediscovered by reading controllers.
 */
class AffiliateAttributionTest extends TestCase
{
    use RefreshDatabase;

    private function seedShop(): void
    {
        DB::table('products')->insert([
            'id' => 'prod_x', 'title' => 'Dress', 'handle' => 'dress',
            'status' => 'published', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('product_variants')->insert([
            ['id' => 'var_a', 'product_id' => 'prod_x', 'title' => 'S', 'manage_inventory' => false, 'created_at' => now(), 'updated_at' => now()],
            ['id' => 'var_b', 'product_id' => 'prod_x', 'title' => 'M', 'manage_inventory' => false, 'created_at' => now(), 'updated_at' => now()],
        ]);

        foreach ([['aff_one', 'JANE10'], ['aff_two', 'SARAH10']] as [$id, $code]) {
            Affiliate::create([
                'id' => $id, 'code' => $code, 'email' => strtolower($code) . '@example.test',
                'first_name' => $code, 'commission_rate' => 10, 'status' => 'active',
            ]);
        }
    }

    /** @return array line metadata, keyed by variant */
    private function lineCodes(): array
    {
        return DB::table('cart_line_items')
            ->get(['variant_id', 'metadata'])
            ->mapWithKeys(fn ($l) => [
                $l->variant_id => json_decode((string) $l->metadata, true)['affiliate_code'] ?? null,
            ])->all();
    }

    #[Test]
    public function the_link_parks_a_code_in_the_session_and_tags_lines_added_after_it(): void
    {
        $this->seedShop();

        // Untagged before any affiliate link is visited.
        $this->postJson('/api/store/cart/line-items', ['variant_id' => 'var_a', 'quantity' => 1])->assertOk();

        $this->postJson('/api/store/affiliate/resolve', ['code' => 'JANE10'])->assertOk();

        $this->postJson('/api/store/cart/line-items', ['variant_id' => 'var_b', 'quantity' => 1])->assertOk();

        $codes = $this->lineCodes();
        $this->assertNull($codes['var_a'], 'A line added before the link is never retro-attributed.');
        $this->assertSame('JANE10', $codes['var_b']);
    }

    #[Test]
    public function a_second_affiliate_link_overrides_the_session_but_not_existing_lines(): void
    {
        $this->seedShop();

        $this->postJson('/api/store/affiliate/resolve', ['code' => 'JANE10'])->assertOk();
        $this->postJson('/api/store/cart/line-items', ['variant_id' => 'var_a', 'quantity' => 1])->assertOk();

        // Visiting a second affiliate's link replaces the session attribution...
        $this->postJson('/api/store/affiliate/resolve', ['code' => 'SARAH10'])->assertOk();
        $this->getJson('/api/store/affiliate/active')->assertJsonPath('affiliate.code', 'SARAH10');

        $this->postJson('/api/store/cart/line-items', ['variant_id' => 'var_b', 'quantity' => 1])->assertOk();

        // ...but the line Jane already earned stays hers. Last-click wins for
        // what happens NEXT, not retroactively.
        $codes = $this->lineCodes();
        $this->assertSame('JANE10', $codes['var_a']);
        $this->assertSame('SARAH10', $codes['var_b']);
    }

    #[Test]
    public function clearing_the_pill_stops_future_attribution_but_keeps_what_was_earned(): void
    {
        $this->seedShop();

        $this->postJson('/api/store/affiliate/resolve', ['code' => 'JANE10'])->assertOk();
        $this->postJson('/api/store/cart/line-items', ['variant_id' => 'var_a', 'quantity' => 1])->assertOk();

        // The customer dismisses "Shopping via JANE10".
        $this->postJson('/api/store/affiliate/clear')->assertOk();
        $this->getJson('/api/store/affiliate/active')->assertJsonPath('affiliate', null);

        $this->postJson('/api/store/cart/line-items', ['variant_id' => 'var_b', 'quantity' => 1])->assertOk();

        $codes = $this->lineCodes();
        $this->assertSame('JANE10', $codes['var_a'], 'Clearing must not revoke a sale already attributed.');
        $this->assertNull($codes['var_b']);
    }

    #[Test]
    public function an_inactive_or_unknown_code_attributes_nothing(): void
    {
        $this->seedShop();
        Affiliate::where('code', 'JANE10')->update(['status' => 'pending']);

        // Only 'active' affiliates resolve, so a pending or paused one cannot
        // start earning by sharing their link early.
        $this->postJson('/api/store/affiliate/resolve', ['code' => 'JANE10'])->assertStatus(404);
        $this->postJson('/api/store/affiliate/resolve', ['code' => 'NOPE'])->assertStatus(404);

        $this->postJson('/api/store/cart/line-items', ['variant_id' => 'var_a', 'quantity' => 1])->assertOk();
        $this->assertNull($this->lineCodes()['var_a']);
    }

    #[Test]
    public function a_stale_session_code_cannot_resurrect_a_deactivated_affiliate(): void
    {
        $this->seedShop();
        $this->postJson('/api/store/affiliate/resolve', ['code' => 'JANE10'])->assertOk();

        // Admin pauses them while the customer is still browsing.
        Affiliate::where('code', 'JANE10')->update(['status' => 'paused']);

        // The pill stops showing, and the session code is dropped.
        $this->getJson('/api/store/affiliate/active')->assertJsonPath('affiliate', null);
    }
}
