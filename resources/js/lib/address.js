// Mirror of app/Support/Address.php.
//
// Two address shapes exist in this app: orders.shipping_address uses
// {address1, address2, province}, customer_addresses uses {line1, line2, region}.
// Read paths accept both so neither panel renders blank.

const COUNTRY_NAMES = {
    zimbabwe: 'ZW',
    'south africa': 'ZA',
    'united states': 'US',
    'united states of america': 'US',
    usa: 'US',
    'united kingdom': 'GB',
    'great britain': 'GB',
    england: 'GB',
    botswana: 'BW',
    zambia: 'ZM',
    mozambique: 'MZ',
    namibia: 'NA',
    malawi: 'MW',
};

/** Free-text country -> ISO-3166 alpha-2, or null when we can't tell. */
export function countryCode(country) {
    const c = String(country ?? '').trim();
    if (!c) return null;
    if (c.length === 2) return c.toUpperCase();
    return COUNTRY_NAMES[c.toLowerCase()] ?? null;
}

/** Fold either shape into the canonical one. Every key present, null where unknown. */
export function normalize(addr) {
    const a = addr || {};
    const pick = (...keys) => {
        for (const k of keys) {
            const v = String(a[k] ?? '').trim();
            if (v) return v;
        }
        return null;
    };

    return {
        first_name: pick('first_name', 'firstName'),
        last_name: pick('last_name', 'lastName'),
        phone: pick('phone', 'phone_number'),
        line1: pick('line1', 'address1'),
        line2: pick('line2', 'address2'),
        city: pick('city', 'town'),
        region: pick('region', 'province', 'state'),
        postal_code: pick('postal_code', 'postcode', 'zip'),
        country: countryCode(pick('country', 'country_code')),
    };
}

/** Display lines with blanks dropped. */
export function addressLines(addr) {
    if (!addr) return [];
    const a = normalize(addr);

    return [
        [a.first_name, a.last_name].filter(Boolean).join(' '),
        a.line1,
        a.line2,
        [a.city, a.region, a.postal_code].filter(Boolean).join(', '),
        a.country,
    ].filter((l) => String(l ?? '').trim() !== '');
}
