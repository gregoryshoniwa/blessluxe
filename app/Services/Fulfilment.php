<?php

namespace App\Services;

use App\Support\Address;
use Illuminate\Support\Facades\DB;

/**
 * Where a pack consignment ships to, and where buyers collect from.
 *
 * Mirrors App\Services\Bees: settings live in the `settings` key/value table and
 * self-seed on first read, so an admin screen always has something to render.
 *
 * Deliberately NOT config/env. The hub address has to be editable without a deploy,
 * and — more importantly — it must be SNAPSHOTTED onto each consignment's
 * shipping_address at dispatch, so a historical package keeps the address it
 * actually shipped to even after the hub moves. Config cannot do that.
 */
class Fulfilment
{
    // Goods travel supplier (Turkey/China) -> COURIER -> BLESSLUXE -> buyer.
    // The consignment is consigned to the courier's depot, which is the address
    // that goes on the shipment; BLESSLUXE then collects from there.
    public const KEY_HUB_ADDRESS      = 'fulfilment.hub_address';   // courier depot
    public const KEY_HUB_NAME         = 'fulfilment.hub_name';      // courier name
    public const KEY_HUB_EMAIL        = 'fulfilment.hub_email';
    public const KEY_HUB_PHONE        = 'fulfilment.hub_phone';
    public const KEY_COURIER_ACCOUNT  = 'fulfilment.courier_account';
    public const KEY_COLLECTION_POINT = 'fulfilment.collection_point';
    public const KEY_COLLECTION_HOURS = 'fulfilment.collection_hours';
    public const KEY_FORWARD_FEE      = 'fulfilment.forward_fee_default';
    public const KEY_FORWARD_FEE_BY_COUNTRY = 'fulfilment.forward_fee_by_country';

    public static function settings(): array
    {
        $defaults = [
            self::KEY_COURIER_ACCOUNT  => '',
            self::KEY_HUB_NAME         => 'BLESSLUXE',
            self::KEY_HUB_EMAIL        => (string) config('mail.from.address', ''),
            self::KEY_HUB_PHONE        => '',
            // Empty by design: an operator must enter a real address. Dispatch is
            // blocked until they do, rather than shipping to a plausible default.
            self::KEY_HUB_ADDRESS      => json_encode([]),
            self::KEY_COLLECTION_POINT => '',
            self::KEY_COLLECTION_HOURS => '',
            self::KEY_FORWARD_FEE      => '2500',
            self::KEY_FORWARD_FEE_BY_COUNTRY => json_encode(['*' => 2500]),
        ];

        $rows = DB::table('settings')->whereIn('key', array_keys($defaults))->pluck('value', 'key')->all();
        foreach ($defaults as $k => $v) {
            if (! array_key_exists($k, $rows)) {
                DB::table('settings')->updateOrInsert(['key' => $k], ['value' => $v, 'updated_at' => now()]);
                $rows[$k] = $v;
            }
        }

        return [
            'courier_account'  => $rows[self::KEY_COURIER_ACCOUNT] ?: null,
            'hub_name'         => $rows[self::KEY_HUB_NAME] ?: 'BLESSLUXE',
            'hub_email'        => $rows[self::KEY_HUB_EMAIL] ?: null,
            'hub_phone'        => $rows[self::KEY_HUB_PHONE] ?: null,
            'hub_address'      => Address::normalize(json_decode($rows[self::KEY_HUB_ADDRESS] ?: '[]', true) ?: []),
            'collection_point' => $rows[self::KEY_COLLECTION_POINT] ?: null,
            'collection_hours' => $rows[self::KEY_COLLECTION_HOURS] ?: null,
            'forward_fee'      => (int) $rows[self::KEY_FORWARD_FEE],
            'forward_fee_by_country' => json_decode($rows[self::KEY_FORWARD_FEE_BY_COUNTRY] ?: '{}', true) ?: [],
        ];
    }

    public static function setConfig(array $patch): array
    {
        $allowed = [
            self::KEY_COURIER_ACCOUNT,
            self::KEY_HUB_NAME, self::KEY_HUB_EMAIL, self::KEY_HUB_PHONE,
            self::KEY_HUB_ADDRESS, self::KEY_COLLECTION_POINT,
            self::KEY_COLLECTION_HOURS, self::KEY_FORWARD_FEE,
            self::KEY_FORWARD_FEE_BY_COUNTRY,
        ];

        foreach ($patch as $key => $value) {
            if (! in_array($key, $allowed, true)) continue;
            if (is_array($value)) $value = json_encode($value);
            DB::table('settings')->updateOrInsert(['key' => $key], [
                'value' => (string) $value, 'updated_at' => now(),
            ]);
        }

        return self::settings();
    }

    /**
     * True when the hub has an address good enough to put on a parcel.
     *
     * Dispatch is blocked on this. Shipping a consignment to a blank address is
     * unrecoverable — the goods are gone and nobody knows where.
     */
    public static function hubIsShippable(): bool
    {
        $s = self::settings();

        return $s['hub_address']['line1'] !== null && $s['hub_address']['city'] !== null;
    }

    /** The forwarding fee for a destination country, in cents. */
    public static function forwardFeeFor(?string $countryCode, ?int $campaignOverride = null): int
    {
        if ($campaignOverride !== null) return $campaignOverride;

        $s   = self::settings();
        $map = $s['forward_fee_by_country'];
        $cc  = strtoupper((string) $countryCode);

        return (int) ($map[$cc] ?? $map['*'] ?? $s['forward_fee']);
    }
}
