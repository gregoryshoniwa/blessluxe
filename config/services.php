<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // OAuth (Socialite) — Google sign-in for storefront customers.
    // The callback follows APP_URL unless GOOGLE_REDIRECT_URI overrides it, so
    // each environment gets the right host (and https behind Cloudflare).
    'google' => [
        'client_id'     => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect'      => env('GOOGLE_REDIRECT_URI')
            ?: rtrim((string) env('APP_URL'), '/') . '/api/account/oauth/google/callback',
    ],

    /*
    | Payment gateways. Credentials live HERE (env), never in the database —
    | which gateway is switched on, and which method routes where, is set by
    | staff at /admin/payments and stored in `settings`. See App\Services\Payments.
    */
    'paynow' => [
        'id'                  => env('PAYNOW_INTEGRATION_ID'),
        'key'                 => env('PAYNOW_INTEGRATION_KEY'),
        'result_url'          => env('PAYNOW_RESULT_URL'),
        'return_url'          => env('PAYNOW_RETURN_URL'),
        'auth_email_override' => env('PAYNOW_AUTH_EMAIL_OVERRIDE'),
    ],
    'velocityafrica' => [
        'api_key'          => env('VELOCITY_API_KEY'),
        'base_url'         => env('VELOCITY_BASE_URL', 'https://api.velocityafrica.net'),
        // The wallet that RECEIVES the money (creditPhone / creditAccount on every transaction).
        'merchant_phone'   => env('VELOCITY_MERCHANT_PHONE'),
        'merchant_account' => env('VELOCITY_MERCHANT_ACCOUNT'),
        'region'           => env('VELOCITY_REGION', 'ZW'),
        // Every charge is one sales-order line with this item code. If Velocity
        // insists the code exists in its inventory, create it there once.
        'item_code'        => env('VELOCITY_ITEM_CODE', 'BLESSLUXE-ORDER'),
    ],
];
