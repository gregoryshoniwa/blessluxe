<?php

use App\Services\Shipping;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Data-only repair for orders placed before the pack↔line link was wired up.
 *
 * Idempotent and side-effect free: every statement is guarded so this is a clean
 * no-op on a fresh `migrate:fresh --seed`, and it deliberately sends no mail and
 * mints no consignment. Minting one has side effects (sub_codes, events,
 * notifications) and migrations must not send email — that belongs to the admin
 * endpoint in a later phase.
 *
 * down() is intentionally a no-op: this repairs data that was wrong, and
 * re-breaking it on rollback would help nobody.
 */
return new class extends Migration
{
    public function up(): void
    {
        // NOTE: package_items.thumbnail is backfilled by the migration that CREATES
        // that column, not here — a guarded no-op in this file would never re-run
        // once this migration is marked applied.
        $this->relinkPackSlots();
        $this->backfillFulfillmentStatus();
    }

    public function down(): void
    {
        // No-op by design. See the class docblock.
    }

    /**
     * Checkout used to drop each cart line's metadata, so the pack_slot -> order_line
     * link was lost. Rebuild it by matching the slot's variant within its own order.
     */
    private function relinkPackSlots(): void
    {
        if (! Schema::hasTable('pack_slots') || ! Schema::hasTable('order_line_items')) return;

        $slots = DB::table('pack_slots')
            ->whereNotNull('order_id')
            ->whereNull('line_item_id')
            ->whereNull('deleted_at')
            ->get(['id', 'order_id', 'variant_id', 'pack_campaign_id']);

        foreach ($slots as $slot) {
            // Match on variant within the order. Ambiguous only if one order holds
            // two slots of the same variant; ->whereNotIn guards against reusing a
            // line already claimed by another slot.
            $claimed = DB::table('pack_slots')
                ->where('order_id', $slot->order_id)
                ->whereNotNull('line_item_id')
                ->pluck('line_item_id');

            $lineId = DB::table('order_line_items')
                ->where('order_id', $slot->order_id)
                ->where('variant_id', $slot->variant_id)
                ->whereNotIn('id', $claimed)
                ->value('id');

            if (! $lineId) continue;

            $publicCode = DB::table('pack_campaigns')->where('id', $slot->pack_campaign_id)->value('public_code');

            DB::table('pack_slots')->where('id', $slot->id)->update([
                'line_item_id' => $lineId,
                'updated_at'   => now(),
            ]);

            // Restore the metadata the line should have been created with.
            $existing = json_decode((string) DB::table('order_line_items')->where('id', $lineId)->value('metadata'), true) ?: [];
            DB::table('order_line_items')->where('id', $lineId)->update([
                'metadata' => json_encode(array_merge($existing, [
                    'pack_slot_id'     => $slot->id,
                    'pack_campaign_id' => $slot->pack_campaign_id,
                    'pack_public_code' => $publicCode,
                ])),
            ]);
        }
    }

    /** Populate the new derived column using the same logic the app will use. */
    private function backfillFulfillmentStatus(): void
    {
        if (! Schema::hasColumn('orders', 'fulfillment_status')) return;

        foreach (DB::table('orders')->pluck('id') as $orderId) {
            Shipping::syncOrderFulfillment($orderId);
        }
    }
};
