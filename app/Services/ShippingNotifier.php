<?php

namespace App\Services;

use App\Enums\PackageStatus;
use App\Mail\ShipmentUpdateMail;
use App\Models\Package;
use App\Models\PackageEvent;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Tells customers their goods have moved.
 *
 * Hooked to the single funnel (Shipping::recordEvent), so every status change goes
 * through here and nothing has to remember to notify.
 *
 * A pack consignment is SHARED by every buyer in the campaign, so a single event
 * fans out to many people. The rules below exist to make a cross-buyer leak
 * structurally impossible rather than merely unlikely:
 *
 *   1. One Mail::to() per buyer. Never a multi-recipient to(), never cc, never bcc.
 *   2. Each Mailable is built from that buyer's OWN pre-filtered pieces.
 *   3. Collection PINs are only ever included for the buyer who owns them.
 */
class ShippingNotifier
{
    public static function onEvent(Package $package, PackageEvent $event): void
    {
        $status = PackageStatus::tryFrom((string) $event->status);
        if (! $status || ! $status->notifiesCustomer()) return;

        // Idempotency. Admins legitimately log repeated scans, and IPN/poll races
        // re-deliver events; an already-notified status must not notify again.
        $alreadyNotified = PackageEvent::where('package_id', $package->id)
            ->where('status', $event->status)
            ->whereNotNull('notified_at')
            ->exists();

        if ($alreadyNotified) return;

        $sent = 0;
        $failed = 0;

        foreach (self::recipients($package) as $recipient) {
            try {
                Mail::to($recipient['email'])->send(new ShipmentUpdateMail(
                    package: $package,
                    status: $status,
                    orderNumber: $recipient['order_number'],
                    pieces: $recipient['pieces'],
                ));

                Notifications::forCustomer(
                    $recipient['customer_id'],
                    'shipment_' . $status->value,
                    self::title($package, $status),
                    self::body($package, $status, $recipient['pieces']),
                    '/account/orders/' . $recipient['order_number'],
                );

                $sent++;
            } catch (\Throwable $e) {
                // One bad address must not stop the other buyers being told.
                $failed++;
                Log::warning('Shipment notification failed', [
                    'package' => $package->package_code,
                    'email'   => $recipient['email'],
                    'error'   => $e->getMessage(),
                ]);
            }
        }

        $event->update(['notified_at' => now()]);

        if ($sent || $failed) {
            Log::info("Shipment notification: {$package->package_code} {$status->value} — sent {$sent}, failed {$failed}");
        }
    }

    /**
     * One entry per buyer, each carrying only their own pieces.
     *
     * @return array<int,array{customer_id:?string,email:string,order_number:string,pieces:array}>
     */
    private static function recipients(Package $package): array
    {
        if (! $package->is_pack) {
            $order = $package->order;
            if (! $order?->email) return [];

            return [[
                'customer_id'  => $order->customer_id,
                'email'        => $order->email,
                'order_number' => $order->order_number,
                'pieces'       => $package->items()->get()->all(),
            ]];
        }

        // Group the manifest by owning order, so each buyer gets exactly their own.
        $items = $package->items()->whereNotNull('pack_slot_id')->get();
        $slots = DB::table('pack_slots')
            ->whereIn('id', $items->pluck('pack_slot_id'))
            ->whereNotNull('order_id')
            ->pluck('order_id', 'id');

        $orders = DB::table('orders')
            ->whereIn('id', $slots->values()->unique())
            ->get(['id', 'order_number', 'email', 'customer_id'])
            ->keyBy('id');

        $byOrder = [];
        foreach ($items as $item) {
            $orderId = $slots[$item->pack_slot_id] ?? null;
            if (! $orderId || ! isset($orders[$orderId])) continue;
            // A withdrawn piece has no buyer to tell.
            if ($item->status === \App\Enums\PieceStatus::Cancelled->value) continue;
            $byOrder[$orderId][] = $item;
        }

        $out = [];
        foreach ($byOrder as $orderId => $pieces) {
            $order = $orders[$orderId];
            if (! $order->email) continue;
            $out[] = [
                'customer_id'  => $order->customer_id,
                'email'        => $order->email,
                'order_number' => $order->order_number,
                'pieces'       => $pieces,
            ];
        }

        return $out;
    }

    private static function title(Package $package, PackageStatus $status): string
    {
        if ($package->is_pack) {
            return match ($status) {
                PackageStatus::Shipped   => 'Your pack has left the supplier',
                PackageStatus::Delivered => 'Your piece is ready',
                PackageStatus::Returned  => 'Your pack was returned',
                default                  => $status->consignmentLabel(),
            };
        }

        return match ($status) {
            PackageStatus::Shipped        => 'Your order has shipped',
            PackageStatus::OutForDelivery => 'Out for delivery today',
            PackageStatus::Delivered      => 'Delivered',
            PackageStatus::Returned       => 'Your order was returned',
            default                       => $status->label(),
        };
    }

    private static function body(Package $package, PackageStatus $status, array $pieces): string
    {
        // A pack consignment's "delivered" means BLESSLUXE has the goods — saying
        // "delivered" to the buyer here would be a plain lie.
        if ($package->is_pack && $status === PackageStatus::Delivered) {
            $pins = array_filter(array_map(fn ($p) => $p->collection_pin, $pieces));

            return $pins
                ? 'Your piece has arrived at BLESSLUXE. Your collection code is ' . implode(', ', $pins) . '.'
                : 'Your piece has arrived at BLESSLUXE and is being prepared for you.';
        }

        return $package->is_pack
            ? $status->consignmentLabel() . '.'
            : $status->label() . '.';
    }
}
