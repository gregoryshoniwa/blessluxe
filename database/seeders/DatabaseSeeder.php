<?php

namespace Database\Seeders;

use App\Models\Catalogue;
use App\Models\Heading;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use App\Models\Region;
use App\Models\User;
use App\Models\VariantPrice;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Admin user (uses Laravel's default users table; the original
        // `shop_user` table is replaced by this).
        User::firstOrCreate(
            ['email' => 'admin@blessluxe.com'],
            ['name' => 'BlessLuxe Admin', 'password' => bcrypt('admin123')]
        );

        // ─── Region ─────────────────────────────────────────────────
        Region::firstOrCreate(
            ['id' => 'reg_default'],
            ['name' => 'Default', 'currency_code' => 'usd', 'countries' => ['US', 'GB', 'ZW', 'ZA']]
        );

        // ─── Currencies + countries seed (parity with schema.sql) ───
        DB::table('currencies')->upsert([
            ['code' => 'usd', 'name' => 'US Dollar',         'symbol' => '$', 'rate_to_root' => 1.0,  'is_root' => 1, 'is_active' => 1, 'sort_order' => 1],
            ['code' => 'gbp', 'name' => 'British Pound',     'symbol' => '£', 'rate_to_root' => 0.78, 'is_root' => 0, 'is_active' => 1, 'sort_order' => 2],
            ['code' => 'eur', 'name' => 'Euro',              'symbol' => '€', 'rate_to_root' => 0.92, 'is_root' => 0, 'is_active' => 1, 'sort_order' => 3],
            ['code' => 'zar', 'name' => 'South African Rand','symbol' => 'R', 'rate_to_root' => 18.5, 'is_root' => 0, 'is_active' => 1, 'sort_order' => 4],
        ], ['code'], ['name', 'symbol', 'rate_to_root', 'is_root', 'is_active', 'sort_order']);

        // ─── Headings → Catalogues (storefront navigation) ──────────
        $blueprint = [
            'women' => [
                'name'  => 'Women',
                'rank'  => 1,
                'sale'  => false,
                'catalogues' => [
                    ['handle' => 'dresses',  'name' => 'Dresses'],
                    ['handle' => 'tops',     'name' => 'Tops & Blouses'],
                    ['handle' => 'trousers', 'name' => 'Trousers & Skirts'],
                    ['handle' => 'bags',     'name' => 'Bags'],
                ],
            ],
            'men' => [
                'name'  => 'Men',
                'rank'  => 2,
                'sale'  => false,
                'catalogues' => [
                    ['handle' => 'shirts',     'name' => 'Shirts'],
                    ['handle' => 'mens-trousers', 'name' => 'Trousers'],
                    ['handle' => 'suits',      'name' => 'Suits'],
                ],
            ],
            'children' => [
                'name'  => 'Children',
                'rank'  => 3,
                'sale'  => false,
                'catalogues' => [
                    ['handle' => 'girls', 'name' => 'Girls'],
                    ['handle' => 'boys',  'name' => 'Boys'],
                ],
            ],
            'sale' => [
                'name'  => 'Sale',
                'rank'  => 99,
                'sale'  => true,
                'catalogues' => [],
            ],
        ];

        foreach ($blueprint as $handle => $h) {
            $heading = Heading::updateOrCreate(
                ['handle' => $handle],
                ['id' => 'head_' . Str::random(12), 'name' => $h['name'], 'rank' => $h['rank'], 'is_sale' => $h['sale']]
            );
            foreach ($h['catalogues'] as $i => $c) {
                Catalogue::updateOrCreate(
                    ['handle' => $c['handle']],
                    [
                        'id'         => 'cat_' . Str::random(12),
                        'heading_id' => $heading->id,
                        'name'       => $c['name'],
                        'rank'       => $i,
                    ]
                );
            }
        }

        // ─── A handful of sample products with variants + a price ───
        $sampleProducts = [
            ['handle' => 'floral-midi-wrap-dress', 'title' => 'Floral Midi Wrap Dress', 'subtitle' => 'Rose Garden',     'price' => 34900, 'catalogue' => 'dresses'],
            ['handle' => 'cashmere-wrap-blouse',   'title' => 'Cashmere Wrap Blouse',   'subtitle' => 'Cream / Mint',    'price' => 24900, 'catalogue' => 'tops'],
            ['handle' => 'linen-maxi-sundress',    'title' => 'Linen Maxi Sundress',    'subtitle' => 'Slate / Cream',   'price' => 27900, 'catalogue' => 'dresses'],
            ['handle' => 'silk-evening-gown',      'title' => 'Silk Evening Gown',      'subtitle' => 'Onyx',            'price' => 79900, 'catalogue' => 'dresses'],
            ['handle' => 'tailored-wool-trouser',  'title' => 'Tailored Wool Trouser',  'subtitle' => 'Charcoal',        'price' => 32900, 'catalogue' => 'trousers'],
            ['handle' => 'oversized-tote',         'title' => 'Oversized Leather Tote', 'subtitle' => 'Tan',             'price' => 54900, 'catalogue' => 'bags'],
        ];

        foreach ($sampleProducts as $p) {
            $product = Product::updateOrCreate(
                ['handle' => $p['handle']],
                [
                    'id'        => 'prod_' . Str::random(12),
                    'title'     => $p['title'],
                    'subtitle'  => $p['subtitle'],
                    'status'    => 'published',
                    'thumbnail' => null,
                ]
            );

            // Attach to its catalogue.
            $catalogue = Catalogue::where('handle', $p['catalogue'])->first();
            if ($catalogue) {
                $product->catalogues()->syncWithoutDetaching([$catalogue->id]);
            }

            // One variant per size.
            foreach (['XS', 'S', 'M', 'L', 'XL'] as $i => $size) {
                $variant = ProductVariant::updateOrCreate(
                    ['sku' => $p['handle'] . '-' . strtolower($size)],
                    [
                        'id'                 => 'var_' . Str::random(12),
                        'product_id'         => $product->id,
                        'title'              => $size,
                        'manage_inventory'   => true,
                        'inventory_quantity' => 20,
                    ]
                );
                VariantPrice::updateOrCreate(
                    ['variant_id' => $variant->id, 'currency_code' => 'usd'],
                    ['id' => 'vpr_' . Str::random(12), 'amount' => $p['price']]
                );
            }
        }

        $this->command->info('Seeded: 1 admin, 4 headings, 11 catalogues, 6 products with variants + USD prices.');
    }
}
