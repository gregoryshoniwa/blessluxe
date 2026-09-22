<?php

namespace App\Services\Payments;

/** A provider's word on a payment, normalised. `status` is paid | pending | cancelled | failed. */
final class StatusResult
{
    public const PAID = 'paid';
    public const PENDING = 'pending';
    public const CANCELLED = 'cancelled';
    public const FAILED = 'failed';

    public function __construct(
        public readonly string $reference,           // OUR reference
        public readonly string $status,
        public readonly ?string $providerStatus = null,
        public readonly ?string $providerReference = null,
        public readonly ?string $pollHandle = null,
        public readonly array $meta = [],
        public readonly string $raw = '',
    ) {}

    public function isFinal(): bool
    {
        return $this->status !== self::PENDING;
    }
}
