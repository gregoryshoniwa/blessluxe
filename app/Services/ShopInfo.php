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
        'company_name' => ['Registered name',  'BLESSLUXE', 'The name on the terms'],
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
            $out[] = ['key' => $key, 'label' => $label, 'hint' => $hint, 'value' => $values[$key]];
        }

        return $out;
    }

    /** @param array<string,string> $patch */
    public static function setConfig(array $patch): array
    {
        $next = self::all();
        foreach ($patch as $key => $value) {
            if (array_key_exists($key, self::FIELDS)) $next[$key] = trim((string) $value);
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
