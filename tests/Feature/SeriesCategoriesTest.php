<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * A series sits in the shop where its pieces sit — Women › Dresses, Men ›
 * Suits — and the filters on /shop/series are built only from what is open.
 */
class SeriesCategoriesTest extends TestCase
{
    use RefreshDatabase;

    private function heading(string $handle, int $rank, bool $sale = false): void
    {
        DB::table('headings')->insert(['id' => "h_$handle", 'name' => ucfirst($handle), 'handle' => $handle, 'rank' => $rank, 'is_active' => true, 'is_sale' => $sale, 'created_at' => now(), 'updated_at' => now()]);
    }

    private function catalogue(string $handle, string $heading, int $rank = 0): void
    {
        DB::table('catalogues')->insert(['id' => "c_$handle", 'heading_id' => "h_$heading", 'name' => ucfirst($handle), 'handle' => $handle, 'rank' => $rank, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    }

    /** A product in some catalogues, and an open series of it with `$slots` sizes. */
    private function series(string $code, array $catalogues, int $slots = 2): void
    {
        $pid = "prod_$code";
        DB::table('products')->insert(['id' => $pid, 'title' => "Piece $code", 'handle' => strtolower("piece-$code"), 'status' => 'published', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('product_variants')->insert(['id' => "var_$code", 'product_id' => $pid, 'title' => 'M', 'created_at' => now(), 'updated_at' => now()]);
        foreach ($catalogues as $c) DB::table('product_catalogue_map')->insert(['product_id' => $pid, 'catalogue_id' => "c_$c"]);

        DB::table('pack_definitions')->insert(['id' => "def_$code", 'product_id' => $pid, 'title' => "Series $code", 'status' => 'published', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('pack_campaigns')->insert(['id' => "camp_$code", 'pack_definition_id' => "def_$code", 'public_code' => $code, 'status' => 'open', 'created_at' => now(), 'updated_at' => now()]);
        for ($i = 0; $i < $slots; $i++) {
            DB::table('pack_slots')->insert(['id' => "slot_{$code}_$i", 'pack_campaign_id' => "camp_$code", 'variant_id' => "var_$code", 'size_label' => "S$i", 'status' => 'available', 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->heading('women', 1);
        $this->heading('sale', 2, sale: true);
        $this->heading('men', 3);
        $this->heading('children', 4);
        $this->catalogue('dresses', 'women', 1);
        $this->catalogue('bags', 'women', 2);
        $this->catalogue('suits', 'men', 1);
        $this->catalogue('girls', 'children', 1);
    }

    #[Test]
    public function the_filters_are_built_from_what_is_open_and_nothing_else(): void
    {
        $this->series('DRESS1', ['dresses']);
        $this->series('DRESS2', ['dresses']);
        $this->series('SUIT1', ['suits']);

        $cats = $this->getJson('/api/store/series')->assertOk()->json('categories');

        // Women and Men, in the shop's own order — Children has no series, so it isn't offered.
        $this->assertSame(['women', 'men'], array_column($cats, 'handle'));
        $this->assertSame([2, 1], array_column($cats, 'count'));
        // Under Women, only the catalogue that has something in it — no empty Bags.
        $this->assertSame([['handle' => 'dresses', 'name' => 'Dresses', 'count' => 2]], $cats[0]['catalogues']);
    }

    #[Test]
    public function each_series_says_where_it_sits_so_the_page_can_filter_it(): void
    {
        $this->series('MIX1', ['dresses', 'girls']);   // a piece listed for women and girls

        $p = collect($this->getJson('/api/store/series')->json('packs'))->firstWhere('public_code', 'MIX1');

        $this->assertEqualsCanonicalizing(['women', 'children'], $p['headings']);
        $this->assertEqualsCanonicalizing(['dresses', 'girls'], $p['catalogues']);
        // Searchable by category name, so "dress" finds it even if the title doesn't say so.
        $this->assertStringContainsString('Dresses', $p['category_names']);

        // One series counted once per heading, however many catalogues it's in.
        $cats = collect($this->getJson('/api/store/series')->json('categories'))->keyBy('handle');
        $this->assertSame(1, $cats['women']['count']);
        $this->assertSame(1, $cats['children']['count']);
    }

    #[Test]
    public function the_sale_heading_is_not_a_place_a_series_can_sit(): void
    {
        DB::table('catalogues')->insert(['id' => 'c_clearance', 'heading_id' => 'h_sale', 'name' => 'Clearance', 'handle' => 'clearance', 'rank' => 0, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        $this->series('SALE1', ['clearance', 'dresses']);

        $cats = $this->getJson('/api/store/series')->json('categories');

        $this->assertNotContains('sale', array_column($cats, 'handle'));
        $this->assertSame(['women'], array_column($cats, 'handle'));
    }

    #[Test]
    public function a_series_whose_pieces_have_no_catalogue_still_lists_it_just_isnt_filed(): void
    {
        $this->series('LOOSE1', []);

        $res = $this->getJson('/api/store/series')->assertOk();
        $this->assertSame([], $res->json('categories'));
        $this->assertSame([[], []], [$res->json('packs.0.headings'), $res->json('packs.0.catalogues')]);
    }
}
