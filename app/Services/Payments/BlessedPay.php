<?php

namespace App\Services\Payments;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * HTTP client for BlessedPay (pay.blessluxe.com), BLESSLUXE's own payments app.
 * It is the one that talks to TN CyberTech Bank; the shop only knows this API:
 *
 *   POST /api/v1/payments        start a payment → id + redirect_url
 *   GET  /api/v1/payments/{id}   what happened to it
 *   callback                     BlessedPay posts the outcome to us, signed
 *
 * Auth is `Authorization: Bearer sk_live_…` (or sk_test_… — the key decides
 * test or live). A callback is signed
 *   X-BlessedPay-Signature: t=<unix time>,v1=<hex hmac-sha256 of "<t>.<raw body>">
 * with the company's signing secret (shown on the company page in the console).
 */
class BlessedPay
{
    /** A callback older than this is refused: a captured one can't be replayed later. */
    public const SIGNATURE_WINDOW = 300;

    public function __construct(
        private string $baseUrl,
        private string $apiKey,
        private string $signingSecret,
        private int $timeout = 20,
    ) {}

    public static function configured(): bool
    {
        $c = (array) config('services.blessedpay');

        return filled($c['api_key'] ?? null) && filled($c['signing_secret'] ?? null) && filled($c['base_url'] ?? null);
    }

    public static function fromConfig(): self
    {
        $c = (array) config('services.blessedpay');

        return new self(rtrim((string) ($c['base_url'] ?? ''), '/'), (string) ($c['api_key'] ?? ''), (string) ($c['signing_secret'] ?? ''), (int) ($c['timeout'] ?? 20));
    }

    /** A test key means a pretend bank: nothing here can take real money. */
    public function isTest(): bool
    {
        return str_starts_with($this->apiKey, 'sk_test_');
    }

    /**
     * Start a payment. The reference doubles as the idempotency key, so a
     * retried request can never start a second payment for the same order.
     *
     * @return array{ok:bool, payment:?array, error:?string, raw:string}
     */
    public function create(array $body): array
    {
        return $this->call('post', '/api/v1/payments', $body, ['Idempotency-Key' => (string) $body['reference']]);
    }

    /** @return array{ok:bool, payment:?array, error:?string, raw:string} */
    public function find(string $paymentId): array
    {
        return $this->call('get', '/api/v1/payments/' . rawurlencode($paymentId));
    }

    /**
     * Is this callback really from BlessedPay, and recent? `$raw` must be the
     * body exactly as it arrived — re-encoding it would change the signature.
     */
    public function verifies(?string $header, string $raw): bool
    {
        if (! preg_match('/^t=(\d+),v1=([0-9a-f]{64})$/', (string) $header, $m)) return false;
        if (abs(time() - (int) $m[1]) > self::SIGNATURE_WINDOW) return false;

        return hash_equals(hash_hmac('sha256', $m[1] . '.' . $raw, $this->signingSecret), $m[2]);
    }

    private function call(string $method, string $path, array $body = [], array $headers = []): array
    {
        try {
            $response = Http::baseUrl($this->baseUrl)->acceptJson()->asJson()->withToken($this->apiKey)
                ->withHeaders($headers)->timeout($this->timeout)->connectTimeout(8)->{$method}($path, $body);
        } catch (\Throwable $e) {
            Log::warning('[blessedpay] unreachable', ['path' => $path, 'error' => $e->getMessage()]);

            return ['ok' => false, 'payment' => null, 'error' => 'The payment service could not be reached. Please try again in a moment.', 'raw' => ''];
        }

        $data = $response->json();
        if ($response->successful() && is_array($data) && isset($data['id'])) {
            return ['ok' => true, 'payment' => $data, 'error' => null, 'raw' => $response->body()];
        }

        // Their words when they have some: {"error": {"code", "message"}} or a validation {"message"}.
        $said = is_array($data) ? ($data['error']['message'] ?? $data['message'] ?? null) : null;

        return ['ok' => false, 'payment' => null, 'error' => is_string($said) && $said !== '' ? $said : 'The payment could not be started. Please try another way to pay.', 'raw' => $response->body()];
    }
}
