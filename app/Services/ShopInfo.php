<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * The details a shopper needs to reach us, and the facts the policy pages
 * quote. Staff edit them at /admin/content; nothing is invented in a template.
 *
 * A channel that hasn't been filled in simply isn't offered — a Contact page
 * listing a phone number nobody answers is worse than one that doesn't.
 */
class ShopInfo
{
    public const KEY = 'shop.info';

    /** field => [label, default, hint for staff] */
    public const FIELDS = [
        'email'        => ['Email',            '', 'Answered within one working day'],
        'whatsapp'     => ['WhatsApp',         '', 'In international form, e.g. +263771234567'],
        'phone'        => ['Phone',            '', 'Shown as a tel: link'],
        'address'      => ['Address',          '', 'Where orders are collected from'],
        'hours'        => ['Opening hours',    '', 'e.g. Mon–Fri 9am–5pm, Sat 9am–1pm'],
        'response'     => ['Response time',    'We reply within one working day.', 'Set expectations, then keep to them'],
        // Where the brand lives off the site. Shown in the footer and on Contact.
        'instagram'    => ['Instagram',        'https://www.instagram.com/bless_luxe/', 'Full link to the profile'],
        'facebook'     => ['Facebook',         'https://www.facebook.com/profile.php?id=61594056316362', 'Full link to the page'],
        'tiktok'       => ['TikTok',           'https://www.tiktok.com/@blessluxeconnect', 'Full link to the profile'],
        'youtube'      => ['YouTube',          'https://www.youtube.com/@Bless-LuxeConnect', 'Full link to the channel'],
        'company_name' => ['Registered name',  'BLESSLUXE', 'The name on the terms'],
        // The home page's non-department tiles. Set by upload, never typed.
        'tile_series_image' => ['Series tile image', '', 'Portrait, 3:4 — shown on the home page'],
        'tile_hive_image'   => ['Hive tile image',   '', 'Portrait, 3:4 — shown once the Hive is launched'],
        'registration' => ['Company number',   '', 'If registered'],
    ];

    /** @return array<string,string> */
    public static function all(): array
    {
        $raw = json_decode((string) DB::table('settings')->where('key', self::KEY)->value('value'), true);
        if (! is_array($raw)) {
            $raw = array_map(fn ($f) => $f[1], self::FIELDS);
            DB::table('settings')->updateOrInsert(['key' => self::KEY], ['value' => json_encode($raw), 'updated_at' => now()]);
        }

        $out = [];
        foreach (self::FIELDS as $key => $f) $out[$key] = trim((string) ($raw[$key] ?? $f[1]));

        return $out;
    }

    /** Everything staff can edit, with its label and hint. */
    public static function forAdmin(): array
    {
        $values = self::all();
        $out = [];
        foreach (self::FIELDS as $key => [$label, $default, $hint]) {
            $out[] = ['key' => $key, 'label' => $label, 'hint' => $hint, 'value' => $values[$key], 'image' => in_array($key, self::IMAGES, true)];
        }

        return $out;
    }

    /** @param array<string,string> $patch */
    public const SOCIALS = ['instagram', 'facebook', 'tiktok', 'youtube'];
    public const IMAGES  = ['tile_series_image', 'tile_hive_image'];

    public static function setConfig(array $patch): array
    {
        $next = self::all();
        foreach ($patch as $key => $value) {
            if (! array_key_exists($key, self::FIELDS)) continue;
            $value = trim((string) $value);
            // A social link is either a real https address or nothing — never text that ends up in an href.
            if (in_array($key, self::SOCIALS, true) && $value !== '' && ! preg_match('~^https://[a-z0-9.-]+\.[a-z]{2,}(/.*)?$~i', $value)) continue;
            // An image field holds one of OUR files or nothing — never a URL someone typed.
            if (in_array($key, self::IMAGES, true) && $value !== '' && Media::key($value) === null) continue;
            $next[$key] = $value;
        }
        DB::table('settings')->updateOrInsert(['key' => self::KEY], ['value' => json_encode($next), 'updated_at' => now()]);

        return self::all();
    }

    /** The facts the policy pages quote, so a page never states a rule the code doesn't keep. */
    public static function policy(): array
    {
        return [
            'return_window_days' => 30,                       // ReturnController::WINDOW_DAYS
            'local_eta'          => Couriers::PROMISE[Couriers::LOCAL]['eta'],
            'import_eta'         => Couriers::PROMISE[Couriers::IMPORT]['eta'],
            'bees_per_usd'       => Bees::settings()['per_usd'],
            'max_bees_percent'   => Bees::settings()['max_discount_percent'],
        ];
    }
}
