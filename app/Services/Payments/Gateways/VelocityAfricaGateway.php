<?php

namespace App\Services\Payments\Gateways;

use App\Models\PaymentSession;
use App\Services\Payments\Contracts\Gateway;
use App\Services\Payments\InitiateResult;
use App\Services\Payments\Method;
use App\Services\Payments\PaymentIntent;
use App\Services\Payments\StatusResult;
use App\Services\Payments\VelocityAfrica;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * VelocityAfrica — direct. EcoCash is a USSD prompt pushed to the customer's
 * phone while they wait on our page; cards redirect to Velocity's checkout.
 * No webhooks: `refresh()` is how a payment is ever found to be paid.
 */
class VelocityAfricaGateway implements Gateway
{
    public function id(): string { return 'velocityafrica'; }
    public function label(): string { return 'VelocityAfrica'; }
    public function mode(): string { return 'direct'; }
    public function methods(): array { return [Method::ECOCASH, Method::CARD]; }
    public function isConfigured(): bool { return VelocityAfrica::configured(); }
    /** Every Velocity transaction names the paying phone, cards included. */
    public function needs(?string $method): array { return ['phone']; }

    public function initiate(PaymentIntent $intent): InitiateResult
    {
        $client = VelocityAfrica::fromConfig();
        $phone = VelocityAfrica::phone($intent->phone);
        if (! $phone) return InitiateResult::failed('Enter the phone number that will pay, e.g. 077 123 4567.');

        $so = $client->createSalesOrder($intent);
        if (! $so['ok']) {
            Log::warning('[velocityafrica] sales order failed', ['reference' => $intent->reference, 'raw' => $so['raw']]);

            return InitiateResult::failed($so['error'], $so['raw']);
        }

        $card = $intent->method === Method::CARD;
        $tx = $client->charge($intent, $so['id'], $card ? VelocityAfrica::PROCESSOR_CARD : VelocityAfrica::PROCESSOR_ECOCASH, $card ? 'WEB' : 'REMOTE', $intent->returnUrl);
        if (! $tx['ok']) {
            // The sales order response is logged too: the transaction is keyed by an id from it, and the docs don't say which.
            Log::warning('[velocityafrica] charge failed', ['reference' => $intent->reference, 'sales_order_id_sent' => $so['id'], 'sales_order_raw' => $so['raw'], 'raw' => $tx['raw']]);

            return InitiateResult::failed($tx['error'], $tx['raw']);
        }

        $meta = ['sales_order_id' => $so['id'], 'sales_order_trace' => $so['trace'], 'sales_order_name' => $so['name'], 'trace' => $tx['trace'], 'processor' => $card ? 'VMC' : 'ECOCASH'];
        $raw = json_encode(['sales_order' => json_decode($so['raw'], true) ?? $so['raw'], 'transaction' => json_decode($tx['raw'], true) ?? $tx['raw']]);

        if ($card) {
            if (empty($tx['redirectUrl'])) {
                // The docs don't show this response; the raw body is kept so the key name can be read off the first real attempt.
                Log::error('[velocityafrica] card charge returned no checkout link', ['reference' => $intent->reference, 'raw' => $tx['raw']]);

                return InitiateResult::failed("VelocityAfrica didn't return a card checkout link. Please try another way to pay.", $raw);
            }

            return InitiateResult::redirect($tx['redirectUrl'], $tx['trace'], $tx['trace'], $meta, $raw);
        }

        return InitiateResult::wait("Approve the EcoCash prompt on {$phone}. It can take up to a minute to arrive.", $tx['trace'], $tx['trace'], $meta, $raw);
    }

    public function refresh(PaymentSession $session): ?StatusResult
    {
        $meta = (array) ($session->provider_meta ?? []);
        $trace = $session->poll_url ?: ($meta['trace'] ?? null);
        if (! $trace) return null;

        $client = VelocityAfrica::fromConfig();
        $poll = $client->poll($trace);
        if (! $poll['ok']) return null;

        $extra = [];
        if ($poll['status'] === StatusResult::PAID && ! empty($meta['sales_order_id']) && empty($meta['sales_order_completed'])) {
            // update-workflow is keyed by the sales order's TRACE (older sessions only have the id).
            $extra['sales_order_completed'] = $client->completeSalesOrder($meta['sales_order_trace'] ?? $meta['sales_order_id']);
        }

        return new StatusResult(
            reference: $session->reference,
            status: $poll['status'],
            providerStatus: $poll['providerStatus'],
            providerReference: $trace,
            pollHandle: $trace,
            meta: $extra,
            raw: $poll['raw'],
        );
    }

    /** Velocity has no callbacks. */
    public function webhook(Request $request): ?StatusResult
    {
        return null;
    }
}
