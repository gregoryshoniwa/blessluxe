<?php

/**
 * Delivery-estimate defaults.
 *
 * packages.estimated_delivery_at is admin-entered and usually null, so "when will
 * it arrive?" — the single thing customers most want from a tracking page — has no
 * answer right after purchase, which is exactly when they ask. These values let us
 * offer an honest estimated WINDOW until an admin sets a real date.
 *
 * A window is deliberate: a fake-precise single date that turns out wrong generates
 * more support contact than no date at all. Anything derived from here is flagged
 * `is_estimate: true` so the UI can word it as an estimate.
 */
return [

    // Days between payment and handing the parcel to a carrier.
    'processing_days' => 2,

    // Carrier time, once dispatched.
    'transit_days' => [
        'domestic'      => 3,
        'international' => 10,
    ],

    // Anything else is treated as international.
    'domestic_country' => 'ZW',

    // Half-width of the estimated window, in days: an estimate of day 7 with a
    // spread of 2 renders as "between day 5 and day 9".
    'estimate_spread_days' => 2,
];
