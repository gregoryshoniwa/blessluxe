<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The catalogue pages: quick filters, sorts that do what they say, the pulse
 * of where the shopper is, and a "just sold" strip that names the piece and
 * never the person.
 */
class ShopListingTest extends TestCase
{
    use RefreshDatabase;

    private function product(string $id, int $price, array $extra = [], array $sizes = [['M', true]]): void
    {
        DB::table('products')->insert(array_merge([
            'id' => $id, 'title' => ucfirst($id), 'handle' => $id, 'status' => 'published',
            'created_at' => now()->subDays(30), 'updated_at' => now(),
        ], $extra));
        foreach ($sizes as $i => [$label, $inStock]) {
            DB::table('product_variants')->insert(['id' => "{$id}_v$i", 'product_id' => $id, 'title' => $label,
                'manage_inventory' => true, 'inventory_quantity' => $inStock ? 3 : 0, 'created_at' => now(), 'updated_at' => now()]);
            DB::table('variant_prices')->insert(['id' => "{$id}_p$i", 'variant_id' => "{$id}_v$i", 'currency_code' => 'usd', 'amount' => $price, 'created_at' => now()]);
        }
    }

    private function handles(string $qs): array
    {
        return array_column($this->getJson("/api/store/products?$qs")->assertOk()->json('products'), 'handle');
    }

    #[Test]
    public function the_price_sorts_sort_by_price_which_they_did_not_before(): void
    {
        $this->product('gown', 79900, ['created_at' => now()->subDays(40)]);
        $this->product('top', 9900, ['created_at' => now()->subDays(20)]);
        $this->product('skirt', 29900, ['created_at' => now()->subDays(30)]);

        $this->assertSame(['top', 'skirt', 'gown'], $this->handles('sort=price-asc'));
        $this->assertSame(['gown', 'skirt', 'top'], $this->handles('sort=price-desc'));
        $this->assertSame(['top', 'skirt', 'gown'], $this->handles('sort=newest'));
    }

    #[Test]
    public function each_quick_filter_narrows_and_the_pulse_describes_where_you_are(): void
    {
        $this->product('fresh', 19900, ['created_at' => now()->subDays(3)]);
        $this->product('imported', 49900, ['sourcing' => 'import']);
        $this->product('loved', 25900, ['rating_count' => 2, 'rating_sum' => 9, 'likes_count' => 7, 'purchases_count' => 4]);
        $this->product('meh', 35900, ['rating_count' => 2, 'rating_sum' => 5]);

        $this->assertSame(['fresh'], $this->handles('new=1'));
        $this->assertSame(['imported'], $this->handles('where=import'));
        $this->assertEqualsCanonicalizing(['fresh', 'loved', 'meh'], $this->handles('where=local'));
        $this->assertSame(['loved'], $this->handles('top=1'));                       // 4.5 average, not 2.5
        $this->assertEqualsCanonicalizing(['fresh', 'loved'], $this->handles('max_price=30000'));
        $this->assertSame('loved', $this->handles('sort=popular')[0]);

        // The pulse counts the place, not the filtered list — it doesn't drop to 0 when you tap "Top rated".
        $stats = $this->getJson('/api/store/products?top=1')->json('stats');
        $this->assertSame(['pieces' => 4, 'new' => 1, 'available' => 3, 'sold_week' => 0], $stats);
        $this->assertNull($this->getJson('/api/store/products?page=2&limit=2')->json('stats'));   // page 1 only
    }

    #[Test]
    public function a_card_carries_its_sizes_so_it_can_be_added_from_the_grid(): void
    {
        $this->product('gown', 79900, ['created_at' => now()->subDays(2)], [['S', true], ['M', false]]);

        $card = $this->getJson('/api/store/products')->json('products.0');
        $this->assertTrue($card['is_new']);
        $this->assertSame([['S', true], ['M', false]], array_map(fn ($s) => [$s['title'], $s['in_stock']], $card['sizes']));
    }

    #[Test]
    public function just_sold_names_the_piece_never_the_person(): void
    {
        $this->product('gown', 79900);
        DB::table('customers')->insert(['id' => 'cust_1', 'email' => 'rudo@test.test', 'password' => 'x', 'first_name' => 'Rudo', 'last_name' => 'Moyo', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('orders')->insert(['id' => 'o1', 'order_number' => 'BL-1', 'customer_id' => 'cust_1', 'email' => 'rudo@test.test',
            'payment_status' => 'paid', 'status' => 'pending', 'subtotal' => 79900, 'total' => 79900, 'currency_code' => 'usd',
            'shipping_address' => json_encode(['city' => 'Harare']), 'created_at' => now()->subHour(), 'updated_at' => now()]);
        DB::table('order_line_items')->insert(['id' => 'li1', 'order_id' => 'o1', 'variant_id' => 'gown_v0', 'product_id' => 'gown', 'title' => 'Gown', 'variant_title' => 'M', 'quantity' => 2, 'unit_price' => 79900]);

        $d = $this->getJson('/api/store/products')->assertOk();
        $this->assertSame(['Gown', 'gown', 'M'], [$d->json('activity.0.title'), $d->json('activity.0.handle'), $d->json('activity.0.size')]);
        $this->assertSame(2, $d->json('stats.sold_week'));

        $strip = json_encode($d->json('activity'));
        foreach (['Rudo', 'Moyo', 'rudo@', 'Harare', 'cust_1'] as $leak) $this->assertStringNotContainsString($leak, $strip);
    }
}
