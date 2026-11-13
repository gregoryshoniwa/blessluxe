<?php

namespace App\Services\Payments\Gateways;

use App\Models\PaymentSession;
use App\Services\Payments\BlessedPay;
use App\Services\Payments\Contracts\Gateway;
use App\Services\Payments\InitiateResult;
use App\Services\Payments\Method;
use App\Services\Payments\PaymentIntent;
use App\Services\Payments\StatusResult;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * BlessedPay (pay.blessluxe.com) — BLESSLUXE's own payments app, in front of
 * TN CyberTech Bank. Hosted: we send the shopper to its checkout and they
 * choose EcoCash or a card THERE. It calls us back with a signed notice, and
 * we can also ask it.
 *
 * Two things it does that the other gateways don't, so they are checked here:
 *  - a "paid" is only accepted when the amount and currency it reports are the
 *    ones this session asked for;
 *  - any fee on top is decided on ITS side (per way of paying, set in its
 *    console) and shown on its page, so no surcharge is quoted here.
 */
class BlessedPayGateway implements Gateway
{
    public function id(): string { return 'blessedpay'; }
    public function label(): string { return 'BlessedPay'; }
    public function mode(): string { return 'hosted'; }
    public function methods(): array { return [Method::ECOCASH, Method::CARD]; }
    public function isConfigured(): bool { return BlessedPay::configured(); }
    public function needs(?string $method): array { return []; }

    /** Whether the shopper pays a fee on top, and how much, is BlessedPay's answer on its own page. */
    public function surcharge(?string $method): ?array { return null; }

    public function initiate(PaymentIntent $intent): InitiateResult
    {
        $start = BlessedPay::fromConfig()->create(array_filter([
            'amount'       => number_format($intent->amountMajor(), 2, '.', ''),
            'currency'     => strtoupper($intent->currency),
            'reference'    => $intent->reference,
            'description'  => mb_substr($intent->description, 0, 255),
            'return_url'   => $intent->returnUrl,
            'callback_url' => rtrim((string) config('app.url'), '/') . '/api/store/payments/blessedpay/webhook',
            'customer'     => $intent->phone ? ['phone' => $intent->phone] : null,
            'metadata'     => ['kind' => $intent->kind],
        ], fn ($v) => $v !== null));

        if (! $start['ok'] || empty($start['payment']['redirect_url'])) {
            Log::warning('[blessedpay] could not start', ['reference' => $intent->reference, 'error' => $start['error'], 'raw' => $start['raw']]);

            return InitiateResult::failed($start['error'] ?? 'The payment could not be started. Please try another way to pay.', $start['raw']);
        }

        $payment = $start['payment'];

        // The payment's id is how we ask about it later, and what staff look it up by in the BlessedPay console.
        return InitiateResult::redirect($payment['redirect_url'], $payment['id'], $payment['id'], ['blessedpay_mode' => $payment['mode'] ?? null], $start['raw']);
    }

    public function refresh(PaymentSession $session): ?StatusResult
    {
        $id = $session->poll_url ?: $session->provider_reference;
        if (! $id) return null;

        $found = BlessedPay::fromConfig()->find($id);

        return $found['ok'] ? $this->toStatus($found['payment'], $found['raw'], $session) : null;
    }

    public function webhook(Request $request): ?StatusResult
    {
        $raw = $request->getContent();
        if (! BlessedPay::fromConfig()->verifies($request->header('X-BlessedPay-Signature'), $raw)) {
            Log::warning('[blessedpay] callback signature rejected');

            return null;
        }

        $payment = json_decode($raw, true)['payment'] ?? null;

        return is_array($payment) ? $this->toStatus($payment, $raw) : null;
    }

    private function toStatus(array $payment, string $raw, ?PaymentSession $session = null): ?StatusResult
    {
        $reference = (string) ($payment['reference'] ?? '');
        if ($reference === '') return null;

        $session ??= PaymentSession::where('reference', $reference)->first();
        $status = match ($payment['status'] ?? null) {
            'paid'      => StatusResult::PAID,
            'failed'    => StatusResult::FAILED,
            'cancelled' => StatusResult::CANCELLED,
            default     => StatusResult::PENDING,
        };

        // Money is only money when it is the money we asked for.
        if ($status === StatusResult::PAID && $session) {
            $cents = (int) round(((float) ($payment['amount'] ?? 0)) * 100);
            if ($cents !== (int) $session->amount || strtolower((string) ($payment['currency'] ?? '')) !== strtolower((string) $session->currency_code)) {
                Log::error('[blessedpay] paid for a different amount — not accepted', ['reference' => $reference, 'asked' => $session->amount, 'reported' => $payment['amount'] ?? null, 'currency' => $payment['currency'] ?? null]);
                $status = StatusResult::PENDING;
            }
        }

        return new StatusResult(
            reference: $reference,
            status: $status,
            providerStatus: $payment['status'] ?? null,
            // The bank's own reference once there is one; until then BlessedPay's payment id.
            providerReference: ($payment['gateway_reference'] ?? null) ?: ($payment['id'] ?? null),
            pollHandle: $payment['id'] ?? null,
            meta: array_filter([
                'blessedpay_id'   => $payment['id'] ?? null,
                'paid_with'       => $payment['method'] ?? null,          // ecocash | card, chosen on BlessedPay's page
                'fee_on_top'      => isset($payment['fee']) ? (int) round(((float) $payment['fee']) * 100) : null,
                'total_charged'   => isset($payment['charged']) ? (int) round(((float) $payment['charged']) * 100) : null,
            ], fn ($v) => $v !== null),
            raw: $raw,
        );
    }
}
