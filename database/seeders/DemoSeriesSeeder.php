<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Sample series for looking at the listing and the page with something on
 * them: a spread of fill levels, deadlines and sizes across the products that
 * already exist locally. Demo buyers are made up; demo campaigns are prefixed
 * so running it again replaces them rather than piling up.
 *
 *   php artisan db:seed --class=DemoSeriesSeeder
 *
 * Refuses to run in production — these are not real sales.
 */
class DemoSeriesSeeder extends Seeder
{
    private const SCENARIOS = [
        // [title suffix,            sizes, paid, deadline]
        ['one more and it ships',    5,     4,    '+6 hours'],
        ['just opened',              6,     2,    '+3 days'],
        ['be the first',             4,     0,    null],
        ['closing tonight',          5,     3,    '+45 minutes'],
        ['weekend run',              8,     5,    '+1 day'],
        ['no rush',                  3,     1,    '+10 days'],
        ['half way',                 6,     3,    null],
        ['last two',                 4,     2,    '+2 days'],
    ];

    private const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL'];

    private const BUYERS = [
        ['Rudo', 'Moyo'], ['Tendai', 'Kaseke'], ['Chipo', 'Ndlovu'], ['Farai', 'Sibanda'],
        ['Nyasha', 'Mutasa'], ['Tatenda', 'Chirwa'], ['Rumbidzai', 'Dube'], ['Kudzai', 'Mpofu'],
    ];

    public function run(): void
    {
        if (app()->isProduction()) {
            $this->command?->error('Demo series are for local use only.');

            return;
        }

        // Start clean: previous demo runs go, nothing else is touched.
        DB::table('pack_campaigns')->where('public_code', 'like', 'DEMO%')->delete();
        DB::table('pack_definitions')->where('id', 'like', 'def_demo_%')->delete();

        foreach (self::BUYERS as $i => [$first, $last]) {
            DB::table('customers')->updateOrInsert(['id' => 'cust_demo_' . ($i + 1)], [
                'email' => strtolower("$first.$last.demo@example.test"), 'password' => bcrypt('demo'),
                'first_name' => $first, 'last_name' => $last, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        // Pieces with a video first, so at least one card shows one.
        $products = DB::table('products as p')
            ->leftJoin('product_media as m', fn ($j) => $j->on('m.product_id', '=', 'p.id')->where('m.media_type', 'video')->where('m.status', 'ready'))
            ->where('p.status', 'published')
            ->whereExists(fn ($q) => $q->selectRaw('1')->from('product_variants as v')->whereColumn('v.product_id', 'p.id'))
            ->groupBy('p.id', 'p.title', 'p.handle')
            ->orderByRaw('COUNT(m.id) DESC')
            ->get(['p.id', 'p.title', 'p.handle']);

        if ($products->isEmpty()) {
            $this->command?->warn('No published products with variants — nothing to build a series from.');

            return;
        }

        foreach (self::SCENARIOS as $n => [$suffix, $sizes, $paid, $deadline]) {
            $product = $products[$n % $products->count()];
            $variants = DB::table('product_variants')->where('product_id', $product->id)->orderBy('created_at')->pluck('id');
            $defId = 'def_demo_' . ($n + 1);
            $campId = 'camp_demo_' . ($n + 1);

            DB::table('pack_definitions')->insert([
                'id' => $defId, 'product_id' => $product->id, 'pack_kind' => 'single',
                'title' => $product->title, 'handle' => "demo-{$n}-{$product->handle}",
                'description' => "A run of the {$product->title}, bought together. Demo data.",
                'status' => 'published', 'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('pack_campaigns')->insert([
                'id' => $campId, 'pack_definition_id' => $defId, 'host_kind' => $n % 3 === 0 ? 'customer' : 'admin',
                'customer_id' => $n % 3 === 0 ? 'cust_demo_1' : null,
                'public_code' => 'DEMO' . str_pad((string) ($n + 1), 2, '0', STR_PAD_LEFT) . strtoupper(substr(md5($product->id), 0, 4)),
                'title' => "{$product->title} — {$suffix}",
                'status' => 'open',
                'expires_at' => $deadline ? now()->modify($deadline) : null,
                'created_at' => now()->subHours($n * 7), 'updated_at' => now(),
            ]);

            for ($i = 0; $i < $sizes; $i++) {
                $isPaid = $i < $paid;
                DB::table('pack_slots')->insert([
                    'id' => "slot_demo_{$n}_{$i}", 'pack_campaign_id' => $campId,
                    'variant_id' => $variants[$i % $variants->count()],
                    'size_label' => self::SIZES[$i],
                    'status' => $isPaid ? 'paid' : 'available',
                    'customer_id' => $isPaid ? 'cust_demo_' . (($i % count(self::BUYERS)) + 1) : null,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        }

        $this->command?->info(count(self::SCENARIOS) . ' demo series created. Open /shop/series.');
    }
}
