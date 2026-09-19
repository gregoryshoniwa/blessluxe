<?php

/**
 * Carrier registry — display names and tracking-URL templates.
 *
 * Baymard's tracking research finds an unlinked tracking number is one of the most
 * common failures: customers expect to click it, not copy it. `{n}` is replaced with
 * the tracking number by App\Services\Carriers::trackingUrl().
 *
 * `url => null` means the carrier is known but has no online tracking (local courier,
 * hand delivery). Those render as a plain number, never as a dead link.
 *
 * This is config rather than a class constant so an operator can add a carrier without
 * a code change. NOTE: with `config:cache` in production, adding one needs
 * `php artisan config:clear`.
 */
return [

    // ─── Zimbabwe / regional ───────────────────────────────────────────
    'zimpost' => [
        'label' => 'Zimpost',
        'url'   => 'https://www.zimpost.co.zw/track-and-trace/?code={n}',
    ],
    'swift' => [
        'label' => 'Swift Transport',
        'url'   => null,
    ],

    // ─── International ─────────────────────────────────────────────────
    'dhl' => [
        'label' => 'DHL',
        'url'   => 'https://www.dhl.com/zw-en/home/tracking/tracking-express.html?submit=1&tracking-id={n}',
    ],
    'fedex' => [
        'label' => 'FedEx',
        'url'   => 'https://www.fedex.com/fedextrack/?trknbr={n}',
    ],
    'ups' => [
        'label' => 'UPS',
        'url'   => 'https://www.ups.com/track?tracknum={n}',
    ],
    'aramex' => [
        'label' => 'Aramex',
        'url'   => 'https://www.aramex.com/us/en/track/results?mode=0&ShipmentNumber={n}',
    ],

    // ─── Handled by us ─────────────────────────────────────────────────
    'inhouse' => [
        'label' => 'BLESSLUXE courier',
        'url'   => null,
    ],
    'manual' => [
        'label' => 'Hand delivery',
        'url'   => null,
    ],
];
