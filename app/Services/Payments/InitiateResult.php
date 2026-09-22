<?php

namespace App\Services\Payments;

/**
 * What starting a payment gave us. Exactly one of these is true:
 *   - `redirectUrl` is set: send the customer there.
 *   - `instruction` is set: the customer stays with us and does something
 *     elsewhere (approves a USSD prompt); we poll.
 * A failed start is `ok = false` with a message fit to show a person.
 */
final class InitiateResult
{
    private function __construct(
        public readonly bool $ok,
        public readonly ?string $redirectUrl = null,
        public readonly ?string $instruction = null,
        public readonly ?string $pollHandle = null,
        public readonly ?string $providerReference = null,
        public readonly array $meta = [],
        public readonly string $raw = '',
        public readonly ?string $error = null,
    ) {}

    public static function redirect(string $url, ?string $pollHandle, ?string $providerReference = null, array $meta = [], string $raw = ''): self
    {
        return new self(true, redirectUrl: $url, pollHandle: $pollHandle, providerReference: $providerReference, meta: $meta, raw: $raw);
    }

    public static function wait(string $instruction, ?string $pollHandle, ?string $providerReference = null, array $meta = [], string $raw = ''): self
    {
        return new self(true, instruction: $instruction, pollHandle: $pollHandle, providerReference: $providerReference, meta: $meta, raw: $raw);
    }

    public static function failed(string $error, string $raw = ''): self
    {
        return new self(false, error: $error, raw: $raw);
    }
}
