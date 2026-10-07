<?php

namespace App\Services;

use App\Http\Controllers\Api\Admin\AdminPackController;
use App\Models\PackCampaign;
use App\Models\PackDefinition;
use App\Models\PackSlot;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use App\Models\Supplier;
use App\Models\VariantPrice;
use App\Services\AI\GeminiService;
use App\Support\Sizes;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * A supplier's post (Telegram / WhatsApp) → a live series, in one form.
 *
 * What a post means, in the trade's own words: "Seri 60$" is the price PER
 * PIECE when you take the whole size run (one of each size) — that is what we
 * pay, so it is the cost. "One piece 85$" is their single-piece price; we keep
 * it for reference only. Sizes like "38-40-42-44 AND 44-46-48-50" are two runs,
 * and each run becomes its own series. Series are imports: no stock is kept.
 */
class QuickSeries
{
    public const KEY = 'quick.series';
    public const ORIGINS = ['TR' => 'Turkey', 'CN' => 'China', 'AE' => 'Dubai (UAE)', 'ZA' => 'South Africa', 'OT' => 'Somewhere else'];
    public const OPEN_DAYS = [7, 14, 21, 30];

    /** Shared by every member of staff: the margin last used is the next default. */
    public static function settings(): array
    {
        $raw = json_decode((string) DB::table('settings')->where('key', self::KEY)->value('value'), true);

        return ['margin' => (int) ($raw['margin'] ?? 40), 'fixed' => (float) ($raw['fixed'] ?? 0), 'open_days' => (int) ($raw['open_days'] ?? 14)];
    }

    private static function remember(int $margin, float $fixed, ?int $days): void
    {
        $days ??= self::settings()['open_days'];        // a product save mustn't reset the series deadline
        DB::table('settings')->updateOrInsert(['key' => self::KEY], ['value' => json_encode(['margin' => $margin, 'fixed' => $fixed, 'open_days' => $days]), 'updated_at' => now()]);
    }

    /** Catalogues as "Men › Suits", for the form and for the reader to choose from. */
    public static function catalogues(): array
    {
        return DB::table('catalogues as c')->join('headings as h', 'h.id', '=', 'c.heading_id')
            ->where('h.is_sale', false)->orderBy('h.rank')->orderBy('c.rank')
            ->get(['c.id', 'c.name', 'h.name as heading'])
            ->map(fn ($c) => ['id' => $c->id, 'label' => "{$c->heading} › {$c->name}"])->all();
    }

    /**
     * Read one or more screenshots of a post and fill the form. Never saves
     * anything — staff check every field, then press Publish.
     *
     * @param  array<int, array{base64: string, mime: string}>  $images
     */
    public static function read(array $images): array
    {
        $cats = self::catalogues();
        $catList = implode("\n", array_map(fn ($c) => "{$c['id']} = {$c['label']}", $cats));
        $suppliers = Supplier::orderByDesc('updated_at')->limit(50)->pluck('name')->implode(', ');

        $system = <<<TXT
You read wholesale clothing posts that suppliers share in Telegram channels and WhatsApp groups, and turn them into a product listing for BLESSLUXE, a fashion shop in Zimbabwe.

How to read a post:
- "Seri", "Seri fiyatı", "série", "series price" = the price PER PIECE when buying the whole size run. That is the COST. If there is only one price, that is the cost.
- "One piece", "tek", "pièce", "single" = their price for a single piece. Report it separately; it is NOT the cost.
- Sizes: list every size the post offers. "46 48 50 52 54 56 & 58 60" is ONE run of eight sizes. "38-40-42-44 AND 44-46-48-50" is TWO runs (two separate lists). Babywear like "0-3/3-6/6-9 Ay/Month" is one run: ["0-3M","3-6M","6-9M"]. Letters stay letters: S, M, L, XL.
- The supplier is the channel/group sender's name shown on the post (e.g. "Mario casas mens wear"), or the brand printed on the picture (e.g. "Mini Cayzen"). Their phone number if one is visible, in international form.
- Origin: Turkish words (Ay, Bebeğim, fiyatı), a +90 number or Turkish brands → TR. Chinese text or +86 → CN. Otherwise null.
- Write the title and description in English for shoppers. Title: short and specific, no supplier name, no codes, no prices, no emoji (e.g. "Three-Piece Check Suit"). Description: 2–3 warm sentences on what it is, the fabric and the feel, then a line listing what's included if it is a set. Never mention prices, the supplier or wholesale.
- Model/article numbers printed on the picture (e.g. 2095) go in "reference".
- Pick the single best catalogue id from the list for where this belongs (men's suits → a Men catalogue; babywear → Children). null if none fits.
- Currency: the currency of the prices ("USD" for $).
Suppliers we already use (reuse the exact spelling if it is one of them): {$suppliers}

Catalogues:
{$catList}

Reply with JSON only:
{"title": string, "description": string, "cost": number|null, "single_price": number|null, "currency": string|null, "supplier_name": string|null, "supplier_phone": string|null, "origin": "TR"|"CN"|"AE"|"ZA"|null, "size_runs": [[string]], "catalogue_id": string|null, "reference": string|null, "colours": [string], "confidence_note": string|null}
"confidence_note" says, in one short sentence, anything you were unsure of (null if nothing).
TXT;

        GeminiService::$usageContext = ['surface' => 'quick_series'];
        $spent = 0.0;                      // a retried read costs twice — both are counted
        $ask = function () use ($system, $images, &$spent) {
            GeminiService::$lastUsage = null;
            try {
                return (new GeminiService())->generateText($system, 'Read this post.', ['images' => $images, 'json_mode' => true, 'temperature' => 0.2]);
            } finally {
                $spent += GeminiService::$lastUsage['cost'] ?? 0;
            }
        };
        try {
            $raw = $ask();
        } catch (\RuntimeException $e) {
            // Google's "busy" answers (429/5xx) usually clear in a moment — one retry.
            if (! preg_match('~error: (429|5\d\d)~', $e->getMessage())) throw $e;
            sleep(2);
            $raw = $ask();
        }
        $d = json_decode(preg_replace('~^```(?:json)?|```$~m', '', trim($raw)), true);
        if (! is_array($d)) throw new \RuntimeException('The reader could not make sense of that picture.');

        $validCat = collect($cats)->pluck('id')->contains($d['catalogue_id'] ?? null);
        $origin = strtoupper((string) ($d['origin'] ?? ''));
        $supplier = ! empty($d['supplier_name']) ? Supplier::whereRaw('LOWER(name) = ?', [mb_strtolower(trim($d['supplier_name']))])->first() : null;

        return [
            'title'          => Str::limit(trim((string) ($d['title'] ?? '')), 120, ''),
            'description'    => trim((string) ($d['description'] ?? '')),
            'cost'           => is_numeric($d['cost'] ?? null) ? round((float) $d['cost'], 2) : null,
            'single_price'   => is_numeric($d['single_price'] ?? null) ? round((float) $d['single_price'], 2) : null,
            'currency'       => strtoupper((string) ($d['currency'] ?? 'USD')) ?: 'USD',
            'supplier'       => $supplier
                ? ['id' => $supplier->id, 'name' => $supplier->name, 'phone' => $supplier->phone, 'link' => $supplier->link]
                : ['id' => null, 'name' => trim((string) ($d['supplier_name'] ?? '')), 'phone' => trim((string) ($d['supplier_phone'] ?? '')), 'link' => ''],
            'origin'         => array_key_exists($origin, self::ORIGINS) ? $origin : ($supplier->country ?? null),
            // A one-size run is kept here so staff SEE it and add the rest; publishing needs two.
            'size_runs'      => self::cleanRuns($d['size_runs'] ?? [], 1),
            'catalogue_ids'  => $validCat ? [$d['catalogue_id']] : [],
            'reference'      => trim((string) ($d['reference'] ?? '')) ?: null,
            'colours'        => array_values(array_filter(array_map('strval', (array) ($d['colours'] ?? [])))),
            'note'           => trim((string) ($d['confidence_note'] ?? '')) ?: null,
            'ai_cost'        => round($spent, 5),           // USD, from Google's own token counts
        ];
    }

    /** Runs of distinct, trimmed sizes in size order; empties and one-size "runs" dropped. */
    public static function cleanRuns(array $runs, int $min = 2): array
    {
        $out = [];
        foreach ($runs as $run) {
            if (! is_array($run)) continue;
            $sizes = array_values(array_unique(array_filter(array_map(fn ($s) => Str::limit(trim((string) $s), 20, ''), $run), 'strlen')));
            $sizes = Sizes::sort(collect($sizes)->map(fn ($s) => ['title' => $s]))->pluck('title')->all();
            if (count($sizes) >= $min) $out[] = $sizes;
        }

        return $out;
    }

    /**
     * Selling price: cost + the percentage + a fixed amount per piece, to the
     * cent ($90 + 5% = $94.50). Either part may be 0 — "just add $15" is margin 0, fixed 15.
     */
    public static function priceCents(float $cost, int $margin, float $fixed = 0): int
    {
        // Worked in whole cents first: 90 × 1.10 in floating point is 99.00000000000001,
        // which a plain ceil() turned into $100.
        return (int) round($cost * (100 + $margin) + $fixed * 100);   // = (cost × (1 + margin%) + fixed) × 100, to the nearest cent
    }

    /**
     * Save it: supplier, product (import, no stock), one variant per size, the
     * photos, the series definition and — when publishing — one open series
     * per size run. Returns the series codes.
     *
     * @param  UploadedFile[]  $files
     */
    public static function create(array $d, array $files): array
    {
        $runs = self::cleanRuns($d['size_runs']);
        if (! $runs) throw new \InvalidArgumentException('Add at least two sizes.');
        $publish = (bool) $d['publish'];
        $sizes = array_values(array_unique(array_merge(...$runs)));

        return self::withPhotos($files, function (array $urls) use ($d, $runs, $publish, $sizes) {
            [$product, $variants, $price] = self::makeProduct($d, $urls, $sizes, $publish, 'import', []);

            $def = PackDefinition::create([
                'id'          => $defId = 'pdef_' . Str::random(16),
                'product_id'  => $product->id,
                'pack_kind'   => 'single',
                'title'       => $d['title'],
                'handle'      => Str::slug($d['title']) . '-' . substr($defId, -6),
                'description' => $d['description'] ?? null,
                'status'      => $publish ? 'published' : 'draft',
                'sourcing'    => 'import',
            ]);

            $codes = [];
            if ($publish) {
                $days = (int) ($d['open_days'] ?? 0);
                foreach ($runs as $run) {
                    $code = AdminPackController::makePublicCode();
                    $camp = PackCampaign::create([
                        'id'                 => 'pcam_' . Str::random(16),
                        'pack_definition_id' => $def->id,
                        'host_kind'          => 'admin',
                        'public_code'        => $code,
                        'status'             => 'open',
                        'title'              => count($runs) > 1 ? "{$d['title']} · sizes {$run[0]}–" . end($run) : $d['title'],
                        'expires_at'         => $days > 0 ? now()->addDays($days) : null,
                    ]);
                    foreach ($run as $size) {
                        PackSlot::create([
                            'id' => 'pslot_' . Str::random(16), 'pack_campaign_id' => $camp->id,
                            'variant_id' => $variants[$size], 'size_label' => $size, 'status' => 'available',
                        ]);
                    }
                    $codes[] = $code;
                }
            }

            self::remember((int) $d['margin'], (float) ($d['fixed'] ?? 0), isset($d['open_days']) ? (int) $d['open_days'] : null);

            return ['product_id' => $product->id, 'handle' => $product->handle, 'definition_id' => $def->id, 'codes' => $codes, 'price' => $price];
        });
    }

    /**
     * A single product sold piece by piece: one variant per size. Local stock
     * keeps a count per size; an import is bought to order and keeps none.
     *
     * @param  array<string,int>  $stock  size => quantity (local only)
     * @param  UploadedFile[]     $files
     */
    public static function createProduct(array $d, array $files): array
    {
        $sizes = self::cleanRuns([$d['sizes'] ?? []], 1)[0] ?? [];
        if (! $sizes) $sizes = ['One Size'];
        $publish = (bool) $d['publish'];
        $sourcing = ($d['sourcing'] ?? 'local') === 'import' ? 'import' : 'local';

        return self::withPhotos($files, function (array $urls) use ($d, $sizes, $publish, $sourcing) {
            [$product, , $price] = self::makeProduct($d, $urls, $sizes, $publish, $sourcing, (array) ($d['stock'] ?? []));
            self::remember((int) $d['margin'], (float) ($d['fixed'] ?? 0), null);

            return ['product_id' => $product->id, 'handle' => $product->handle, 'price' => $price, 'link' => url("/shop/{$product->handle}")];
        });
    }

    /** Photos are stored first (files can't join a transaction) and removed again if the save fails. */
    private static function withPhotos(array $files, \Closure $save): array
    {
        $urls = array_map(fn (UploadedFile $f) => Media::upload($f, 'products'), $files);
        try {
            return DB::transaction(fn () => $save($urls));
        } catch (\Throwable $e) {
            foreach ($urls as $u) Media::delete($u);
            throw $e;
        }
    }

    /** @return array{0: Product, 1: array<string,string>, 2: int} the product, size => variant id, price in cents */
    private static function makeProduct(array $d, array $urls, array $sizes, bool $publish, string $sourcing, array $stock): array
    {
        $price = self::priceCents((float) $d['cost'], (int) $d['margin'], (float) ($d['fixed'] ?? 0));
        $cost = (int) round((float) $d['cost'] * 100);
        $supplier = self::supplier($d);
        $id = 'prod_' . Str::random(16);
        $handle = Str::slug($d['title']) ?: 'piece';
        if (Product::withoutGlobalScopes()->where('handle', $handle)->exists()) $handle .= '-' . strtolower(Str::random(5));

        $product = Product::create([
            'id'             => $id,
            'title'          => $d['title'],
            'handle'         => $handle,
            'description'    => $d['description'] ?? null,
            'thumbnail'      => $urls[0] ?? null,
            'status'         => $publish ? 'published' : 'draft',
            'sourcing'       => $sourcing,
            'supplier_id'    => $supplier?->id,
            'origin_country' => $d['origin'] ?? null,
            'metadata'       => array_filter([
                'created_by'            => 'quick_' . ($d['kind'] ?? 'series'),
                'supplier_reference'    => $d['reference'] ?? null,
                'supplier_single_price' => isset($d['single_price']) && $d['single_price'] !== '' ? (float) $d['single_price'] : null,
                'ai_cost'               => isset($d['ai_cost']) && (float) $d['ai_cost'] > 0 ? round((float) $d['ai_cost'], 5) : null,
            ], fn ($v) => $v !== null),
        ]);
        if (! empty($d['catalogue_ids'])) $product->catalogues()->sync($d['catalogue_ids']);

        foreach ($urls as $i => $url) {
            ProductImage::create(['id' => 'img_' . Str::random(16), 'product_id' => $id, 'url' => $url, 'rank' => $i + 1]);
        }

        $variants = [];
        foreach (Sizes::sort(collect($sizes)->map(fn ($s) => ['title' => $s]))->pluck('title') as $size) {
            $local = $sourcing === 'local';
            $v = ProductVariant::create([
                'id'                 => 'var_' . Str::random(16),
                'product_id'         => $id,
                'title'              => $size,
                'sku'                => $handle . '-' . (Str::slug($size) ?: Str::random(4)),
                'manage_inventory'   => $local,           // a shelf count for stock here; imports are bought to order
                'inventory_quantity' => $local ? max(0, (int) ($stock[$size] ?? 0)) : 0,
                'cost_price'         => $cost,
            ]);
            VariantPrice::create(['id' => 'vpr_' . Str::random(12), 'variant_id' => $v->id, 'currency_code' => 'usd', 'amount' => $price]);
            $variants[$size] = $v->id;
        }

        return [$product, $variants, $price];
    }

    /** An existing supplier by id, or found by name, or a new one — with any new contact details kept. */
    private static function supplier(array $d): ?Supplier
    {
        $s = $d['supplier'] ?? [];
        $name = trim((string) ($s['name'] ?? ''));
        $found = ! empty($s['id']) ? Supplier::find($s['id']) : null;
        $found ??= $name !== '' ? Supplier::whereRaw('LOWER(name) = ?', [mb_strtolower($name)])->first() : null;
        if (! $found && $name === '') return null;

        $fields = array_filter([
            'name'    => $name ?: null,
            'phone'   => trim((string) ($s['phone'] ?? '')) ?: null,
            'link'    => trim((string) ($s['link'] ?? '')) ?: null,
            'country' => $d['origin'] ?? null,
        ]);
        if ($found) { $found->update($fields); return $found; }

        return Supplier::create(['id' => 'sup_' . Str::random(16)] + $fields);
    }
}
