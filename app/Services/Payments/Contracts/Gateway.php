<?php

namespace App\Services\Payments\Contracts;

use App\Models\PaymentSession;
use App\Services\Payments\InitiateResult;
use App\Services\Payments\PaymentIntent;
use App\Services\Payments\StatusResult;
use Illuminate\Http\Request;

/**
 * One payment provider.
 *
 * A gateway knows how to START a payment, how to find out what HAPPENED to it,
 * and (if the provider offers one) how to read a server-to-server callback.
 * It knows nothing about carts, orders, Bees or affiliates — that is
 * PaymentOutcomes' job, and it is the same for every gateway.
 *
 * To add a provider: implement this, register it in Payments::gateways(), add
 * its credentials to config/services.php. Nothing else changes.
 */
interface Gateway
{
    /** Stable id used in settings, sessions and URLs: 'paynow', 'velocityafrica', 'stripe'. */
    public function id(): string;

    /** Shown to staff and customers. */
    public function label(): string;

    /**
     * How the customer meets it.
     *   hosted — we redirect to the provider's page and THEY pick the method there
     *            (Paynow). One checkout option covers every method routed to it.
     *   direct — we take the method (and maybe a phone number) and call the
     *            provider ourselves (VelocityAfrica). One checkout option per method.
     */
    public function mode(): string;

    /** @return string[] Method ids (see Payments\Method) this provider can take. */
    public function methods(): array;

    /** Credentials present? Staff can only switch on a configured gateway. */
    public function isConfigured(): bool;

    /** @return string[] What checkout must collect first for this method: [] or ['phone']. */
    public function needs(?string $method): array;

    /**
     * What this gateway ADDS to the customer's bill for paying this way — a
     * rule, not an amount, so it can be quoted against any total:
     * ['percent' => 2.5, 'label' => 'Gateway charge', 'tax_percent' => 0.0,
     * 'tax_label' => 'Tax on charge'], or null when the shopper pays exactly
     * the order total (a gateway that takes its cut out of the settlement).
     *
     * @return array{percent:float,label:string,tax_percent:float,tax_label:string}|null
     */
    public function surcharge(?string $method): ?array;

    public function initiate(PaymentIntent $intent): InitiateResult;

    /** Ask the provider for the current state. Null when it can't be reached — leave the session as it is. */
    public function refresh(PaymentSession $session): ?StatusResult;

    /**
     * A server-to-server notification from the provider (Paynow's IPN). Must
     * authenticate the payload itself and return null for anything it can't
     * verify. Providers without callbacks just return null.
     */
    public function webhook(Request $request): ?StatusResult;
}
