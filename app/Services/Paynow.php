<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

/**
 * Paynow web-integration helpers — straight PHP port of the Node lib in
 * backend/shop/src/lib/paynow.ts. Same hash spec, same flow:
 *
 *   1. POST /interface/initiatetransaction  → { browserurl, pollurl, hash }
 *   2. Redirect customer to browserurl. They pay.
 *   3. Paynow POSTs status to our resulturl (IPN). We verify hash + persist.
 *   4. Paynow redirects customer back to our returnurl. We finalise.
 *   5. Optionally POST {} to pollurl to re-fetch the current status.
 *
 * Hash spec (https://developers.paynow.co.zw/docs/paynow/generating_hash/):
 *   Concatenate the URL-decoded VALUES of every field except `hash` in the
 *   order they appear in the request, append the integration key, SHA512,
 *   uppercase hex.
 */
class Paynow
{
    public const INITIATE_URL = 'https://www.paynow.co.zw/interface/initiatetransaction';

    public function __construct(
        public string  $integrationId,
        public string  $integrationKey,
        public string  $resultUrl,
        public string  $returnUrl,
        public ?string $authEmailOverride = null,
    ) {}

    /**
     * Read configuration from env. Throws if either core var is missing —
     * fail fast at init time rather than silently when the customer clicks
     * Pay.
     */
    public static function fromConfig(): self
    {
        $id  = trim((string) env('PAYNOW_INTEGRATION_ID'));
        $key = trim((string) env('PAYNOW_INTEGRATION_KEY'));
        $resultUrl = trim((string) env('PAYNOW_RESULT_URL'));
        $returnUrl = trim((string) env('PAYNOW_RETURN_URL'));
        if ($id === '' || $key === '') {
            throw new \RuntimeException('PAYNOW_INTEGRATION_ID and PAYNOW_INTEGRATION_KEY are required');
        }
        if ($resultUrl === '' || $returnUrl === '') {
            throw new \RuntimeException('PAYNOW_RESULT_URL and PAYNOW_RETURN_URL must be publicly reachable URLs');
        }
        return new self(
            integrationId:    $id,
            integrationKey:   $key,
            resultUrl:        $resultUrl,
            returnUrl:        $returnUrl,
            authEmailOverride: trim((string) env('PAYNOW_AUTH_EMAIL_OVERRIDE')) ?: null,
        );
    }

    /**
     * SHA512 hash of every value (skipping `hash`) concatenated in order,
     * with the integration key appended.
     *
     * @param array<int, array{0:string, 1:string}> $fields
     */
    public function computeHash(array $fields): string
    {
        $concat = '';
        foreach ($fields as [$key, $value]) {
            if (strtolower($key) === 'hash') continue;
            $concat .= $value;
        }
        $concat .= $this->integrationKey;
        return strtoupper(hash('sha512', $concat));
    }

    /**
     * Verify the hash on an inbound Paynow payload. Returns false if `hash`
     * is missing or doesn't match — callers must treat false as "ignore
     * this request entirely".
     *
     * @param array<string, string> $params  decoded form fields, lowercase keys
     */
    public function verifyHash(array $params): bool
    {
        $provided = $params['hash'] ?? '';
        if ($provided === '') return false;
        $ordered = array_map(fn ($k, $v) => [$k, (string) $v], array_keys($params), array_values($params));
        $expected = $this->computeHash($ordered);
        return hash_equals($expected, strtoupper($provided));
    }

    /**
     * Parse a Paynow URL-encoded response into a lowercase-keyed array.
     * Treats `+` as a space (urldecode behaviour) per the form spec.
     *
     * @return array<string, string>
     */
    public function parseFormBody(string $body): array
    {
        $out = [];
        foreach (explode('&', $body) as $part) {
            if ($part === '') continue;
            $eq = strpos($part, '=');
            if ($eq === false) continue;
            $key = substr($part, 0, $eq);
            $val = urldecode(substr($part, $eq + 1));
            $out[strtolower($key)] = $val;
        }
        return $out;
    }

    /**
     * POST the initiate-transaction request. Returns either
     *   ['ok' => true,  'browserUrl' => …, 'pollUrl' => …, 'raw' => …]
     *   ['ok' => false, 'error' => …, 'raw' => …]
     *
     * @param array{
     *   reference: string,
     *   amount: float,              // major units (USD), 2dp
     *   additionalInfo?: ?string,
     *   authEmail?: ?string,
     *   authPhone?: ?string,
     *   authName?: ?string,
     * } $input
     */
    public function initiateTransaction(array $input): array
    {
        // Bake `?reference=…` into the returnurl so /paynow/return knows
        // which session the customer is coming back from — Paynow doesn't
        // append anything on redirect.
        $separator = str_contains($this->returnUrl, '?') ? '&' : '?';
        $returnUrlWithRef = $this->returnUrl . $separator . 'reference=' . urlencode($input['reference']);

        $authEmail = $this->authEmailOverride ?: ($input['authEmail'] ?? null);

        $fields = [
            ['id',             $this->integrationId],
            ['reference',      $input['reference']],
            ['amount',         number_format($input['amount'], 2, '.', '')],
            ['additionalinfo', $input['additionalInfo'] ?? ''],
            ['returnurl',      $returnUrlWithRef],
            ['resulturl',      $this->resultUrl],
        ];
        if ($authEmail) $fields[] = ['authemail', $authEmail];
        if (! empty($input['authPhone'])) $fields[] = ['authphone', $input['authPhone']];
        if (! empty($input['authName']))  $fields[] = ['authname',  $input['authName']];
        $fields[] = ['status', 'Message'];
        $fields[] = ['hash', $this->computeHash($fields)];

        // Build x-www-form-urlencoded body in the same order as $fields so
        // the hash matches when Paynow recomputes it from the wire format.
        $body = implode('&', array_map(
            fn ($f) => urlencode($f[0]) . '=' . urlencode($f[1]),
            $fields
        ));

        $response = Http::asForm()
            ->withBody($body, 'application/x-www-form-urlencoded')
            ->post(self::INITIATE_URL);

        $text   = $response->body();
        $parsed = $this->parseFormBody($text);

        if (strtolower($parsed['status'] ?? '') === 'error') {
            return ['ok' => false, 'error' => $parsed['error'] ?? 'Paynow returned an error', 'raw' => $text];
        }
        if (! $this->verifyHash($parsed)) {
            return ['ok' => false, 'error' => 'Paynow response hash failed to verify', 'raw' => $text];
        }
        if (empty($parsed['browserurl']) || empty($parsed['pollurl'])) {
            return ['ok' => false, 'error' => 'Paynow response missing browserurl/pollurl', 'raw' => $text];
        }

        return [
            'ok'         => true,
            'browserUrl' => $parsed['browserurl'],
            'pollUrl'    => $parsed['pollurl'],
            'raw'        => $text,
        ];
    }

    /**
     * POST {} to the poll URL and parse the response.
     *
     * @return array{ok: bool, data?: array<string,string>, error?: string, raw: string}
     */
    public function pollStatus(string $pollUrl): array
    {
        $response = Http::post($pollUrl);
        $text   = $response->body();
        $parsed = $this->parseFormBody($text);
        if (strtolower($parsed['status'] ?? '') === 'error') {
            return ['ok' => false, 'error' => $parsed['error'] ?? 'Poll failed', 'raw' => $text];
        }
        if (! $this->verifyHash($parsed)) {
            return ['ok' => false, 'error' => 'Poll response hash failed to verify', 'raw' => $text];
        }
        return ['ok' => true, 'data' => $parsed, 'raw' => $text];
    }

    /**
     * Map a raw Paynow status string onto our internal session status set.
     * Reference: https://developers.paynow.co.zw/docs/paynow/status_update/
     */
    public function classifyStatus(string $raw): string
    {
        $s = strtolower(trim($raw));
        return match (true) {
            in_array($s, ['paid', 'awaiting delivery', 'delivered'], true) => 'paid',
            in_array($s, ['cancelled', 'refunded', 'disputed'], true)      => 'cancelled',
            in_array($s, ['created', 'sent'], true)                        => 'pending',
            default                                                        => 'failed',
        };
    }
}
