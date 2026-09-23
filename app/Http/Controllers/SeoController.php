<?php

namespace App\Http\Controllers;

use App\Models\Catalogue;
use App\Models\Heading;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Response;
use Illuminate\Support\Str;

/**
 * SEO bits that need server-side rendering: sitemap.xml, the
 * meta-decorated storefront shell, and the product JSON-LD payload.
 *
 * The SPA still does the heavy lifting client-side — this controller
 * just pre-fills the <title>, OG/Twitter tags, and JSON-LD so crawlers
 * and social-card scrapers see the right thing without running JS.
 */
class SeoController extends Controller
{
    /** Static page meta — title + description for the SPA's main routes. */
    private const STATIC_META = [
        ''            => ['BLESSLUXE — Luxury Atelier', 'Curated drops, group buys and Bees loyalty for the BLESSLUXE woman.'],
        'shop'        => ['Shop — BLESSLUXE',           'Browse the latest BLESSLUXE arrivals across dresses, tops, bags and more.'],
        'help/returns' => ['Returns — BLESSLUXE',       'Unworn, tags on, within 30 days — and you can start it yourself from your account.'],
        'contact'      => ['Contact — BLESSLUXE',       'WhatsApp, email or phone. We reply within one working day.'],
        'terms'        => ['Terms & Conditions — BLESSLUXE', 'The agreement between us: prices, delivery, returns, series, Bees and the Hive.'],
        'shop/series' => ['Series — BLESSLUXE',         'Curated group buys. Claim your size before the series fills.'],
        'cart'        => ['Cart — BLESSLUXE',           'Review your bag before checkout.'],
        'wishlist'    => ['Wishlist — BLESSLUXE',       'Pieces you\'ve saved for later.'],
        'account'     => ['Account — BLESSLUXE',        'Manage your BLESSLUXE account, orders, Bees and addresses.'],
        'affiliate'   => ['Affiliate Programme — BLESSLUXE', 'Earn commission on every BLESSLUXE order shopped via your code.'],
        'hive'        => ['Bless Hive — real people, real fits', 'See how BLESSLUXE pieces look on people built like you. Share your looks, find your fit twins, follow the styles you love.'],
        'faq'         => ['FAQ — BLESSLUXE',            'Answers to the most-asked questions about shopping with BLESSLUXE.'],
        'track'       => ['Track Your Order — BLESSLUXE', 'Look up your BLESSLUXE order with your tracking code.'],
    ];

    /**
     * Catch-all for the storefront SPA. Picks meta off the path (product
     * lookup for /shop/{handle}, static map otherwise), passes it into
     * the Blade so Open Graph + Twitter cards work even when JS is off.
     */
    public function spa(Request $request, string $any = '')
    {
        $meta = $this->resolveMeta($any);
        return response()->view('store', ['meta' => $meta])
            // Crawlers see fresh meta on every fetch; humans get standard cache.
            ->header('Cache-Control', 'public, max-age=60');
    }

    /**
     * GET /sitemap.xml — emits published products + headings + catalogues
     * + the known static URLs. lastmod is taken from updated_at so Google
     * re-crawls when admin makes changes.
     */
    public function sitemap()
    {
        $base = rtrim(config('app.url', url('/')), '/');
        $now  = now()->toIso8601String();
        $urls = [];

        // Static priorities.
        $urls[] = ['loc' => $base . '/',              'lastmod' => $now, 'priority' => '1.0', 'changefreq' => 'daily'];
        foreach (['shop', 'shop/series', 'hive', 'affiliate', 'faq', 'track'] as $path) {
            $urls[] = ['loc' => $base . '/' . $path,  'lastmod' => $now, 'priority' => '0.8', 'changefreq' => 'weekly'];
        }

        // Headings.
        Heading::query()->where('is_active', true)
            ->orderBy('rank')
            ->get(['handle', 'updated_at'])
            ->each(function ($h) use (&$urls, $base) {
                $urls[] = [
                    'loc'        => $base . '/shop?heading=' . $h->handle,
                    'lastmod'    => optional($h->updated_at)->toIso8601String(),
                    'priority'   => '0.7',
                    'changefreq' => 'weekly',
                ];
            });

        // Catalogues.
        Catalogue::query()
            ->orderBy('rank')
            ->get(['handle', 'updated_at'])
            ->each(function ($c) use (&$urls, $base) {
                $urls[] = [
                    'loc'        => $base . '/shop?catalogue=' . $c->handle,
                    'lastmod'    => optional($c->updated_at)->toIso8601String(),
                    'priority'   => '0.7',
                    'changefreq' => 'weekly',
                ];
            });

        // Products. Skip drafts and archived.
        Product::query()->where('status', 'published')
            ->orderByDesc('updated_at')
            ->limit(5000)
            ->get(['handle', 'updated_at'])
            ->each(function ($p) use (&$urls, $base) {
                $urls[] = [
                    'loc'        => $base . '/shop/' . $p->handle,
                    'lastmod'    => optional($p->updated_at)->toIso8601String(),
                    'priority'   => '0.9',
                    'changefreq' => 'weekly',
                ];
            });

        $xml  = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
        $xml .= '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
        foreach ($urls as $u) {
            $xml .= "  <url>\n";
            $xml .= '    <loc>' . htmlspecialchars($u['loc'], ENT_XML1) . "</loc>\n";
            if (! empty($u['lastmod'])) $xml .= '    <lastmod>' . $u['lastmod'] . "</lastmod>\n";
            if (! empty($u['changefreq'])) $xml .= '    <changefreq>' . $u['changefreq'] . "</changefreq>\n";
            if (! empty($u['priority'])) $xml .= '    <priority>' . $u['priority'] . "</priority>\n";
            $xml .= "  </url>\n";
        }
        $xml .= "</urlset>\n";

        return Response::make($xml, 200, ['Content-Type' => 'application/xml; charset=utf-8']);
    }

    /**
     * Translate a request path into the meta payload the Blade layout
     * needs. Returns title, description, optional image + canonical, and
     * — for products — a JSON-LD payload so the page emits schema.org
     * Product markup.
     */
    private function resolveMeta(string $path): array
    {
        $path = trim($path, '/');
        $base = rtrim(config('app.url', url('/')), '/');
        $defaults = [
            'title'        => 'BLESSLUXE — Luxury Atelier',
            'description'  => 'Curated luxury women\'s fashion. Drops, group buys and Bees loyalty.',
            'image'        => $base . '/logo.png',
            'canonical'    => $base . '/' . $path,
            'type'         => 'website',
            'json_ld'      => null,
        ];

        // Product detail: /shop/{handle} but NOT a series listing nor /shop (the
        // index). Both spellings — /shop/packs links are still out in the world.
        if (Str::startsWith($path, 'shop/') && ! Str::startsWith($path, 'shop/packs') && ! Str::startsWith($path, 'shop/series')) {
            $handle = Str::after($path, 'shop/');
            // Strip any trailing query-ish bits if a router happened to pass them.
            $handle = Str::before($handle, '?');
            if ($handle && $handle !== 'packs') {
                $product = Product::query()
                    ->where('handle', $handle)
                    ->where('status', 'published')
                    ->with(['variants.prices' => fn ($q) => $q->where('currency_code', 'usd')])
                    ->first();
                if ($product) {
                    $price = optional($product->variants->first()?->prices->first())->amount;
                    $img = $product->thumbnail ?: $defaults['image'];
                    return [
                        'title'       => $product->title . ' — BLESSLUXE',
                        'description' => Str::limit(strip_tags((string) $product->description ?: $product->subtitle ?: 'Shop ' . $product->title . ' at BLESSLUXE.'), 160),
                        'image'       => $img,
                        'canonical'   => $base . '/shop/' . $product->handle,
                        'type'        => 'product',
                        'json_ld'     => [
                            '@context'    => 'https://schema.org/',
                            '@type'       => 'Product',
                            'name'        => $product->title,
                            'description' => Str::limit(strip_tags((string) $product->description ?: $product->subtitle ?: ''), 300),
                            'image'       => $img,
                            'sku'         => optional($product->variants->first())->sku,
                            'brand'       => ['@type' => 'Brand', 'name' => 'BLESSLUXE'],
                            'offers'      => $price !== null ? [
                                '@type'         => 'Offer',
                                'priceCurrency' => 'USD',
                                'price'         => number_format($price / 100, 2, '.', ''),
                                'availability'  => 'https://schema.org/InStock',
                                'url'           => $base . '/shop/' . $product->handle,
                            ] : null,
                        ],
                    ];
                }
            }
        }

        // Bless Hive page: /@handle. Links travel by WhatsApp, so the preview
        // card — her name, her photo — is most of what gets a page opened.
        if (Str::startsWith($path, '@')) {
            $page = \App\Services\Hive::byHandle(Str::after($path, '@'));
            if ($page) {
                // A local-disk URL is host-less (/storage/…); a preview needs absolute.
                $abs = fn (?string $u) => $u ? (Str::startsWith($u, '/') ? $base . $u : $u) : null;
                $cover = DB::table('hive_looks')->where('customer_id', $page->customer_id)->where('status', 'published')
                    ->orderByDesc('created_at')->value('images');
                $cover = $cover ? (json_decode((string) $cover, true)[0] ?? null) : null;

                return [
                    'title'       => "{$page->display_name} (@{$page->handle}) · Bless Hive",
                    'description' => Str::limit($page->bio ?: "See {$page->display_name}'s looks on Bless Hive — real people, real fits, from BLESSLUXE.", 160),
                    'image'       => $abs($cover) ?: $abs($page->avatar_url) ?: $defaults['image'],
                    'canonical'   => $base . '/@' . $page->handle,
                    'type'        => 'profile',
                    'json_ld'     => null,
                ];
            }
        }

        // A shared question: the question itself is the headline.
        if (Str::startsWith($path, 'hive/ask/')) {
            $ask = DB::table('hive_asks as a')->join('hive_profiles as p', 'p.customer_id', '=', 'a.customer_id')
                ->where('a.id', Str::after($path, 'hive/ask/'))->where('a.status', 'published')->whereNull('p.suspended_at')
                ->first(['a.id', 'a.question', 'a.images', 'p.display_name']);
            if ($ask) {
                $img = json_decode((string) ($ask->images ?? ''), true)[0] ?? null;

                return [
                    'title'       => Str::limit($ask->question, 90) . ' · Bless Hive',
                    'description' => "{$ask->display_name} is asking the Hive. Vote, or answer with a piece from BLESSLUXE.",
                    'image'       => $img ? (Str::startsWith($img, '/') ? $base . $img : $img) : $defaults['image'],
                    'canonical'   => $base . '/hive/ask/' . $ask->id,
                    'type'        => 'article',
                    'json_ld'     => null,
                ];
            }
        }
        if (Str::startsWith($path, 'hive/')) $path = 'hive';

        if (isset(self::STATIC_META[$path])) {
            [$title, $description] = self::STATIC_META[$path];
            return ['title' => $title, 'description' => $description, 'image' => $defaults['image'], 'canonical' => $defaults['canonical'], 'type' => 'website', 'json_ld' => null];
        }

        return $defaults;
    }
}
