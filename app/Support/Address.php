<?php

namespace App\Support;

/**
 * Address shapes in this app disagree, for historical reasons:
 *
 *   orders.shipping_address   {address1, address2, city, province, postal_code, country}
 *                             — written verbatim from the checkout client. No name, no phone,
 *                               and `country` is a free-text label like "Zimbabwe".
 *   customer_addresses        {first_name, last_name, phone, line1, line2, city, region,
 *                              postal_code, country}  — country is char(2) ISO.
 *
 * `customer_addresses` is the strict superset, so it is the canonical shape and the only
 * one that can produce a carrier label. Everything that reads an address goes through
 * normalize() so both spellings work and nothing has to rewrite historical order snapshots.
 */
class Address
{
    /**
     * Country names we can reach today (regions.countries), plus the neighbours we
     * actually ship to. Anything already 2 characters passes straight through, so an
     * unknown name degrades to null rather than to a wrong code.
     */
    private const COUNTRY_NAMES = [
        'zimbabwe'                 => 'ZW',
        'south africa'             => 'ZA',
        'united states'            => 'US',
        'united states of america' => 'US',
        'usa'                      => 'US',
        'united kingdom'           => 'GB',
        'great britain'            => 'GB',
        'england'                  => 'GB',
        'botswana'                 => 'BW',
        'zambia'                   => 'ZM',
        'mozambique'               => 'MZ',
        'namibia'                  => 'NA',
        'malawi'                   => 'MW',
    ];

    /**
     * Fold any of the shapes above into the canonical one.
     *
     * Accepts a JSON string or an array; returns an array with every canonical key
     * present (null where unknown) so callers never have to null-check individual keys.
     */
    public static function normalize(array|string|null $addr): array
    {
        if (is_string($addr)) {
            $addr = json_decode($addr, true);
        }
        $addr = is_array($addr) ? $addr : [];

        $pick = function (array $keys) use ($addr): ?string {
            foreach ($keys as $k) {
                $v = trim((string) ($addr[$k] ?? ''));
                if ($v !== '') return $v;
            }
            return null;
        };

        return [
            'first_name'  => $pick(['first_name', 'firstName']),
            'last_name'   => $pick(['last_name', 'lastName']),
            'phone'       => $pick(['phone', 'phone_number']),
            'line1'       => $pick(['line1', 'address1']),
            'line2'       => $pick(['line2', 'address2']),
            'city'        => $pick(['city', 'town']),
            'region'      => $pick(['region', 'province', 'state']),
            'postal_code' => $pick(['postal_code', 'postcode', 'zip']),
            'country'     => self::countryCode($pick(['country', 'country_code'])),
        ];
    }

    /**
     * Free-text country -> ISO-3166 alpha-2.
     *
     * The naive substr(…, 0, 2) this replaces turned "Zimbabwe" into "ZI", which is not
     * a country. Unknown names return null: a missing country is recoverable, a wrong
     * one silently mis-routes a parcel.
     */
    public static function countryCode(?string $country): ?string
    {
        $c = trim((string) $country);
        if ($c === '') return null;
        if (strlen($c) === 2) return strtoupper($c);

        return self::COUNTRY_NAMES[strtolower($c)] ?? null;
    }

    /** True when there is enough here to put on a parcel: a name, a street and a city. */
    public static function isShippable(array|string|null $addr): bool
    {
        $a = self::normalize($addr);

        return $a['line1'] !== null
            && $a['city'] !== null
            && ($a['first_name'] !== null || $a['last_name'] !== null);
    }

    /** Display lines, blanks dropped — for emails, admin panels and the storefront. */
    public static function lines(array|string|null $addr): array
    {
        $a = self::normalize($addr);

        return array_values(array_filter([
            trim((string) ($a['first_name'] . ' ' . $a['last_name'])),
            $a['line1'],
            $a['line2'],
            implode(', ', array_filter([$a['city'], $a['region'], $a['postal_code']])),
            $a['country'],
        ], fn ($l) => trim((string) $l) !== ''));
    }
}
