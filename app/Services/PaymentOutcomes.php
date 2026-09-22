<?php

namespace App\Services;

use App\Http\Controllers\Api\PackController;
use App\Mail\AffiliateSaleMail;
use App\Mail\OrderReceiptMail;
use App\Models\Affiliate;
use App\Models\AffiliateSale;
use App\Models\Cart;
use App\Models\Order;
use App\Models\OrderLineItem;
use App\Models\PaymentSession;
use App\Models\ProductVariant;
use App\Services\Payments\StatusResult;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

/**
 * What a payment's outcome DOES — the same for every gateway.
 *
 * A gateway only reports "paid / pending / cancelled / failed". This is where
 * paid becomes an order (or an exclusivity, or a forwarding fee), stock moves,
 * affiliates are credited, Bees are earned, receipts go out; and where a
 * cancelled checkout gives its Bees back. It used to live inside the Paynow
 * controller, which meant a second gateway could never have produced an order.
 */
class PaymentOutcomes
{
    /**
     * Apply a provider's word to the session. Idempotent: once `paid`, stays
     * `paid` (a late `cancelled` can't undo a real payment), and an order is
     * only ever materialised once.
     */
    public static function apply(PaymentSession $session, StatusResult $r): void
    {
        $classified = $r->status;
        if ($session->status === 'paid' && $classified !== 'paid') return;

        $session->update([
            'status'             => $classified,
            'provider_status'    => $r->providerStatus,
            'provider_reference' => $r->providerReference ?? $session->provider_reference,
            'poll_url'           => $r->pollHandle ?? $session->poll_url,
            'provider_meta'      => array_merge((array) ($session->provider_meta ?? []), $r->meta) ?: null,
            'raw_ipn_payload'    => $r->raw !== '' ? $r->raw : $session->raw_ipn_payload,
        ]);

        // ─── Discriminate on session kind ──────────────────────────────────
        // A forwarding fee is a payment with NO order behind it. Without this
        // branch it would fall into createOrderFromSession and mint a second
        // Order whose total is the shipping fee — earning Bees on it and
        // potentially accruing affiliate commission. The kind check is what
        // keeps shipping money out of the sales ledger entirely.
        if ($classified === 'paid') {
            $fresh = $session->fresh();
            $snap  = $fresh->cart_snapshot ?? [];

            match ($fresh->kind) {
                PackForwarding::SESSION_KIND => PackForwarding::markFeePaid($fresh),
                // Exclusivity only goes live once the money is in — first to PAY
                // wins, and activate() re-checks nobody beat them to it.
                Exclusivity::SESSION_KIND    => self::activateExclusivity($fresh, $snap),
                default                      => $fresh->order_id ? null : self::createOrderFromSession($fresh),
            };
        }

        // Refund any debited Bees when the payment ends up cancelled/failed.
        // Guarded against double-refund via cart_snapshot.blits_refunded.
        // Only order sessions ever debit Bees, so a forwarding fee must not
        // take this path.
        if ($session->kind === 'order' && in_array($classified, ['cancelled', 'failed'], true)) {
            $fresh = PaymentSession::find($session->id);
            $snap  = $fresh?->cart_snapshot ?? [];
            $beesDebited = (int) ($snap['blits_debited'] ?? 0);
            $alreadyRefunded = (bool) ($snap['blits_refunded'] ?? false);
            if ($beesDebited > 0 && ! $alreadyRefunded && $fresh->customer_id) {
                Bees::credit($fresh->customer_id, $beesDebited, 'checkout_cancel_refund', $fresh->reference);
                $snap['blits_refunded'] = true;
                $fresh->update(['cart_snapshot' => $snap]);
            }
        }
    }

    private static function activateExclusivity(PaymentSession $session, array $snap): void
    {
        $id = $snap['exclusivity_id'] ?? null;
        if (! $id) return;

        $won = Exclusivity::activate($id, $session->id);

        $row = DB::table('product_exclusivities')->where('id', $id)->first();
        $affiliate = $row ? Affiliate::find($row->affiliate_id) : null;
        if (! $affiliate?->customer_id) return;

        $product = $row ? DB::table('products')->where('id', $row->product_id)->value('title') : 'that piece';

        Notifications::forCustomer(
            $affiliate->customer_id,
            $won ? 'exclusivity_active' : 'exclusivity_missed',
            $won ? "{$product} is now exclusively yours" : "Someone took {$product} first",
            $won
                ? 'It has come off the main shop and sells only on your page.'
                : 'Another affiliate paid moments before you — your fee is refundable, just reply to us.',
            "/affiliate/{$affiliate->code}/dashboard",
        );

        if (! $won) {
            Notifications::forAllAdmins(
                'exclusivity_refund_due',
                'Exclusivity fee to refund',
                "{$affiliate->code} paid for {$product} but lost the race. Refund it through " . ucfirst($session->provider) . ".",
                '/admin/affiliates',
            );
        }
    }

    /**
     * Materialise a shop_order from the payment session's cart snapshot.
     * Wrapped in a transaction so a partial failure leaves no orphan rows.
     */
    private static function createOrderFromSession(PaymentSession $session): void
    {
        $snap = $session->cart_snapshot ?? [];
        $items = $snap['items'] ?? [];
        if (empty($items)) return;

        // Captured by reference inside the transaction so we can fan out
        // notifications AFTER it commits — sending mid-transaction would
        // lose the message if anything rolls back.
        $pendingAffiliateMails = [];
        $lowStockCheckVariantIds = [];

        DB::transaction(function () use ($session, $snap, $items, &$pendingAffiliateMails, &$lowStockCheckVariantIds) {
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
                'payment_method'  => $session->method ?: $session->provider,
                'payment_status'  => 'paid',
                'shipping_address' => $snap['shipping_address'] ?? null,
                'billing_address'  => $snap['billing_address']  ?? null,
                'metadata'        => [
                    'blits_debited' => (int) ($snap['blits_debited'] ?? 0),
                ],
            ]);

            // slot id => line id, so pack slots can be linked back to the exact line
            // they became. Without this the pack↔order link is lost at checkout.
            $slotLineIds = [];

            foreach ($items as $it) {
                $variant = ProductVariant::with('product')->find($it['variant_id']);
                if (! $variant) continue;
                $lineId = 'line_' . Str::random(20);
                OrderLineItem::create([
                    'id'            => $lineId,
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
                    // Carries pack_slot_id / pack_campaign_id / affiliate_code through
                    // from the cart line. Previously dropped here.
                    'metadata'      => $it['metadata'] ?? null,
                ]);
                if ($slotId = ($it['metadata']['pack_slot_id'] ?? null)) {
                    $slotLineIds[$slotId] = $lineId;
                }
                // Decrement inventory if it's tracked, and flag the
                // variant for a post-commit low-stock notification.
                if ($variant->manage_inventory) {
                    ProductVariant::where('id', $variant->id)
                        ->update([
                            // CASE, not GREATEST(): MySQL has GREATEST, the SQLite the tests run on doesn't. Never below zero either way.
                            'inventory_quantity' => DB::raw('CASE WHEN inventory_quantity > ' . (int) $it['quantity'] . ' THEN inventory_quantity - ' . (int) $it['quantity'] . ' ELSE 0 END'),
                        ]);
                    $lowStockCheckVariantIds[] = $variant->id;
                }
            }

            $session->update(['order_id' => $orderId]);

            // ─── Affiliate attribution ─────────────────────────────────
            // For every line tagged with an affiliate_code, accrue the
            // commission and bump the affiliate's lifetime earnings.
            // Aggregated per affiliate so a 5-line cart with the same code
            // becomes one AffiliateSale row, not five.
            // Split each attributed line into the BASE (what BLESSLUXE lists it at)
            // and the affiliate's MARKUP. Commission is paid on the base only —
            // the affiliate already keeps the whole markup, so paying commission
            // on it as well would have the business funding an uplift it never
            // received. Lines predating storefronts carry no split, so the charged
            // price is the base.
            $byCode = [];
            foreach ($items as $it) {
                $code = $it['metadata']['affiliate_code'] ?? null;
                if (! $code) continue;

                $code  = strtoupper($code);
                $qty   = (int) $it['quantity'];
                $unit  = (int) $it['unit_price'];
                $base  = (int) ($it['metadata']['base_price'] ?? $unit);
                $markup = max(0, ($unit - $base)) * $qty;

                $byCode[$code] ??= ['base' => 0, 'markup' => 0, 'charged' => 0];
                $byCode[$code]['base']    += $base * $qty;
                $byCode[$code]['markup']  += $markup;
                $byCode[$code]['charged'] += $unit * $qty;
            }
            foreach ($byCode as $code => $totals) {
                $affiliate = Affiliate::where('code', $code)->first();
                if (! $affiliate) continue;

                $commission = AffiliatePricing::commissionOn($totals['base'], (float) $affiliate->commission_rate);
                // The markup is theirs in full, so a zero-commission line still
                // pays out when they marked it up.
                $payable = $commission + $totals['markup'];
                if ($payable <= 0) continue;

                $sale = AffiliateSale::create([
                    'id'                => 'asal_' . Str::random(20),
                    'affiliate_id'      => $affiliate->id,
                    'order_id'          => $orderId,
                    'order_total'       => $totals['charged'],
                    'base_total'        => $totals['base'],
                    'markup_total'      => $totals['markup'],
                    'commission_amount' => $payable,
                    'currency_code'     => strtolower((string) $session->currency_code),
                    'status'            => 'pending',
                    'created_at'        => now(),
                ]);
                Affiliate::where('id', $affiliate->id)->update([
                    // Lifetime earnings must include the markup, or the dashboard
                    // would under-report what the affiliate is actually owed.
                    'total_earnings' => DB::raw('total_earnings + ' . $payable),
                    'updated_at'     => now(),
                ]);
                $pendingAffiliateMails[] = ['affiliate' => $affiliate->fresh(), 'sale' => $sale];

                // Count units toward any exclusivity this affiliate holds. Without
                // this the minimum can never be met, so every paid exclusive would
                // lapse at the end of its first term.
                foreach ($items as $it) {
                    if (strtoupper((string) ($it['metadata']['affiliate_code'] ?? '')) !== $code) continue;
                    $productId = ProductVariant::where('id', $it['variant_id'])->value('product_id');
                    if ($productId) {
                        Exclusivity::recordSale($productId, $affiliate->id, (int) $it['quantity']);
                    }
                }
            }

            // ─── Pack slots: flip reserved → paid for any pack-attributed line. ─
            PackController::markPaidForOrder($orderId, $items, $slotLineIds);

            // ─── Bees earn on paid order ─────────────────────────────
            // Earn is computed on the *charged* amount (after the discount
            // they paid in bees), so customers can't loop bees → discount
            // → more bees to infinity. Skipped silently for guest orders.
            if ($session->customer_id) {
                $earn = Bees::earnFor($total);
                if ($earn > 0) {
                    Bees::credit($session->customer_id, $earn, 'order_earn', $orderId);
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
                // Pack lines join their campaign's shared consignment; ordinary
                // lines get the order's own parcel. An order may produce both.
                Shipping::ensurePackagesForOrder($order->load('lineItems'));
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

            // Save the shipping address to the customer's address book if
            // they don't already have one matching, so future checkouts can
            // pre-fill. Guests + duplicates skip silently.
            if ($orderForNotify->customer_id && is_array($orderForNotify->shipping_address)) {
                self::saveAddressToCustomerBook($orderForNotify->customer_id, $orderForNotify->shipping_address);
            }
        }

        // Low-stock alerts: any tracked variant that dropped to/below
        // the threshold gets one admin notification. Default threshold is
        // 3 — overridable per variant via metadata.low_stock_threshold.
        foreach (array_unique($lowStockCheckVariantIds) as $vid) {
            $v = ProductVariant::with('product')->find($vid);
            if (! $v || ! $v->manage_inventory) continue;
            $threshold = (int) (($v->metadata['low_stock_threshold'] ?? null) ?: 3);
            if ((int) $v->inventory_quantity > $threshold) continue;
            $label = ($v->product?->title ?? 'Variant') . ' · ' . ($v->title ?: $v->sku ?: $v->id);
            Notifications::forAllAdmins(
                kind:      'low_stock',
                title:     'Low stock: ' . $label,
                body:      ((int) $v->inventory_quantity) . ' left (threshold ' . $threshold . ')',
                actionUrl: '/admin/inventory',
            );
        }
    }

    /** Idempotent: skip if a row with the same line1 + city already exists. */
    private static function saveAddressToCustomerBook(string $customerId, array $addr): void
    {
        // Checkout posts {address1, province, country: "Zimbabwe"}; this table wants
        // {line1, region, country: "ZW"}. Reading the raw keys meant $line1 was always
        // '' and this method returned early on every single checkout, which is why
        // customer_addresses had no rows at all.
        $addr  = \App\Support\Address::normalize($addr);
        $line1 = trim((string) ($addr['line1'] ?? ''));
        $city  = trim((string) ($addr['city']  ?? ''));
        if ($line1 === '' || $city === '') return;
        $exists = \App\Models\CustomerAddress::query()
            ->where('customer_id', $customerId)
            ->where('line1', $line1)
            ->where('city', $city)
            ->exists();
        if ($exists) return;

        $hasAny = \App\Models\CustomerAddress::query()->where('customer_id', $customerId)->exists();
        \App\Models\CustomerAddress::create([
            'id'                  => 'addr_' . Str::random(20),
            'customer_id'         => $customerId,
            'first_name'          => $addr['first_name']  ?? null,
            'last_name'           => $addr['last_name']   ?? null,
            'phone'               => $addr['phone']       ?? null,
            'line1'               => $line1,
            'line2'               => $addr['line2']       ?? null,
            'city'                => $city,
            'region'              => $addr['region']      ?? null,
            'postal_code'         => $addr['postal_code'] ?? null,
            'country'             => $addr['country'] ?? 'ZW',
            'is_default_shipping' => ! $hasAny,
            'is_default_billing'  => ! $hasAny,
        ]);
    }
}
