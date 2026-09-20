<?php

return [

    /*
    |--------------------------------------------------------------------------
    | STUN servers
    |--------------------------------------------------------------------------
    |
    | STUN only tells a peer what its public address is. It is free, stateless
    | and carries no media, which is why public servers are fine here. Roughly
    | 80–85% of calls connect peer-to-peer on STUN alone.
    |
    */

    'stun' => [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
    ],

    /*
    |--------------------------------------------------------------------------
    | TURN server
    |--------------------------------------------------------------------------
    |
    | TURN relays the actual media when a direct path cannot be found —
    | symmetric NAT, corporate firewalls, some mobile carriers. That is the
    | other 15–20% of calls, and without it those calls ring and then fail to
    | connect, which is a far more confusing failure than "calling is off".
    |
    | It costs bandwidth, so it is deliberately opt-in: leave TURN_URL unset and
    | calling still works for most networks. `Rtc::iceServers()` reports whether
    | a relay is configured so the UI can be honest about it rather than
    | pretending every call will connect.
    |
    | Two credential styles are supported:
    |   static — TURN_USERNAME / TURN_CREDENTIAL, as used by most managed TURN.
    |   hmac   — TURN_SECRET, the coturn `use-auth-secret` scheme, where the
    |            username is an expiry timestamp and the password is an HMAC of
    |            it. Preferred: credentials handed to a browser are short-lived,
    |            so a leaked bundle cannot be used to relay traffic for free.
    |
    */

    'turn' => [
        'urls'       => array_values(array_filter(array_map('trim', explode(',', (string) env('TURN_URL', ''))))),
        'username'   => env('TURN_USERNAME'),
        'credential' => env('TURN_CREDENTIAL'),
        'secret'     => env('TURN_SECRET'),
        'ttl'        => (int) env('TURN_TTL', 3600),
    ],

    /*
    |--------------------------------------------------------------------------
    | Call limits
    |--------------------------------------------------------------------------
    |
    | `ring_seconds` is how long an unanswered call rings before both sides give
    | up. Without it a caller sits on a hopeful spinner forever when the other
    | side simply has no tab open.
    |
    */

    'ring_seconds' => (int) env('CALL_RING_SECONDS', 45),

];
