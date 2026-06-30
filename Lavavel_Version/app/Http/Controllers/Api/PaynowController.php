<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\PackController;
use App\Mail\AffiliateSaleMail;
use App\Mail\OrderReceiptMail;
use App\Models\Affiliate;
use App\Models\AffiliateSale;
use App\Models\Cart;
use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderLineItem;
use App\Models\PaymentSession;
use App\Models\ProductVariant;
use App\Services\Blits;
use App\Services\Notifications;
use App\Services\Paynow;
use App\Services\Shipping;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class PaynowController extends Controller
{
    /**
     * POST /api/store/payments/paynow/initiate
     * { email?, shipping_address?, billing_address?, region_id?, auth_phone?, auth_name? }
     *
     * Validates the session cart, computes the total, creates a
     * `payment_session` row, calls Paynow, returns the browser_url so the
     * SPA can redirect.
     */
    public function initiate(Request $request)
    {
        try {
            $cartId = $request->session()->get('cart_id');
            $cart = $cartId ? Cart::find($cartId) : null;
            if (! $cart) {
                return response()->json(['error' => 'Your cart is empty.'], 422);
            }

            $lines = $cart->lineItems()->with('variant.product')->get();
            if ($lines->isEmpty()) {
                return response()->json(['error' => 'Your cart is empty.'], 422);
            }

            $customer = Auth::guard('customer')->user();
            $data = $request->validate([
                'email'             => ['nullable', 'email'],
                'shipping_address'  => ['nullable', 'array'],
                'billing_address'   => ['nullable', 'array'],
                'region_id'         => ['nullable', 'string'],
                'auth_phone'        => ['nullable', 'string'],
                'auth_name'         => ['nullable', 'string'],
                // Optional Blits redemption — gated on a logged-in customer.
                'blits_to_use'      => ['nullable', 'integer', 'min:0'],
            ]);
            $email = strtolower(trim((string) ($data['email'] ?? $customer?->email ?? '')));
            if ($email === '') {
                return response()->json(['error' => 'Email is required for checkout.'], 422);
            }

            $subtotal = (int) $lines->sum(fn ($l) => $l->unit_price * $l->quantity);

            // ─── Blits redemption ──────────────────────────────────────
            // Compute the actual debit + discount, debit immediately with an
            // idempotency key keyed off the upcoming reference so a retry of
            // initiate doesn't double-charge the customer.
            $blitsDebited = 0;
            $discountCents = 0;
            $blitsWanted = (int) ($data['blits_to_use'] ?? 0);
            if ($blitsWanted > 0 && $customer) {
                $available = (int) $customer->loyalty_points;
                $preview = Blits::previewDiscount($blitsWanted, $subtotal, $available);
                if ($preview['blits'] > 0) {
                    $reference   = $this->makeReference();   // reference picked early for idempotency key
                    $blitsResult = Blits::debit(
                        $customer->id,
                        $preview['blits'],
                        'checkout_redeem',
                        'blits-checkout-' . $reference,
                        $reference,
                    );
                    $blitsDebited  = $blitsResult['blits_debited'];
                    $discountCents = $preview['discount_cents'];
                }
            }
            // If we didn't already mint a reference (no blits used), do it now.
            $reference ??= $this->makeReference();

            $total = max(0, $subtotal - $discountCents);
            if ($total <= 0) {
                // Refund the blits we just debited — the order is "free" so we
                // can't tip the customer into a paid order with $0 due.
                if ($blitsDebited > 0 && $customer) {
                    Blits::credit($customer->id, $blitsDebited, 'checkout_zero_total_refund', $reference);
                }
                return response()->json(['error' => 'Order total must be greater than zero.'], 422);
            }
            $paynow    = Paynow::fromConfig();

            $init = $paynow->initiateTransaction([
                'reference'      => $reference,
                'amount'         => $total / 100,   // Paynow takes major units
                'additionalInfo' => 'BLESSLUXE order',
                'authEmail'      => $email,
                'authPhone'      => $data['auth_phone'] ?? null,
                'authName'       => $data['auth_name']  ?? null,
            ]);
            if (! $init['ok']) {
                Log::warning('[paynow initiate] failed', ['error' => $init['error'], 'raw' => $init['raw']]);
                return response()->json(['error' => $init['error']], 502);
            }

            $session = PaymentSession::create([
                'id'                => 'payses_' . Str::random(20),
                'reference'         => $reference,
                'provider'          => 'paynow',
                'status'            => 'pending',
                'poll_url'          => $init['pollUrl'],
                'amount'            => $total,
                'currency_code'     => 'usd',
                'email'             => $email,
                'customer_id'       => $customer?->id,
                'cart_snapshot'     => [
                    'cart_id'  => $cart->id,
                    'items'    => $lines->map(fn ($l) => [
                        'variant_id' => $l->variant_id,
                        'quantity'   => $l->quantity,
                        'unit_price' => $l->unit_price,
                        // Carry the per-line affiliate attribution through so
                        // we can credit the right partner when the order is
                        // materialised on `paid`.
                        'metadata'   => $l->metadata,
                    ])->values()->all(),
                    'subtotal'         => $subtotal,
                    'discount_total'   => $discountCents,
                    'total'            => $total,
                    'blits_debited'    => $blitsDebited,
                    'shipping_address' => $data['shipping_address'] ?? null,
                    'billing_address'  => $data['billing_address']  ?? null,
                    'region_id'        => $data['region_id']        ?? null,
                ],
                'raw_init_response' => $init['raw'],
            ]);

            return [
                'browser_url' => $init['browserUrl'],
                'poll_url'    => $init['pollUrl'],
                'reference'   => $reference,
                'session_id'  => $session->id,
            ];
        } catch (\Throwable $e) {
            Log::error('[paynow initiate] '.$e->getMessage(), ['exception' => $e]);
            return response()->json(['error' => 'Could not start Paynow checkout: '.$e->getMessage()], 500);
        }
    }

    /**
     * POST /api/store/payments/paynow/ipn
     *
     * Paynow server-to-server status callback. application/x-www-form-urlencoded
     * body. CSRF is disabled on the route — we authenticate the payload
     * via the SHA512 hash.
     */
    public function ipn(Request $request)
    {
        try {
            $paynow = Paynow::fromConfig();
            $fields = [];
            foreach ($request->all() as $k => $v) {
                $fields[strtolower($k)] = (string) $v;
            }
            if (! $paynow->verifyHash($fields)) {
                Log::warning('[paynow ipn] hash mismatch', ['reference' => $fields['reference'] ?? null]);
                return response()->json(['error' => 'hash mismatch'], 400);
            }
            $this->applyStatusUpdate($fields, $paynow);
            return response('OK');
        } catch (\Throwable $e) {
            Log::error('[paynow ipn] '.$e->getMessage(), ['exception' => $e]);
            return response('error', 500);
        }
    }

    /**
     * GET /api/store/payments/paynow/return?reference=...
     *
     * Customer-facing redirect after Paynow checkout. We never trust the
     * URL params for state: look up our session, poll for the latest
     * status, then redirect to confirmation (paid) or back to the return
     * page (pending).
     */
    public function return(Request $request)
    {
        try {
            $reference = (string) $request->query('reference', '');
            $fallback  = rtrim(config('app.url', '/'), '/');
            if ($reference === '') {
                return redirect($fallback . '/cart');
            }

            $session = PaymentSession::where('reference', $reference)->first();
            if (! $session) {
                return redirect($fallback . '/cart');
            }

            // Poll once for a fresh status (IPN can lag a few seconds).
            if ($session->status === 'pending' && $session->poll_url) {
                try {
                    $paynow = Paynow::fromConfig();
                    $poll = $paynow->pollStatus($session->poll_url);
                    if ($poll['ok']) {
                        $this->applyStatusUpdate($poll['data'], $paynow);
                    }
                } catch (\Throwable $e) {
                    // Swallow — the IPN will catch up.
                }
            }

            $fresh = PaymentSession::where('reference', $reference)->first();
            if ($fresh?->status === 'paid' && $fresh->order_id) {
                $order = Order::find($fresh->order_id);
                return redirect($fallback . '/checkout/confirmation?order=' . urlencode($order?->order_number ?? $reference));
            }
            return redirect($fallback . '/checkout/paynow/return?reference=' . urlencode($reference));
        } catch (\Throwable $e) {
            Log::error('[paynow return] '.$e->getMessage(), ['exception' => $e]);
            return redirect('/');
        }
    }

    /**
     * GET /api/store/payments/paynow/status/{reference}
     *
     * Polled by the Vue return page every few seconds while the session is
     * still pending; flips to paid as soon as Paynow's IPN lands.
     */
    public function status(string $reference)
    {
        $session = PaymentSession::where('reference', $reference)->first();
        if (! $session) {
            return response()->json(['error' => 'Not found'], 404);
        }
        return [
            'session' => [
                'reference'       => $session->reference,
                'status'          => $session->status,
                'provider_status' => $session->provider_status,
                'amount'          => $session->amount,
                'currency_code'   => $session->currency_code,
                'order_id'        => $session->order_id,
                'updated_at'      => optional($session->updated_at)->toIso8601String(),
            ],
        ];
    }

    // ─── Internals ──────────────────────────────────────────────────────

    /**
     * Apply a Paynow status payload to the session row. Idempotent: once
     * `paid`, stays `paid` (a late `cancelled` callback won't undo a real
     * payment). Materialises an order on first paid event.
     *
     * @param array<string, string> $fields
     */
    private function applyStatusUpdate(array $fields, Paynow $paynow): void
    {
        $reference = $fields['reference'] ?? '';
        if ($reference === '') return;

        $session = PaymentSession::where('reference', $reference)->first();
        if (! $session) {
            Log::warning('[paynow] no session for reference', ['reference' => $reference]);
            return;
        }

        $status     = $fields['status'] ?? '';
        $classified = $paynow->classifyStatus($status);

        // Once paid stays paid.
        if ($session->status === 'paid' && $classified !== 'paid') return;

        $session->update([
            'status'             => $classified,
            'provider_status'    => $status,
            'provider_reference' => $fields['paynowreference'] ?? $session->provider_reference,
            'poll_url'           => $fields['pollurl'] ?? $session->poll_url,
            'raw_ipn_payload'    => json_encode($fields),
        ]);

        if ($classified === 'paid' && ! $session->order_id) {
            $this->createOrderFromSession($session->fresh());
        }

        // Refund any debited Blits when the payment ends up cancelled/failed.
        // Guarded against double-refund via session.metadata.blits_refunded.
        if (in_array($classified, ['cancelled', 'failed'], true)) {
            $fresh = PaymentSession::find($session->id);
            $snap  = $fresh?->cart_snapshot ?? [];
            $blitsDebited = (int) ($snap['blits_debited'] ?? 0);
            $alreadyRefunded = (bool) ($snap['blits_refunded'] ?? false);
            if ($blitsDebited > 0 && ! $alreadyRefunded && $fresh->customer_id) {
                Blits::credit($fresh->customer_id, $blitsDebited, 'checkout_cancel_refund', $fresh->reference);
                $snap['blits_refunded'] = true;
                $fresh->update(['cart_snapshot' => $snap]);
            }
        }
    }

    /**
     * Materialise a shop_order from the payment session's cart snapshot.
     * Wrapped in a transaction so a partial failure leaves no orphan rows.
     */
    private function createOrderFromSession(PaymentSession $session): void
    {
        $snap = $session->cart_snapshot ?? [];
        $items = $snap['items'] ?? [];
        if (empty($items)) return;

        // Captured by reference inside the transaction so we can fan out
        // notifications AFTER it commits — sending mid-transaction would
        // lose the message if anything rolls back.
        $pendingAffiliateMails = [];

        DB::transaction(function () use ($session, $snap, $items, &$pendingAffiliateMails) {
            $orderId    = 'order_' . Str::random(20);
            $orderNumber = (string) $session->reference;
            $subtotal   = (int) ($snap['subtotal'] ?? 0);
            $total      = (int) ($snap['total']    ?? $session->amount);

            Order::create([
                'id'              => $orderId,
                'order_number'    => $orderNumber,
                'cart_id'         => $snap['cart_id'] ?? null,
                'customer_id'     => $session->customer_id,
                'region_id'       => $snap['region_id'] ?? null,
                'email'           => $session->email,
                'currency_code'   => strtolower((string) $session->currency_code),
                'subtotal'        => $subtotal,
                'discount_total'  => (int) ($snap['discount_total'] ?? 0),
                'total'           => $total,
                'status'          => 'completed',
                'payment_method'  => 'paynow',
                'payment_status'  => 'paid',
                'shipping_address' => $snap['shipping_address'] ?? null,
                'billing_address'  => $snap['billing_address']  ?? null,
                'metadata'        => [
                    'blits_debited' => (int) ($snap['blits_debited'] ?? 0),
                ],
            ]);

            foreach ($items as $it) {
                $variant = ProductVariant::with('product')->find($it['variant_id']);
                if (! $variant) continue;
                OrderLineItem::create([
                    'id'            => 'line_' . Str::random(20),
                    'order_id'      => $orderId,
                    'variant_id'    => $variant->id,
                    'product_id'    => $variant->product_id,
                    'title'         => $variant->product?->title ?? 'Item',
                    'variant_title' => $variant->title,
                    'sku'           => $variant->sku,
                    'thumbnail'     => $variant->product?->thumbnail,
                    'quantity'      => (int) $it['quantity'],
                    'unit_price'    => (int) $it['unit_price'],
                    'unit_cost'     => $variant->cost_price,
                ]);
                // Decrement inventory if it's tracked.
                if ($variant->manage_inventory) {
                    ProductVariant::where('id', $variant->id)
                        ->update([
                            'inventory_quantity' => DB::raw('GREATEST(0, inventory_quantity - ' . (int) $it['quantity'] . ')'),
                        ]);
                }
            }

            $session->update(['order_id' => $orderId]);

            // ─── Affiliate attribution ─────────────────────────────────
            // For every line tagged with an affiliate_code, accrue the
            // commission and bump the affiliate's lifetime earnings.
            // Aggregated per affiliate so a 5-line cart with the same code
            // becomes one AffiliateSale row, not five.
            $byCode = [];
            foreach ($items as $it) {
                $code = $it['metadata']['affiliate_code'] ?? null;
                if (! $code) continue;
                $code = strtoupper($code);
                $byCode[$code] ??= 0;
                $byCode[$code] += ((int) $it['unit_price']) * ((int) $it['quantity']);
            }
            foreach ($byCode as $code => $attributedTotal) {
                $affiliate = Affiliate::where('code', $code)->first();
                if (! $affiliate) continue;
                $commission = (int) round($attributedTotal * ((float) $affiliate->commission_rate) / 100);
                if ($commission <= 0) continue;
                $sale = AffiliateSale::create([
                    'id'                => 'asal_' . Str::random(20),
                    'affiliate_id'      => $affiliate->id,
                    'order_id'          => $orderId,
                    'order_total'       => $attributedTotal,
                    'commission_amount' => $commission,
                    'currency_code'     => strtolower((string) $session->currency_code),
                    'status'            => 'pending',
                    'created_at'        => now(),
                ]);
                Affiliate::where('id', $affiliate->id)->update([
                    'total_earnings' => DB::raw('total_earnings + ' . $commission),
                    'updated_at'     => now(),
                ]);
                $pendingAffiliateMails[] = ['affiliate' => $affiliate->fresh(), 'sale' => $sale];
            }

            // ─── Pack slots: flip reserved → paid for any pack-attributed line. ─
            PackController::markPaidForOrder($orderId, $items);

            // ─── Blits earn on paid order ─────────────────────────────
            // Earn is computed on the *charged* amount (after the discount
            // they paid in blits), so customers can't loop blits → discount
            // → more blits to infinity. Skipped silently for guest orders.
            if ($session->customer_id) {
                $earn = Blits::earnFor($total);
                if ($earn > 0) {
                    Blits::credit($session->customer_id, $earn, 'order_earn', $orderId);
                }
            }

            // Clear the source cart so the customer sees an empty bag on
            // return (the JS clearCart() runs too, but this is the canonical
            // truth on the server side).
            if (! empty($snap['cart_id'])) {
                Cart::where('id', $snap['cart_id'])->first()?->lineItems()->delete();
            }
        });

        // ─── Package + receipt ────────────────────────────────────────
        // Both done outside the transaction so an SMTP / package hiccup
        // can't roll the order back. The admin BCC is set via
        // MAIL_ADMIN_BCC in .env.
        try {
            $order = Order::find($session->fresh()->order_id);
            if ($order) {
                // Mint the package + initial event before sending the
                // receipt so the email can include the tracking code.
                Shipping::ensurePackageForOrder($order->load('lineItems'));
                if ($order->email) {
                    Mail::to($order->email)->send(new OrderReceiptMail($order->fresh()));
                }
            }
        } catch (\Throwable $e) {
            Log::warning('[order package/receipt] '.$e->getMessage());
        }

        // ─── Affiliate sale notifications ─────────────────────────────
        foreach ($pendingAffiliateMails as $pair) {
            try {
                if ($pair['affiliate']->email) {
                    Mail::to($pair['affiliate']->email)
                        ->send(new AffiliateSaleMail($pair['affiliate'], $pair['sale']));
                }
            } catch (\Throwable $e) {
                Log::warning('[affiliate sale mail] '.$e->getMessage());
            }
            // Drop an in-app notification on the matching customer account,
            // if there is one (affiliate email == a customer email).
            $cust = \App\Models\Customer::where('email', strtolower((string) $pair['affiliate']->email))->first();
            if ($cust) {
                Notifications::forCustomer(
                    $cust,
                    kind: 'affiliate_sale',
                    title: '+$' . number_format($pair['sale']->commission_amount / 100, 2) . ' affiliate commission',
                    body: 'A customer ordered through your link ' . $pair['affiliate']->code . '.',
                    actionUrl: '/affiliate/' . $pair['affiliate']->code . '/dashboard',
                );
            }
        }

        // ─── Customer + admin notifications for the order itself ──────
        $orderForNotify = Order::find($session->fresh()->order_id);
        if ($orderForNotify) {
            if ($orderForNotify->customer_id) {
                Notifications::forCustomer(
                    $orderForNotify->customer_id,
                    kind: 'order_paid',
                    title: 'Order ' . $orderForNotify->order_number . ' confirmed',
                    body: 'We received your payment of $' . number_format($orderForNotify->total / 100, 2) . '.',
                    actionUrl: '/account?tab=transactions',
                );
            }
            Notifications::forAllAdmins(
                kind: 'new_order',
                title: 'New order ' . $orderForNotify->order_number,
                body: '$' . number_format($orderForNotify->total / 100, 2) . ' · ' . ($orderForNotify->email ?: 'guest'),
                actionUrl: '/admin/orders/' . $orderForNotify->id,
            );
        }
    }

    /** Short, sortable, human-friendly reference. Matches Node app shape. */
    private function makeReference(): string
    {
        $time = strtoupper(base_convert((string) round(microtime(true) * 1000), 10, 36));
        $rand = strtoupper(substr(Str::random(8), 0, 4));
        return "BL-{$time}-{$rand}";
    }
}
