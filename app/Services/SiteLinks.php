<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Which of the shop's fixed links are switched on — the nav entries beside the
 * catalogue menus, and the footer's help and company links.
 *
 * **Everything optional ships hidden.** Two different reasons:
 *   - Hive, Show Room and Sale are finished but are the owner's to launch, not
 *     ours to put in the menu on deploy day.
 *   - Most footer links point at pages the SPA has no route for (/contact,
 *     /about, /help/*), so they land on "page not found". A link to a 404 costs
 *     more trust than a missing link.
 *
 * Hiding a link never blocks its route: /hive still opens for anyone who has
 * the address. This is the menu, not a lock.
 *
 * Seeded on first read, the way Bees and Payments are.
 */
class SiteLinks
{
    public const KEY = 'site.links';

    /** key => [label, href, group, on by default]. `true` only where it's both built and launched. */
    public const ALL = [
        // Header, beside the catalogue menus.
        'series'    => ['Series',              '/shop/series',    'header',  true],
        'hive'      => ['Hive',                '/hive',           'header',  false],
        'showroom'  => ['Show Room',           '/showroom',       'header',  false],

        // Footer — help.
        'faq'       => ['FAQ',                 '/faq',            'help',    true],
        'track'     => ['Track an order',      '/track',          'help',    true],
        'shipping'  => ['Shipping',            '/help/shipping',  'help',    false],
        'returns'   => ['Returns',             '/help/returns',   'help',    false],
        'sizing'    => ['Size guide',          '/help/sizing',    'help',    false],
        'contact'   => ['Contact',             '/contact',        'help',    false],

        // Footer — company.
        'affiliate' => ['Affiliate programme', '/affiliate',      'company', true],
        'about'     => ['About',               '/about',          'company', false],
        'sustain'   => ['Sustainability',      '/sustainability', 'company', false],
        'careers'   => ['Careers',             '/careers',        'company', false],
        'press'     => ['Press',               '/press',          'company', false],
    ];

    /** @return array<string,bool> */
    public static function settings(): array
    {
        $raw = json_decode((string) DB::table('settings')->where('key', self::KEY)->value('value'), true);
        if (! is_array($raw)) {
            $raw = array_map(fn ($l) => $l[3], self::ALL);
            DB::table('settings')->updateOrInsert(['key' => self::KEY], ['value' => json_encode($raw), 'updated_at' => now()]);
        }

        $out = [];
        foreach (self::ALL as $key => $l) $out[$key] = (bool) ($raw[$key] ?? $l[3]);

        return $out;
    }

    /** Is this one link on? Cheap enough to ask per link. */
    public static function shows(string $key): bool
    {
        return (bool) (self::settings()[$key] ?? false);
    }

    /**
     * What the storefront renders, grouped the way it lays them out.
     *
     * @return array<string,array<int,array{key:string,label:string,href:string}>>
     */
    public static function visible(): array
    {
        $on = self::settings();
        $out = ['header' => [], 'help' => [], 'company' => []];
        foreach (self::ALL as $key => [$label, $href, $group, $default]) {
            if ($on[$key]) $out[$group][] = ['key' => $key, 'label' => $label, 'href' => $href];
        }

        return $out;
    }

    /** Every link with its state, for the admin screen. */
    public static function forAdmin(): array
    {
        $on = self::settings();
        $out = [];
        foreach (self::ALL as $key => [$label, $href, $group, $default]) {
            $out[] = ['key' => $key, 'label' => $label, 'href' => $href, 'group' => $group, 'shown' => $on[$key]];
        }

        return $out;
    }

    /** @param array<string,bool> $patch */
    public static function setConfig(array $patch): array
    {
        $next = self::settings();
        foreach ($patch as $key => $value) {
            if (array_key_exists($key, self::ALL)) $next[$key] = (bool) $value;
        }
        DB::table('settings')->updateOrInsert(['key' => self::KEY], ['value' => json_encode($next), 'updated_at' => now()]);

        return $next;
    }
}
