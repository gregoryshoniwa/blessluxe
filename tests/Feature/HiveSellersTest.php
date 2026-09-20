<?php

namespace Tests\Feature;

use App\Models\Affiliate;
use App\Models\Customer;
use App\Services\Hive;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Sellers in Bless Hive. A seller is an approved affiliate; money still moves
 * by the affiliate process. These tests hold the lines around that: the badge
 * can't be claimed, a reputation can't be self-written, and a browser can't
 * choose who gets credit for a sale.
 */
class HiveSellersTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        config(['media.disk' => null, 'filesystems.default' => 'local']);
        foreach (['dress' => 4500, 'tote' => 9000] as $n => $cents) {
            DB::table('products')->insert(['id' => "prod_$n", 'title' => ucfirst($n), 'handle' => $n, 'status' => 'published', 'thumbnail' => "/img/$n.jpg", 'created_at' => now(), 'updated_at' => now()]);
            DB::table('product_variants')->insert(['id' => "var_$n", 'product_id' => "prod_$n", 'title' => 'One size', 'created_at' => now(), 'updated_at' => now()]);
            DB::table('variant_prices')->insert(['id' => "price_$n", 'variant_id' => "var_$n", 'currency_code' => 'usd', 'amount' => $cents, 'created_at' => now()]);
        }
    }

    private function member(string $n): Customer
    {
        DB::table('customers')->insert(['id' => "cust_$n", 'email' => "$n@example.com", 'password' => bcrypt('x'), 'first_name' => ucfirst($n), 'last_name' => 'Moyo', 'created_at' => now(), 'updated_at' => now()]);
        $c = Customer::find("cust_$n");
        Hive::profile($c);
        DB::table('hive_profiles')->where('customer_id', $c->id)->update(['adult_confirmed_at' => now()]);

        return $c;
    }

    private function seller(string $n, string $status = 'active', array $attrs = []): Affiliate
    {
        $this->member($n);

        return Affiliate::create($attrs + ['id' => "aff_$n", 'customer_id' => "cust_$n", 'code' => strtoupper($n), 'email' => "$n@example.com", 'first_name' => $n, 'commission_rate' => 10, 'status' => $status]);
    }

    private function as(Customer|string $c): static
    {
        Auth::forgetGuards();

        return $this->actingAs($c instanceof Customer ? $c : Customer::find("cust_$c"), 'customer');
    }

    private function look(string $who, array $extra = []): string
    {
        return $this->as($who)->post('/api/account/hive/looks', $extra + ['images' => [UploadedFile::fake()->image('l.jpg')]], ['Accept' => 'application/json'])->assertOk()->json('look.id');
    }

    /** A paid order by $buyer, credited to $seller (or nobody). Returns the line id. */
    private function sale(string $buyer, ?Affiliate $seller, string $n, array $lineMeta = []): string
    {
        $cols = array_flip(Schema::getColumnListing('orders'));
        DB::table('orders')->insert(array_intersect_key(['id' => "order_$n", 'order_number' => "BL-$n", 'customer_id' => "cust_$buyer", 'email' => "$buyer@example.com", 'status' => 'completed', 'payment_status' => 'paid', 'fulfillment_status' => 'delivered', 'currency_code' => 'usd', 'subtotal' => 4500, 'total' => 4500, 'shipping_total' => 0, 'tax_total' => 0, 'discount_total' => 0, 'created_at' => now(), 'updated_at' => now()], $cols));
        DB::table('order_line_items')->insert(['id' => "line_$n", 'order_id' => "order_$n", 'variant_id' => 'var_dress', 'product_id' => 'prod_dress', 'title' => 'Dress', 'variant_title' => 'Size 12', 'quantity' => 2, 'unit_price' => 4500, 'metadata' => $lineMeta ? json_encode($lineMeta) : null]);
        if ($seller) DB::table('affiliate_sales')->insert(['id' => "sale_$n", 'affiliate_id' => $seller->id, 'order_id' => "order_$n", 'order_total' => 9000, 'commission_amount' => 900, 'status' => 'pending']);

        return "line_$n";
    }

    // ─── The badge ─────────────────────────────────────────────────────────

    #[Test]
    public function only_an_approved_affiliate_carries_the_seller_badge(): void
    {
        $this->seller('jane'); $this->seller('pending', 'pending'); $this->member('plain');
        $id = $this->look('jane'); $this->look('pending');

        $page = fn (string $h) => $this->getJson("/api/store/hive/pages/{$h}_moyo")->json('page');
        $this->assertTrue($page('jane')['seller']);
        $this->assertSame('JANE', $page('jane')['shop_code']);
        $this->assertSame('New seller', $page('jane')['reputation']['sales_label']);
        $this->assertFalse($page('pending')['seller']);                 // applied ≠ approved
        $this->assertNull($page('pending')['reputation']);
        $this->assertFalse($page('plain')['seller']);

        $authors = collect($this->getJson('/api/store/hive/feed')->json('looks'))->pluck('author.seller', 'author.handle');
        $this->assertTrue($authors['jane_moyo']);
        $this->assertFalse($authors['pending_moyo']);

        // Approval can be withdrawn, and the badge goes with it at once.
        Affiliate::where('id', 'aff_jane')->update(['status' => 'suspended']);
        $this->assertFalse($page('jane')['seller']);
        $this->getJson('/api/store/hive/pages/jane_moyo/shop')->assertStatus(404);
        $this->assertEquals(['jane_moyo' => false, 'pending_moyo' => false], collect($this->getJson('/api/store/hive/feed')->json('looks'))->pluck('author.seller', 'author.handle')->all());
    }

    // ─── Reputation ────────────────────────────────────────────────────────

    #[Test]
    public function a_reputation_is_made_of_real_buyers_and_a_seller_cannot_write_their_own(): void
    {
        $jane = $this->seller('jane'); $sarah = $this->seller('sarah');
        $this->member('buyer1'); $this->member('buyer2');

        $tryOn = fn (string $who, string $line, int $stars) => $this->as($who)->post('/api/account/hive/looks', ['images' => [UploadedFile::fake()->image('me.jpg')], 'line_item_id' => $line, 'fit' => 'true', 'rating' => $stars], ['Accept' => 'application/json'])->assertOk();

        $tryOn('buyer1', $this->sale('buyer1', $jane, 'A'), 5);
        $tryOn('buyer2', $this->sale('buyer2', $jane, 'B'), 4);
        $tryOn('jane',   $this->sale('jane',   $jane, 'C'), 5);         // buying from yourself and praising it
        $tryOn('buyer1', $this->sale('buyer1', $sarah, 'D'), 1);        // someone else's customer
        $tryOn('buyer2', $this->sale('buyer2', null, 'E'), 1);          // bought straight from BLESSLUXE

        $rep = $this->getJson('/api/store/hive/pages/jane_moyo')->json('page.reputation');
        $this->assertSame(2, $rep['reviews']);
        $this->assertSame(4.5, $rep['rating']);
        $this->assertSame('First sales made', $rep['sales_label']);     // a band, never the number

        $shop = $this->getJson('/api/store/hive/pages/jane_moyo/shop')->assertOk()->json();
        $this->assertEqualsCanonicalizing(['buyer1_moyo', 'buyer2_moyo'], array_column(array_column($shop['buyer_tryons'], 'author'), 'handle'));
    }

    // ─── The shop on the page ──────────────────────────────────────────────

    #[Test]
    public function the_shop_tab_shows_the_sellers_own_line_at_the_sellers_prices(): void
    {
        $jane = $this->seller('jane', 'active', ['storefront_mode' => 'curated', 'storefront_title' => "Jane's Picks"]);
        DB::table('affiliate_products')->insert(['id' => 'ap_1', 'affiliate_id' => $jane->id, 'product_id' => 'prod_dress', 'markup_type' => 'fixed', 'markup_value' => 500, 'is_active' => true, 'position' => 0, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('affiliate_products')->insert(['id' => 'ap_2', 'affiliate_id' => $jane->id, 'product_id' => 'prod_tote', 'is_active' => false, 'position' => 1, 'created_at' => now(), 'updated_at' => now()]);

        $shop = $this->getJson('/api/store/hive/pages/jane_moyo/shop')->assertOk()->json();

        $this->assertTrue($shop['curated']);
        $this->assertSame("Jane's Picks", $shop['title']);
        $this->assertSame([['id' => 'prod_dress', 'handle' => 'dress', 'title' => 'Dress', 'thumbnail' => '/img/dress.jpg', 'price_label' => '$50.00']], $shop['products']);   // $45 + her $5; the switched-off tote is absent

        $this->member('plain');
        $this->getJson('/api/store/hive/pages/plain_moyo/shop')->assertStatus(404);
    }

    // ─── Attribution ───────────────────────────────────────────────────────

    #[Test]
    public function tapping_a_product_under_a_sellers_look_credits_that_seller_by_the_normal_affiliate_route(): void
    {
        $this->seller('jane'); $this->member('plain'); $this->member('shopper');
        $sellerLook = $this->look('jane'); $plainLook = $this->look('plain');
        $this->as('shopper');

        // An ordinary member's tag is just a link: nothing is attributed.
        $this->postJson('/api/store/hive/shop-via', ['look_id' => $plainLook])->assertOk()->assertJsonPath('seller', null);
        $this->assertNull(session('affiliate_code'));

        $this->postJson('/api/store/hive/shop-via', ['look_id' => $sellerLook])->assertOk()->assertJsonPath('seller.code', 'JANE');
        $this->assertSame('JANE', session('affiliate_code'));
        $this->assertSame('JANE', $this->getJson('/api/store/affiliate/active')->json('affiliate.code'));   // the shop sees exactly what a shop link would set

        // The price on the page is the price the cart will charge — her $5 markup included.
        DB::table('affiliate_products')->insert(['id' => 'ap_m', 'affiliate_id' => 'aff_jane', 'product_id' => 'prod_dress', 'markup_type' => 'fixed', 'markup_value' => 500, 'is_active' => true, 'position' => 0, 'created_at' => now(), 'updated_at' => now()]);
        $this->assertSame(5000, $this->getJson('/api/store/products/dress')->json('product.variants.0.price'));
        $grid = collect($this->getJson('/api/store/products')->json('products'))->firstWhere('handle', 'dress');
        $this->assertSame('$50.00', $grid['price_label']);

        // The cart line carries the seller AND the look that sent them.
        $this->postJson('/api/store/cart/line-items', ['variant_id' => 'var_dress', 'quantity' => 1])->assertSuccessful();
        $meta = json_decode((string) DB::table('cart_line_items')->value('metadata'), true);
        $this->assertSame('JANE', $meta['affiliate_code'] ?? null);
        $this->assertSame($sellerLook, $meta['hive_look_id'] ?? null);
        $this->assertSame(500, $meta['markup_amount'] ?? null);

        // …and outside her shop the same product is back at the base price.
        $this->postJson('/api/store/affiliate/clear');
        $this->assertSame(4500, $this->getJson('/api/store/products/dress')->json('product.variants.0.price'));

        // A browser can't name a seller here — only point at content, and the server decides whose it is.
        $this->postJson('/api/store/hive/shop-via', ['look_id' => $plainLook, 'code' => 'JANE', 'affiliate_code' => 'JANE'])->assertJsonPath('seller', null);
        $this->postJson('/api/store/hive/shop-via', ['look_id' => 'look_made_up'])->assertJsonPath('seller', null);

        // Visiting a shop by its link afterwards is not "from a look".
        $this->postJson('/api/store/hive/shop-via', ['look_id' => $sellerLook]);
        $this->postJson('/api/store/affiliate/resolve', ['code' => 'JANE'])->assertOk();
        $this->assertNull(session('hive_look_id'));
    }

    #[Test]
    public function a_seller_sees_which_looks_sold_and_nobody_else_sees_their_numbers(): void
    {
        $jane = $this->seller('jane'); $this->member('buyer');
        $look = $this->look('jane', ['caption' => 'The emerald one']);
        $this->sale('buyer', $jane, 'A', ['affiliate_code' => 'JANE', 'hive_look_id' => $look]);
        $this->sale('buyer', $jane, 'B', ['affiliate_code' => 'JANE']);                       // her sale, but not from a look
        $this->sale('buyer', $jane, 'C', ['affiliate_code' => 'SARAH', 'hive_look_id' => $look]);   // someone else's code on the line
        Affiliate::where('id', $jane->id)->update(['total_earnings' => 1800]);

        $mine = $this->as('jane')->getJson('/api/account/hive/earnings')->assertOk()->json('seller');
        $this->assertSame(2, $mine['hive_items_sold']);
        $this->assertSame('$90.00', $mine['hive_sales_label']);
        $this->assertSame('$18.00', $mine['earnings_label']);
        $this->assertSame([['id' => $look, 'caption' => 'The emerald one', 'items' => 2, 'sales_label' => '$90.00']], array_map(fn ($l) => array_diff_key($l, ['image' => 1]), $mine['looks_that_sold']));

        $this->assertNull($this->as('buyer')->getJson('/api/account/hive/earnings')->json('seller'));
        $this->assertStringNotContainsString('90.00', json_encode($this->getJson('/api/store/hive/pages/jane_moyo')->json()));
    }

    // ─── Directory and closet ──────────────────────────────────────────────

    #[Test]
    public function discover_lists_trusted_sellers_and_my_closet_is_mine_alone(): void
    {
        $jane = $this->seller('jane'); $this->seller('sarah', 'pending'); $this->member('buyer'); $this->member('nosy');
        $line = $this->sale('buyer', $jane, 'A');

        $this->assertSame(['jane_moyo'], array_column($this->getJson('/api/store/hive/sellers')->json('sellers'), 'handle'));

        $closet = $this->as('buyer')->getJson('/api/account/hive/closet')->assertOk()->json('items');
        $this->assertCount(1, $closet);
        $this->assertSame([$line, 'Dress', 'dress', null, 50], [$closet[0]['line_item_id'], $closet[0]['title'], $closet[0]['product_handle'], $closet[0]['look_id'], $closet[0]['earns']]);

        $lookId = $this->as('buyer')->post('/api/account/hive/looks', ['images' => [UploadedFile::fake()->image('me.jpg')], 'line_item_id' => $line, 'fit' => 'true'], ['Accept' => 'application/json'])->json('look.id');
        $after = $this->as('buyer')->getJson('/api/account/hive/closet')->json('items.0');
        $this->assertSame([$lookId, 0], [$after['look_id'], $after['earns']]);

        $this->assertSame([], $this->as('nosy')->getJson('/api/account/hive/closet')->json('items'));
        Auth::forgetGuards();
        $this->app['auth']->guard('customer')->logout();
        $this->getJson('/api/account/hive/closet')->assertStatus(401);
    }
}
