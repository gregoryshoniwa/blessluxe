<?php

namespace App\Services\Payments;

/** What we want to charge, in gateway-neutral terms. Amounts are integer cents. */
final class PaymentIntent
{
    public function __construct(
        public readonly string $reference,
        public readonly string $kind,            // order | exclusivity | pack_forwarding
        public readonly int $amountCents,
        public readonly string $currency,        // 'usd'
        public readonly ?string $email = null,
        public readonly ?string $phone = null,
        public readonly ?string $name = null,
        public readonly ?string $method = null,  // Method::* or null when the gateway's page decides
        public readonly string $description = 'BLESSLUXE',
        public readonly ?string $returnUrl = null,
    ) {}

    public function amountMajor(): float
    {
        return round($this->amountCents / 100, 2);
    }
}
