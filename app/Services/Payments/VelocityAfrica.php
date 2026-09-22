<?php

namespace App\Services\Payments;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * VelocityAfrica REST client — https://docs.velocityafrica.net
 *
 * Velocity is an accounting API with payments attached, and its flow is
 * opinionated (their "Accept payments" guide):
 *
 *   1. POST /sales-orders                        → a sales order to pay against
 *   2. POST /transactions                        → charge it: ECOCASH sends a USSD
 *                                                  prompt to the phone (authType
 *                                                  REMOTE); VMC (Visa/Mastercard)
 *                                                  redirects (authType WEB)
 *   3. PUT  /transactions/poll/{trace}           → SUCCESS | PENDING | FAILED
 *   4. PUT  /sales-orders/update-workflow/{id}   → mark the sales order PAID
 *
 * There are NO webhooks: the outcome is learned by polling step 3. Auth is an
 * `X-API-Key` header. Amounts are major units; currencies USD or ZWG.
 *
 * The docs don't show response bodies, so every read here is defensive: the
 * payload may be at the top level or under `body`, and the card checkout link
 * is found by searching for the first http(s) URL in the response. The raw
 * response is always kept on the session, so the first real transaction tells
 * us the exact key names if a guess is wrong.
 */
class VelocityAfrica
{
    public const PROCESSOR_ECOCASH = 'ECOCASH';
    public const PROCESSOR_CARD    = 'VMC';

    public function __construct(
        public string $apiKey,
        public string $baseUrl,
        public string $merchantPhone,
        public string $merchantAccount,
        public string $region,
        public string $itemCode,
    ) {}

    public static function configured(): bool
    {
        $c = (array) config('services.velocityafrica', []);

        return trim((string) ($c['api_key'] ?? '')) !== '' && trim((string) ($c['merchant_phone'] ?? '')) !== '';
    }

    public static function fromConfig(): self
    {
        $c = (array) config('services.velocityafrica', []);
        if (! self::configured()) throw new \RuntimeException('VELOCITY_API_KEY and VELOCITY_MERCHANT_PHONE are required');

        return new self(
            apiKey:          trim((string) $c['api_key']),
            baseUrl:         rtrim((string) ($c['base_url'] ?: 'https://api.velocityafrica.net'), '/'),
            merchantPhone:   self::phone((string) $c['merchant_phone']) ?? (string) $c['merchant_phone'],
            merchantAccount: trim((string) ($c['merchant_account'] ?: ltrim(self::phone((string) $c['merchant_phone']) ?? '', '+'))),
            region:          strtoupper(trim((string) ($c['region'] ?: 'ZW'))),
            itemCode:        trim((string) ($c['item_code'] ?: 'BLESSLUXE-ORDER')),
        );
    }

    private function http()
    {
        return Http::baseUrl($this->baseUrl)
            ->withHeaders(['X-API-Key' => $this->apiKey, 'Accept' => 'application/json'])
            ->timeout(20)->connectTimeout(8);
    }

    /**
     * One sales order, one line, for the whole amount. Per-product lines would
     * need every SKU to exist in Velocity's inventory; one configured item
     * code doesn't.
     *
     * @return array{ok:bool, id?:string, raw:string, error?:string}
     */
    public function createSalesOrder(PaymentIntent $intent): array
    {
        $amount = $intent->amountMajor();
        try {
            $res = $this->http()->post('/sales-orders', [
                'currencyCodeString' => strtoupper($intent->currency),
                'orderDate'  => now()->toDateString(),
                'dueDate'    => now()->addDays(7)->toDateString(),
                'notes'      => $intent->description . ' ' . $intent->reference,
                'authorized' => true,
                'items'      => [['itemCode' => $this->itemCode, 'qty' => 1, 'unitPrice' => $amount, 'amount' => $amount]],
                'charges'    => [],
            ]);
        } catch (\Throwable $e) {
            return ['ok' => false, 'error' => 'Could not reach VelocityAfrica.', 'raw' => $e->getMessage()];
        }

        $json = $res->json() ?: [];
        $body = self::body($json);
        $id = self::firstString($json, ['externalId', 'salesOrderTrace', 'trace', 'id', 'uid']) ?? self::firstString($body, ['externalId', 'trace', 'id', 'uid']);
        if (! $res->successful() || ! $id) {
            return ['ok' => false, 'error' => self::errorFrom($json, 'VelocityAfrica did not create the sales order.'), 'raw' => $res->body()];
        }

        return ['ok' => true, 'id' => $id, 'raw' => $res->body()];
    }

    /**
     * @return array{ok:bool, trace?:string, status?:string, providerStatus?:?string, redirectUrl?:?string, raw:string, error?:string}
     */
    public function charge(PaymentIntent $intent, string $salesOrderId, string $processor, string $authType, ?string $returnUrl = null): array
    {
        $phone = self::phone($intent->phone);
        if (! $phone) return ['ok' => false, 'error' => 'A valid Zimbabwean phone number is needed.', 'raw' => ''];

        $payload = [
            'amount'                => $intent->amountMajor(),
            'paymentProcessorLabel' => $processor,
            'debitPhone'            => $phone,
            'debitRegion'           => $this->region,
            'debitCurrency'         => strtoupper($intent->currency),
            'debitRef'              => $intent->reference,
            'creditPhone'           => $this->merchantPhone,
            'creditRegion'          => $this->region,
            'creditAccount'         => $this->merchantAccount,
            'type'                  => 'REQUEST',
            'authType'              => $authType,
            'salesOrderId'          => $salesOrderId,
        ];
        if ($authType === 'WEB' && $returnUrl) $payload += ['successUrl' => $returnUrl, 'cancelUrl' => $returnUrl];

        try {
            $res = $this->http()->post('/transactions', $payload);
        } catch (\Throwable $e) {
            return ['ok' => false, 'error' => 'Could not reach VelocityAfrica.', 'raw' => $e->getMessage()];
        }

        $json = $res->json() ?: [];
        $body = self::body($json);
        $trace = self::firstString($body, ['trace', 'transactionTrace', 'id', 'uid']) ?? self::firstString($json, ['trace', 'transactionTrace']);
        if (! $res->successful() || ! $trace) {
            return ['ok' => false, 'error' => self::errorFrom($json, 'VelocityAfrica refused the payment.'), 'raw' => $res->body()];
        }

        return ['ok' => true, 'trace' => $trace, 'redirectUrl' => self::findUrl($json), 'raw' => $res->body()] + self::classify($body);
    }

    /** @return array{ok:bool, status?:string, providerStatus?:?string, raw:string} */
    public function poll(string $trace): array
    {
        try {
            $res = $this->http()->put('/transactions/poll/' . rawurlencode($trace));
        } catch (\Throwable $e) {
            return ['ok' => false, 'raw' => $e->getMessage()];
        }
        if (! $res->successful()) return ['ok' => false, 'raw' => $res->body()];

        return ['ok' => true, 'raw' => $res->body()] + self::classify(self::body($res->json() ?: []));
    }

    /** Best effort: the money has moved either way; this only keeps Velocity's books tidy. */
    public function completeSalesOrder(string $salesOrderId): bool
    {
        try {
            return $this->http()->put('/sales-orders/update-workflow/' . rawurlencode($salesOrderId))->successful();
        } catch (\Throwable $e) {
            Log::warning('[velocityafrica] update-workflow failed', ['id' => $salesOrderId, 'error' => $e->getMessage()]);

            return false;
        }
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    /** pollStatus / paymentStatus → our status. Unknown words stay pending, never failed. */
    public static function classify(array $body): array
    {
        $poll = strtoupper((string) ($body['pollStatus'] ?? ''));
        $pay  = strtoupper((string) ($body['paymentStatus'] ?? $body['status'] ?? ''));
        $any  = [$poll, $pay];

        $status = match (true) {
            in_array('SUCCESS', $any, true) || in_array('PAID', $any, true) || in_array('COMPLETED', $any, true) => StatusResult::PAID,
            in_array('CANCELLED', $any, true) || in_array('CANCELED', $any, true)                                 => StatusResult::CANCELLED,
            in_array('FAILED', $any, true) || in_array('DECLINED', $any, true) || in_array('ERROR', $any, true)   => StatusResult::FAILED,
            default                                                                                                => StatusResult::PENDING,
        };

        return ['status' => $status, 'providerStatus' => trim("{$pay} {$poll}") ?: null];
    }

    /** Zimbabwean numbers in the +263 form Velocity shows. Null if it can't be one. */
    public static function phone(?string $raw): ?string
    {
        $d = preg_replace('/\D+/', '', (string) $raw);
        if ($d === '') return null;
        if (str_starts_with($d, '00263')) $d = substr($d, 2);
        if (str_starts_with($d, '0') && strlen($d) === 10) $d = '263' . substr($d, 1);
        if (strlen($d) === 9 && $d[0] === '7') $d = '263' . $d;

        return preg_match('/^263[17]\d{8}$/', $d) ? '+' . $d : null;
    }

    private static function body(array $json): array
    {
        return is_array($json['body'] ?? null) ? $json['body'] : $json;
    }

    private static function firstString(array $a, array $keys): ?string
    {
        foreach ($keys as $k) {
            if (isset($a[$k]) && is_scalar($a[$k]) && (string) $a[$k] !== '') return (string) $a[$k];
        }

        return null;
    }

    private static function errorFrom(array $json, string $fallback): string
    {
        $m = self::firstString($json, ['message', 'error', 'detail']) ?? self::firstString(self::body($json), ['message', 'error', 'detail']);

        return $m ? "VelocityAfrica: {$m}" : $fallback;
    }

    /** The first http(s) URL anywhere in the response — the card checkout link. */
    private static function findUrl(mixed $node): ?string
    {
        if (is_string($node)) return preg_match('~^https?://\S+$~', $node) ? $node : null;
        if (! is_array($node)) return null;
        // Prefer keys that say what they are.
        foreach ($node as $k => $v) {
            if (is_string($v) && preg_match('/url|link|redirect|checkout/i', (string) $k) && preg_match('~^https?://~', $v)) return $v;
        }
        foreach ($node as $v) {
            if ($u = self::findUrl($v)) return $u;
        }

        return null;
    }
}
