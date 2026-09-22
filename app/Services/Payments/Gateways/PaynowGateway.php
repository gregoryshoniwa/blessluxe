<?php

namespace App\Services\Payments\Gateways;

use App\Models\PaymentSession;
use App\Services\Paynow;
use App\Services\Payments\Contracts\Gateway;
use App\Services\Payments\InitiateResult;
use App\Services\Payments\Method;
use App\Services\Payments\PaymentIntent;
use App\Services\Payments\StatusResult;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Paynow (Zimbabwe) — a hosted page. We redirect; the customer picks EcoCash,
 * OneMoney, InnBucks, ZIPIT or a card THERE. Paynow calls our IPN (verified by
 * SHA512 hash) and redirects the customer back; we can also poll.
 */
class PaynowGateway implements Gateway
{
    public function id(): string { return 'paynow'; }
    public function label(): string { return 'Paynow'; }
    public function mode(): string { return 'hosted'; }
    public function methods(): array { return [Method::ECOCASH, Method::ONEMONEY, Method::INNBUCKS, Method::ZIPIT, Method::CARD]; }
    public function isConfigured(): bool { return Paynow::configured(); }
    public function needs(?string $method): array { return []; }

    public function initiate(PaymentIntent $intent): InitiateResult
    {
        $init = Paynow::fromConfig()->initiateTransaction([
            'reference'      => $intent->reference,
            'amount'         => $intent->amountMajor(),
            'additionalInfo' => $intent->description,
            'authEmail'      => $intent->email,
            'authPhone'      => $intent->phone,
            'authName'       => $intent->name,
        ]);
        if (! $init['ok']) {
            Log::warning('[paynow initiate] failed', ['error' => $init['error'], 'raw' => $init['raw']]);

            return InitiateResult::failed($init['error'], $init['raw']);
        }

        return InitiateResult::redirect($init['browserUrl'], $init['pollUrl'], null, [], $init['raw']);
    }

    public function refresh(PaymentSession $session): ?StatusResult
    {
        if (! $session->poll_url) return null;
        $poll = Paynow::fromConfig()->pollStatus($session->poll_url);

        return $poll['ok'] ? $this->toStatus($poll['data'], $poll['raw']) : null;
    }

    public function webhook(Request $request): ?StatusResult
    {
        $fields = [];
        foreach ($request->all() as $k => $v) $fields[strtolower($k)] = (string) $v;
        if (! Paynow::fromConfig()->verifyHash($fields)) {
            Log::warning('[paynow ipn] hash mismatch', ['reference' => $fields['reference'] ?? null]);

            return null;
        }

        return $this->toStatus($fields, json_encode($fields));
    }

    private function toStatus(array $fields, string $raw): ?StatusResult
    {
        $reference = (string) ($fields['reference'] ?? '');
        if ($reference === '') return null;

        return new StatusResult(
            reference: $reference,
            status: Paynow::fromConfig()->classifyStatus((string) ($fields['status'] ?? '')),
            providerStatus: $fields['status'] ?? null,
            providerReference: $fields['paynowreference'] ?? null,
            pollHandle: $fields['pollurl'] ?? null,
            raw: $raw,
        );
    }
}
