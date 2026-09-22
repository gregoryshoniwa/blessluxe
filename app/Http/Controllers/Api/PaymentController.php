<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Affiliate;
use App\Models\Cart;
use App\Models\Order;
use App\Models\PaymentSession;
use App\Services\Bees;
use App\Services\Exclusivity;
use App\Services\PaymentOutcomes;
use App\Services\Payments\PaymentIntent;
use App\Services\Payments\Payments;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Checkout payments, whichever gateway takes them.
 *
 * The checkout asks for `options` (derived from the routing table), the
 * customer picks one, `initiate` starts it through that gateway, and the
 * customer either goes to the gateway (redirect) or waits with us (a USSD
 * prompt on their phone) while `status` polls. Outcomes — orders, Bees,
 * affiliates — are applied by PaymentOutcomes, the same for every gateway.
 *
 * The old /payments/paynow/* URLs still route here: Paynow's dashboard is
 * configured with them, and a browser holding an old bundle posts to them.
 */
class PaymentController extends Controller
{
    /** The previous bundle's name for Bees to redeem; safe to drop a few weeks after the rename. */
    private const LEGACY_POINTS_FIELD = 'bl' . 'its_to_use';

    /** GET /api/store/payments/options — what this shopper can pay with, right now. */
    public function options()
    {
        return ['options' => Payments::checkoutOptions()];
    }

    /**
     * POST /api/store/payments/initiate
     * { option?, phone?, email?, shipping_address?, billing_address?, region_id?, auth_phone?, auth_name?, bees_to_use? }
     */
    public function initiate(Request $request)
    {
        $cartId = $request->session()->get('cart_id');
        $cart = $cartId ? Cart::find($cartId) : null;
        $lines = $cart ? $cart->lineItems()->with('variant.product')->get() : collect();
        if ($lines->isEmpty()) return response()->json(['error' => 'Your cart is empty.'], 422);

        $customer = Auth::guard('customer')->user();
        $data = $request->validate([
            'option'            => ['nullable', 'string', 'max:60'],
            'phone'             => ['nullable', 'string', 'max:32'],
            'email'             => ['nullable', 'email'],
            'shipping_address'  => ['nullable', 'array'],
            'billing_address'   => ['nullable', 'array'],
            'region_id'         => ['nullable', 'string'],
            'auth_phone'        => ['nullable', 'string'],
            'auth_name'         => ['nullable', 'string'],
            'bees_to_use'       => ['nullable', 'integer', 'min:0'],
            self::LEGACY_POINTS_FIELD => ['nullable', 'integer', 'min:0'],
        ]);
        $email = strtolower(trim((string) ($data['email'] ?? $customer?->email ?? '')));
        if ($email === '') return response()->json(['error' => 'Email is required for checkout.'], 422);

        $resolved = Payments::resolveOption($data['option'] ?? null);
        if (! $resolved) return response()->json(['error' => "Payments aren't available right now. Please try again shortly."], 503);
        [$gateway, $method] = $resolved;
        $phone = trim((string) ($data['phone'] ?? $data['auth_phone'] ?? ''));
        if (in_array('phone', $gateway->needs($method), true) && $phone === '') {
            return response()->json(['errors' => ['phone' => ['Enter the phone number that will pay.']]], 422);
        }

        $subtotal = (int) $lines->sum(fn ($l) => $l->unit_price * $l->quantity);

        // ─── Bees redemption ──────────────────────────────────────────────
        // Debited now with an idempotency key from the reference, so a retried
        // initiate can't double-charge; given back if the start fails.
        $reference = Payments::reference();
        $beesDebited = 0; $discountCents = 0;
        $beesWanted = (int) ($data['bees_to_use'] ?? $data[self::LEGACY_POINTS_FIELD] ?? 0);
        if ($beesWanted > 0 && $customer) {
            $preview = Bees::previewDiscount($beesWanted, $subtotal, (int) $customer->loyalty_points);
            if ($preview['bees'] > 0) {
                $beesDebited = Bees::debit($customer->id, $preview['bees'], 'checkout_redeem', 'bees-checkout-' . $reference, $reference)['blits_debited'];
                $discountCents = $preview['discount_cents'];
            }
        }
        $giveBeesBack = function (string $why) use ($beesDebited, $customer, $reference) {
            if ($beesDebited > 0 && $customer) Bees::credit($customer->id, $beesDebited, $why, $reference);
        };

        $total = max(0, $subtotal - $discountCents);
        if ($total <= 0) {
            $giveBeesBack('checkout_zero_total_refund');

            return response()->json(['error' => 'Order total must be greater than zero.'], 422);
        }

        $intent = new PaymentIntent(
            reference: $reference, kind: 'order', amountCents: $total, currency: 'usd',
            email: $email, phone: $phone ?: null, name: $data['auth_name'] ?? null, method: $method,
            description: 'BLESSLUXE order', returnUrl: Payments::returnUrl($reference),
        );
        $snapshot = [
            'cart_id'  => $cart->id,
            'items'    => $lines->map(fn ($l) => ['variant_id' => $l->variant_id, 'quantity' => $l->quantity, 'unit_price' => $l->unit_price, 'metadata' => $l->metadata])->values()->all(),
            'subtotal' => $subtotal, 'discount_total' => $discountCents, 'total' => $total, 'blits_debited' => $beesDebited,
            'shipping_address' => $data['shipping_address'] ?? null, 'billing_address' => $data['billing_address'] ?? null, 'region_id' => $data['region_id'] ?? null,
        ];

        try {
            [$session, $result] = Payments::start($gateway, $intent, $snapshot, $customer?->id);
        } catch (\Throwable $e) {
            Log::error('[payments initiate] ' . $e->getMessage(), ['gateway' => $gateway->id(), 'exception' => $e]);
            $giveBeesBack('checkout_start_failed_refund');

            return response()->json(['error' => 'Could not start the payment. Please try again.'], 500);
        }
        if (! $session) {
            $giveBeesBack('checkout_start_failed_refund');

            return response()->json(['error' => $result->error], 502);
        }

        return $this->started($session, $result->redirectUrl, $result->instruction);
    }

    /**
     * POST /api/store/payments/{gateway}/webhook — a provider's server-to-server
     * callback. The gateway authenticates it; anything it can't verify is dropped.
     */
    public function webhook(Request $request, string $gateway)
    {
        $g = Payments::gateway($gateway);
        if (! $g) return response('unknown gateway', 404);

        try {
            $status = $g->webhook($request);
            if (! $status) return response()->json(['error' => 'rejected'], 400);

            $session = PaymentSession::where('reference', $status->reference)->first();
            if (! $session) {
                Log::warning('[payments webhook] no session for reference', ['gateway' => $gateway, 'reference' => $status->reference]);

                return response('OK');
            }
            PaymentOutcomes::apply($session, $status);

            return response('OK');
        } catch (\Throwable $e) {
            Log::error("[payments webhook {$gateway}] " . $e->getMessage(), ['exception' => $e]);

            return response('error', 500);
        }
    }

    /**
     * GET /api/store/payments/return?reference=…
     * The customer is back from a gateway. Never trust the URL for state: look
     * the session up, ask the gateway once, then send them on.
     */
    public function return(Request $request)
    {
        $reference = (string) $request->query('reference', '');
        $session = $reference !== '' ? PaymentSession::where('reference', $reference)->first() : null;
        if (! $session) return redirect('/cart');

        try {
            $session = Payments::refresh($session, force: true);
        } catch (\Throwable $e) {
            // A poll can fail; the return page keeps polling.
        }

        if ($session->status === 'paid' && $session->order_id) {
            $order = Order::find($session->order_id);

            return redirect('/checkout/confirmation?order=' . urlencode($order?->order_number ?? $reference));
        }

        return redirect('/checkout/return?reference=' . urlencode($reference));
    }

    /** GET /api/store/payments/status/{reference} — polled by the return page while pending. */
    public function status(string $reference)
    {
        $session = PaymentSession::where('reference', $reference)->first();
        if (! $session) return response()->json(['error' => 'Not found'], 404);
        $session = Payments::refresh($session);
        $gateway = Payments::gateway($session->provider);

        return ['session' => [
            'reference'       => $session->reference,
            'status'          => $session->status,
            'provider'        => $session->provider,
            'provider_label'  => $gateway?->label() ?? ucfirst($session->provider),
            'method'          => $session->method,
            'provider_status' => $session->provider_status,
            'instruction'     => $session->status === 'pending' ? (($session->provider_meta ?? [])['instruction'] ?? null) : null,
            'amount'          => $session->amount,
            'currency_code'   => $session->currency_code,
            'order_id'        => $session->order_id,
            'updated_at'      => optional($session->updated_at)->toIso8601String(),
        ]];
    }

    /**
     * POST /api/store/payments/exclusivity/{exclusivityId}  { option?, phone? }
     * Buys a right, not goods — deliberately outside the cart flow, never an Order.
     */
    public function initiateExclusivity(Request $request, string $exclusivityId)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return response()->json(['error' => 'Sign in first.'], 401);

        $row = DB::table('product_exclusivities')->where('id', $exclusivityId)->first();
        if (! $row) return response()->json(['error' => 'That reservation no longer exists.'], 404);
        // Scoped to the owner — an id alone is never enough.
        $affiliate = Affiliate::where('id', $row->affiliate_id)->where('customer_id', $customer->id)->first();
        if (! $affiliate) return response()->json(['error' => 'That is not yours.'], 403);
        if ($row->status !== Exclusivity::PENDING) return response()->json(['error' => 'That reservation has already been settled.'], 422);
        if (Exclusivity::holderOf($row->product_id)) return response()->json(['error' => 'Another affiliate now holds this piece.'], 409);

        $resolved = Payments::resolveOption($request->input('option'));
        if (! $resolved) return response()->json(['error' => "Payments aren't available right now."], 503);
        [$gateway, $method] = $resolved;
        $phone = trim((string) $request->input('phone', ''));
        if (in_array('phone', $gateway->needs($method), true) && $phone === '') {
            return response()->json(['errors' => ['phone' => ['Enter the phone number that will pay.']]], 422);
        }

        try {
            $reference = Payments::reference();
            $intent = new PaymentIntent(
                reference: $reference, kind: Exclusivity::SESSION_KIND, amountCents: (int) $row->fee_amount, currency: 'usd',
                email: $customer->email, phone: $phone ?: null, method: $method, description: 'BLESSLUXE exclusivity', returnUrl: Payments::returnUrl($reference),
            );
            [$session, $result] = Payments::start($gateway, $intent, [
                'kind' => Exclusivity::SESSION_KIND, 'exclusivity_id' => $exclusivityId,
                'product_id' => $row->product_id, 'affiliate_id' => $row->affiliate_id, 'fee_amount' => (int) $row->fee_amount,
            ], $customer->id);
            if (! $session) return response()->json(['error' => $result->error], 502);

            DB::table('product_exclusivities')->where('id', $exclusivityId)->update(['payment_session_id' => $session->id, 'updated_at' => now()]);

            return $this->started($session, $result->redirectUrl, $result->instruction);
        } catch (\Throwable $e) {
            Log::error('[exclusivity initiate] ' . $e->getMessage());

            return response()->json(['error' => 'Could not start that payment.'], 500);
        }
    }

    /** The shape every start returns. `browser_url` is the old name, kept for stale bundles. */
    private function started(PaymentSession $session, ?string $redirectUrl, ?string $instruction): array
    {
        return [
            'reference'    => $session->reference,
            'session_id'   => $session->id,
            'redirect_url' => $redirectUrl,
            'browser_url'  => $redirectUrl,
            'instruction'  => $instruction,
            'return_path'  => '/checkout/return?reference=' . urlencode($session->reference),
        ];
    }
}
