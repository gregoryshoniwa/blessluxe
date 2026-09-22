<?php

namespace App\Services\Payments;

/**
 * The ways a customer can pay, as THEY think of them. Gateways declare which
 * of these they take; staff route each one to a gateway (or switch it off).
 */
class Method
{
    public const ECOCASH  = 'ecocash';
    public const ONEMONEY = 'onemoney';
    public const INNBUCKS = 'innbucks';
    public const ZIPIT    = 'zipit';
    public const CARD     = 'card';

    /** Display order, labels and the icon the checkout shows. */
    public const ALL = [
        self::ECOCASH  => ['label' => 'EcoCash',          'hint' => 'Approve on your phone',        'icon' => 'smartphone'],
        self::ONEMONEY => ['label' => 'OneMoney',         'hint' => 'Approve on your phone',        'icon' => 'smartphone'],
        self::INNBUCKS => ['label' => 'InnBucks',         'hint' => 'Pay from your InnBucks wallet', 'icon' => 'wallet'],
        self::ZIPIT    => ['label' => 'ZIPIT',            'hint' => 'Bank-to-bank transfer',         'icon' => 'landmark'],
        self::CARD     => ['label' => 'Visa / Mastercard', 'hint' => 'Debit or credit card',         'icon' => 'credit-card'],
    ];

    public static function ids(): array
    {
        return array_keys(self::ALL);
    }

    public static function label(string $id): string
    {
        return self::ALL[$id]['label'] ?? ucfirst($id);
    }

    public static function valid(?string $id): bool
    {
        return $id !== null && isset(self::ALL[$id]);
    }
}
