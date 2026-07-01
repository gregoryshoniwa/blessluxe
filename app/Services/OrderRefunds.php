<?php

namespace App\Services;

use App\Models\Affiliate;
use App\Models\AffiliateSale;
use App\Models\Order;
use App\Models\Package;
use App\Models\ProductVariant;
use Illuminate\Support\Facades\DB;

/**
 * Refund orchestration. We don't auto-call the Paynow refund API yet —
 * the admin still has to push the money back through the Paynow dashboard.
 * What this DOES do, atomically, when an order is refunded:
 *
 *   1. Restock variants we'd decremented at order time
 *   2. Credit Blits back to the customer if they redeemed any
 *   3. Cancel any AffiliateSale for the order + reverse the affiliate's
 *      total_earnings (preventing payout of a refunded sale)
 *   4. Cancel the package + record a "cancelled" event on the timeline
 *   5. Flip the order itself to status=refunded, payment_status=refunded
 *
 * Idempotent — calling twice on the same order is a no-op the second time.
 */
class OrderRefunds
{
    /**
     * @return array{
     *   order_id: string,
     *   restocked: array<string,int>,
     *   blits_refunded: int,
     *   affiliate_reversed: int,
     *   already_refunded: bool,
     * }
     */
    public static function refund(Order $order, ?string $reason = null): array
    {
        if ($order->status === 'refunded') {
            return [
                'order_id'          => $order->id,
                'restocked'         => [],
                'blits_refunded'    => 0,
                'affiliate_reversed'=> 0,
                'already_refunded'  => true,
            ];
        }

        return DB::transaction(function () use ($order, $reason) {
            $restocked = [];
            $blitsRefunded = 0;
            $affReversed = 0;

            // 1. Restock inventory-managed variants line-by-line.
            foreach ($order->lineItems as $line) {
                $variant = ProductVariant::find($line->variant_id);
                if (! $variant || ! $variant->manage_inventory) continue;
                ProductVariant::where('id', $variant->id)->update([
                    'inventory_quantity' => DB::raw('inventory_quantity + ' . (int) $line->quantity),
                    'updated_at'         => now(),
                ]);
                $restocked[$variant->id] = ($restocked[$variant->id] ?? 0) + (int) $line->quantity;
                // Record the movement so the audit trail explains why stock went up.
                DB::table('inventory_movements')->insert([
                    'id'         => 'inv_' . \Illuminate\Support\Str::random(16),
                    'variant_id' => $variant->id,
                    'delta'      => (int) $line->quantity,
                    'reason'     => 'return',
                    'reference'  => $order->id,
                    'notes'      => $reason ? "Refund: {$reason}" : 'Refund',
                    'created_by' => 'system',
                    'created_at' => now(),
                ]);
            }

            // 2. Refund Blits if any were debited at checkout.
            $blitsDebited = (int) ($order->metadata['blits_debited'] ?? 0);
            if ($blitsDebited > 0 && $order->customer_id) {
                Blits::credit($order->customer_id, $blitsDebited, 'order_refund', $order->id);
                $blitsRefunded = $blitsDebited;
            }

            // 3. Cancel affiliate sales for this order. Reverse the
            //    affiliate's running earnings only if the sale was still
            //    `pending` — paid sales already settled through a payout
            //    so we leave those alone (admin can claw back manually if
            //    needed).
            $sales = AffiliateSale::where('order_id', $order->id)->get();
            foreach ($sales as $sale) {
                if ($sale->status === 'cancelled') continue;
                if ($sale->status === 'pending') {
                    Affiliate::where('id', $sale->affiliate_id)->update([
                        'total_earnings' => DB::raw('GREATEST(0, total_earnings - ' . (int) $sale->commission_amount . ')'),
                        'updated_at'     => now(),
                    ]);
                    $affReversed += (int) $sale->commission_amount;
                }
                $sale->update(['status' => 'cancelled']);
            }

            // 4. Cancel the package if it hasn't shipped yet; either way,
            //    record a "cancelled" event so /track shows the refund.
            $packages = Package::where('order_id', $order->id)->get();
            foreach ($packages as $pkg) {
                if (! $pkg->shipped_at) {
                    Shipping::recordEvent($pkg, 'cancelled', null, $reason ? "Order refunded — {$reason}" : 'Order refunded', 'system');
                } else {
                    // Already in transit — needs a return flow, not a cancel.
                    Shipping::recordEvent($pkg, 'returned', null, $reason ? "Refunded post-ship — {$reason}" : 'Refunded post-ship', 'system');
                }
            }

            // 5. Mark the order itself refunded.
            $metadata = $order->metadata ?: [];
            $metadata['refund_reason']     = $reason;
            $metadata['refund_recorded_at']= now()->toIso8601String();
            $order->update([
                'status'         => 'refunded',
                'payment_status' => 'refunded',
                'metadata'       => $metadata,
            ]);

            return [
                'order_id'          => $order->id,
                'restocked'         => $restocked,
                'blits_refunded'    => $blitsRefunded,
                'affiliate_reversed'=> $affReversed,
                'already_refunded'  => false,
            ];
        });
    }
}
