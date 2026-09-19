<?php

namespace App\Services;

use App\Enums\PieceStatus;
use App\Models\Package;
use App\Models\PackageItem;
use App\Support\Address;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Leg 2: getting a buyer's piece from BLESSLUXE to the buyer.
 *
 * Goods arrive supplier -> courier -> BLESSLUXE. From there each buyer either
 * collects in person (free, the default) or pays a fee to have their piece sent on.
 *
 * The fee is a SEPARATE Paynow payment, not a checkout surcharge, because the
 * buyer can change their mind at any point up to dispatch — a surcharge taken at
 * checkout would owe a refund on every change.
 */
class PackForwarding
{
    /** Marks a payment_sessions row as a shipping fee, not a sale. */
    public const SESSION_KIND = 'pack_forwarding';

    public const PREF_COLLECT = 'collect';
    public const PREF_FORWARD = 'forward';

    /**
     * Set or change a slot's delivery preference.
     *
     * Free to change until admin acts on the piece. Switching away from a PAID
     * forward is deliberately not self-serve: it creates a refund liability, so it
     * routes to support instead of silently owing money.
     *
     * @throws \RuntimeException with a human-readable reason
     */
    public static function setPreference(string $slotId, string $preference, ?array $address = null, ?string $courierId = null): array
    {
        $slot = DB::table('pack_slots')->where('id', $slotId)->first();
        if (! $slot) throw new \RuntimeException('That slot no longer exists.');

        if ($slot->preference_locked_at) {
            throw new \RuntimeException('Your piece has already been dispatched or handed over, so this can no longer be changed.');
        }

        if ($slot->forward_fee_status === 'paid' && $preference === self::PREF_COLLECT) {
            throw new \RuntimeException('You have already paid for forwarding. Contact us and we will switch you to collection and refund the fee.');
        }

        if ($preference === self::PREF_COLLECT) {
            DB::table('pack_slots')->where('id', $slotId)->update([
                'delivery_preference' => self::PREF_COLLECT,
                'forward_address_id'  => null,
                'forward_address'     => null,
                'forward_fee_amount'  => null,
                'forward_fee_status'  => 'none',
                'updated_at'          => now(),
            ]);

            return self::quoteFor($slotId);
        }

        // Forwarding needs a real, labellable address. orders.shipping_address
        // carries no name and no phone, so it can never be used here.
        $normalised = Address::normalize($address ?? []);
        if (! $normalised['line1'] || ! $normalised['city']) {
            throw new \RuntimeException('A street address and city are needed to forward your piece.');
        }
        if (! $normalised['first_name'] && ! $normalised['last_name']) {
            throw new \RuntimeException('A recipient name is needed for the shipping label.');
        }

        $campaign = DB::table('pack_campaigns')->where('id', $slot->pack_campaign_id)->first();
        $fee = Fulfilment::forwardFeeFor($normalised['country'], $campaign->forward_fee_override ?? null);

        DB::table('pack_slots')->where('id', $slotId)->update([
            'delivery_preference' => self::PREF_FORWARD,
            'courier_id'          => $courierId ?: $slot->courier_id,
            'forward_address'     => json_encode($normalised),
            'forward_address_id'  => $address['id'] ?? null,
            // Frozen at selection. The Paynow session is built from this stored
            // value, never re-derived, so an admin editing the fee mid-flight
            // cannot produce a mismatch the buyer can screenshot.
            'forward_fee_amount'  => $fee,
            'forward_fee_status'  => $slot->forward_fee_status === 'paid' ? 'paid' : 'quoted',
            'updated_at'          => now(),
        ]);

        return self::quoteFor($slotId);
    }

    /** Current preference + fee for a slot, in the shape the UI renders. */
    public static function quoteFor(string $slotId): array
    {
        $slot = DB::table('pack_slots')->where('id', $slotId)->first();
        $settings = Fulfilment::settings();

        // The buyer's own piece, if the consignment has been listed yet.
        $item = PackageItem::where('pack_slot_id', $slotId)->first();

        return [
            'slot_id'            => $slotId,
            'preference'         => $slot->delivery_preference ?? self::PREF_COLLECT,
            'courier_id'         => $slot->courier_id,
            'forward_address'    => $slot->forward_address ? json_decode($slot->forward_address, true) : null,
            'fee_amount'         => $slot->forward_fee_amount,
            'fee_label'          => $slot->forward_fee_amount !== null
                ? '$' . number_format($slot->forward_fee_amount / 100, 2)
                : null,
            'fee_status'         => $slot->forward_fee_status ?? 'none',
            'locked'             => (bool) $slot->preference_locked_at,
            'collection_point'   => $settings['collection_point'],
            'collection_hours'   => $settings['collection_hours'],
            'cutoff_copy'        => 'You can change this until your piece is dispatched or handed over.',
            'sub_code'           => $item?->sub_code,
            // Only ever returned on the owning buyer's authenticated order page,
            // and only once BLESSLUXE physically has the goods.
            'collection_pin'     => $item?->collection_pin,
            'piece_status'       => $item?->status,
        ];
    }

    /**
     * Fee paid. Flip the slot and stage the piece for dispatch.
     *
     * Idempotent: a duplicate IPN, or the return-poll racing the IPN, must not
     * create a second last-mile package.
     */
    public static function markFeePaid($session): void
    {
        $snap   = $session->cart_snapshot ?? [];
        $slotId = $snap['pack_slot_id'] ?? null;
        if (! $slotId) return;

        $slot = DB::table('pack_slots')->where('id', $slotId)->first();
        if (! $slot || $slot->forward_fee_status === 'paid') return;   // already handled

        DB::table('pack_slots')->where('id', $slotId)->update([
            'forward_fee_status'         => 'paid',
            'forward_payment_session_id' => $session->id,
            'updated_at'                 => now(),
        ]);

        // The piece is paid for but not yet dispatched — admin still has to send it.
        DB::table('package_items')
            ->where('pack_slot_id', $slotId)
            ->whereNotIn('status', [PieceStatus::Cancelled->value, PieceStatus::Forwarded->value])
            ->update(['status' => PieceStatus::Forwarding->value, 'updated_at' => now()]);

        Notifications::forAllAdmins(
            'pack_forward_paid',
            'Forwarding fee paid',
            'A buyer has paid to have their pack piece forwarded. It is ready to dispatch.',
            '/admin/packages',
        );
    }

    /**
     * Create the last-mile package once admin actually sends the piece.
     *
     * This is an ordinary per-order package — order_id set, is_pack false — so it
     * reuses the entire existing tracking UI with no special cases.
     */
    public static function dispatch(PackageItem $item, ?string $adminId = null): ?Package
    {
        $slot = DB::table('pack_slots')->where('id', $item->pack_slot_id)->first();
        if (! $slot || ! $slot->order_id) return null;

        // Idempotent on the slot: at most one last-mile package ever.
        $existing = Package::where('order_id', $slot->order_id)->where('leg', 'forward')->first();
        if ($existing) return $existing;

        return DB::transaction(function () use ($item, $slot, $adminId) {
            $order = \App\Models\Order::find($slot->order_id);

            $package = Package::create([
                'id'                => 'pkg_' . Str::random(16),
                'package_code'      => Shipping::makeCode(),
                'order_id'          => $slot->order_id,
                'customer_id'       => $slot->customer_id,
                'customer_email'    => $order?->email,
                'status'            => 'created',
                'is_pack'           => false,
                'leg'               => 'forward',
                'parent_package_id' => $item->package_id,
                'pack_campaign_id'  => $slot->pack_campaign_id,
                'destination_kind'  => 'customer',
                'shipping_address'  => json_decode((string) $slot->forward_address, true) ?: [],
            ]);

            PackageItem::create([
                'id'            => 'pkgi_' . Str::random(16),
                'package_id'    => $package->id,
                'order_line_id' => $slot->line_item_id,
                'pack_slot_id'  => $slot->id,
                'variant_id'    => $item->variant_id,
                'product_id'    => $item->product_id,
                'product_title' => $item->product_title,
                'variant_title' => $item->variant_title,
                'size_label'    => $item->size_label,
                'sku'           => $item->sku,
                'thumbnail'     => $item->thumbnail,
                'quantity'      => $item->quantity,
                'unit_price'    => $item->unit_price,
                'status'        => PieceStatus::Forwarding->value,
            ]);

            // The piece has left BLESSLUXE's custody.
            $item->update([
                'status'     => PieceStatus::Forwarded->value,
                'claimed_at' => now(),
                // Prefixed: users.id is an int and customers.id is a cust_* string,
                // and they share this column.
                'claimed_by' => $adminId ? 'user:' . $adminId : 'system',
            ]);

            DB::table('pack_slots')->where('id', $slot->id)->update([
                'preference_locked_at' => now(),
                'updated_at'           => now(),
            ]);

            Shipping::recordEvent($package, 'created', null, 'Forwarding to you from BLESSLUXE.', 'system');

            return $package->fresh();
        });
    }

    /**
     * Mint the buyer's secret collection PIN.
     *
     * sub_code (BL-XXXX-XXXX-Y-NN) is printed on the manifest and is derivable from
     * the consignment code, so it says WHICH piece but proves nothing about WHO is
     * collecting. The PIN is random, shown only to the owning buyer, and is what
     * staff check at handover.
     *
     * Ambiguous characters are excluded — this gets read aloud and typed from a phone.
     */
    public static function ensureCollectionPin(PackageItem $item): string
    {
        if ($item->collection_pin) return $item->collection_pin;

        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/I/1
        do {
            $pin = '';
            for ($i = 0; $i < 6; $i++) $pin .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        } while (PackageItem::where('collection_pin', $pin)->exists());

        $item->update(['collection_pin' => $pin]);

        return $pin;
    }

    /**
     * Verify a PIN at handover.
     *
     * Rate-limited per piece: a 6-character PIN over a 32-character alphabet is
     * ~10^9 combinations, but without a cap someone with counter access could still
     * grind it. Ten wrong tries and the piece needs an admin override.
     *
     * Comparison is timing-safe — PIN length is fixed and public.
     */
    public static function verifyCollectionPin(PackageItem $item, string $candidate): bool
    {
        if ($item->collection_attempts >= 10) {
            throw new \RuntimeException('Too many incorrect attempts. An administrator must release this piece.');
        }

        $ok = $item->collection_pin
            && hash_equals((string) $item->collection_pin, strtoupper(trim($candidate)));

        if (! $ok) {
            $item->increment('collection_attempts');
            return false;
        }

        return true;
    }

    /** Buyer collected in person, after their PIN checked out. */
    public static function markCollected(PackageItem $item, string $by): void
    {
        $item->update([
            'status'     => PieceStatus::Collected->value,
            'claimed_at' => now(),
            'claimed_by' => $by,
        ]);

        if ($item->pack_slot_id) {
            DB::table('pack_slots')->where('id', $item->pack_slot_id)->update([
                'preference_locked_at' => now(),
                'updated_at'           => now(),
            ]);

            $orderId = DB::table('pack_slots')->where('id', $item->pack_slot_id)->value('order_id');
            if ($orderId) Shipping::syncOrderFulfillment($orderId);
        }
    }
}
