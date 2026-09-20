<?php

namespace App\Services;

use App\Enums\PieceStatus;
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
 *   2. Credit Bees back to the customer if they redeemed any
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
            $beesRefunded = 0;
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

            // 2. Refund Bees if any were debited at checkout.
            $beesDebited = (int) ($order->metadata['blits_debited'] ?? 0);
            if ($beesDebited > 0 && $order->customer_id) {
                Bees::credit($order->customer_id, $beesDebited, 'order_refund', $order->id);
                $beesRefunded = $beesDebited;
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
            // is_pack filter is load-bearing. A pack consignment is SHARED by every
            // buyer in the campaign, so cancelling it here would kill the shipment
            // for four other people and fire four "your order was returned" emails.
            // Withdrawing a single buyer's piece is handled separately (Phase 6);
            // the consignment's own status is never touched by one buyer's refund.
            $packages = Shipping::packagesForOrder($order)->where('is_pack', false);
            foreach ($packages as $pkg) {
                if (! $pkg->shipped_at) {
                    Shipping::recordEvent($pkg, 'cancelled', null, $reason ? "Order refunded — {$reason}" : 'Order refunded', 'system');
                } else {
                    // Already in transit — needs a return flow, not a cancel.
                    Shipping::recordEvent($pkg, 'returned', null, $reason ? "Refunded post-ship — {$reason}" : 'Refunded post-ship', 'system');
                }
            }

            // 4b. Pack slots are withdrawn individually. The shared consignment's
            //     own status is NEVER changed by one buyer's refund.
            self::withdrawPackSlots($order, $reason);

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
                'blits_refunded'    => $beesRefunded,
                'affiliate_reversed'=> $affReversed,
                'already_refunded'  => false,
            ];
        });
    }

    /**
     * Withdraw this order's pack slots without disturbing anyone else's.
     *
     * A leg-1 consignment is shared by every buyer in the campaign. Recording
     * 'cancelled' on it — which is what would happen if pack packages were treated
     * like ordinary ones — would cancel four other people's shipment and, once
     * notifications land, email them all to say their order was returned. So the
     * consignment's status is left completely alone; only this buyer's piece moves.
     */
    private static function withdrawPackSlots(Order $order, ?string $reason): void
    {
        $slots = DB::table('pack_slots')
            ->where('order_id', $order->id)
            ->whereNull('deleted_at')
            ->get(['id', 'pack_campaign_id', 'size_label']);

        foreach ($slots as $slot) {
            $item = DB::table('package_items')->where('pack_slot_id', $slot->id)->first();
            $consignment = $item ? Package::find($item->package_id) : null;

            // Mark the piece cancelled — never delete it. sub_code positions have to
            // stay stable; the hub may already hold a printed manifest.
            if ($item) {
                DB::table('package_items')->where('id', $item->id)->update([
                    'status'     => PieceStatus::Cancelled->value,
                    'updated_at' => now(),
                ]);
            }

            // Return the slot to the pool only while the pack can still be changed.
            if (! $consignment?->shipped_at) {
                DB::table('pack_slots')->where('id', $slot->id)->update([
                    'status'         => 'available',
                    'customer_id'    => null,
                    'order_id'       => null,
                    'line_item_id'   => null,
                    'reserved_until' => null,
                    'updated_at'     => now(),
                ]);

                // A campaign that had filled is open again.
                DB::table('pack_campaigns')
                    ->where('id', $slot->pack_campaign_id)
                    ->where('status', 'filled')
                    ->update(['status' => 'open', 'filled_at' => null, 'updated_at' => now()]);
            }

            if ($consignment) {
                // A note on the timeline at the CURRENT status — not a status change,
                // and silent so no buyer is emailed about someone else's refund.
                Shipping::recordEvent(
                    $consignment,
                    $consignment->status,
                    null,
                    trim(($item->sub_code ?? 'A piece') . ' withdrawn — refunded' . ($reason ? " ({$reason})" : '') . '.'),
                    'system',
                    silent: true,
                );
            }
        }
    }
}
