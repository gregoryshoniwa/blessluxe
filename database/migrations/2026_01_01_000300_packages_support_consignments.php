<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Packs ship as ONE consignment to BLESSLUXE, shared by every buyer in the campaign.
 * That breaks the assumption baked into packages.order_id: a consignment belongs to
 * a campaign, not to any single buyer's order.
 *
 * Pointing it at one arbitrary buyer's order was rejected — the FK is ON DELETE
 * CASCADE, so purging that one order would destroy the consignment, its items and
 * its whole event history for everyone else. Nullable order_id makes the meaning
 * precise instead:
 *
 *     order_id IS NULL  <=>  is_pack = 1  <=>  leg-1 consignment
 *
 * Nothing in the DB enforces that invariant, so Shipping::ensureConsignmentForCampaign
 * guards it and PackConsignmentTest asserts it.
 *
 * ⚠️ Dropping and re-adding the FK is the one statement here that cannot be cleanly
 * rolled back. Both FK calls are guarded by a driver check because sqlite (the test
 * database) cannot drop foreign keys.
 */
return new class extends Migration
{
    private function isMysql(): bool
    {
        return DB::getDriverName() === 'mysql';
    }

    public function up(): void
    {
        Schema::table('packages', function (Blueprint $table) {
            if ($this->isMysql()) {
                $table->dropForeign('packages_order_id_foreign');
            }
        });

        Schema::table('packages', function (Blueprint $table) {
            $table->string('order_id')->nullable()->change();
        });

        Schema::table('packages', function (Blueprint $table) {
            if ($this->isMysql()) {
                $table->foreign('order_id')->references('id')->on('orders')->cascadeOnDelete();
                // pack_campaign_id existed since the original migration but never had
                // a constraint, so nothing stopped it pointing at a deleted campaign.
                $table->foreign('pack_campaign_id')->references('id')->on('pack_campaigns')->nullOnDelete();
            }
            $table->index(['is_pack', 'pack_campaign_id'], 'packages_pack_lookup_index');

            // 'customer' = ordinary parcel or leg-2 forward; 'hub' = leg-1 consignment.
            $table->string('destination_kind', 16)->default('customer')->after('pack_campaign_id');
            $table->string('destination_name')->nullable()->after('destination_kind');
            $table->string('destination_email')->nullable()->after('destination_name');
            $table->string('destination_phone')->nullable()->after('destination_email');

            // Redundant with is_pack + order_id, but makes every query and log line
            // self-documenting. Worth the column.
            $table->string('leg', 12)->nullable()->after('destination_phone');
            $table->string('parent_package_id')->nullable()->after('leg');
            $table->index('parent_package_id');
        });

        Schema::table('package_items', function (Blueprint $table) {
            $table->text('thumbnail')->nullable()->after('sku');
            $table->string('size_label')->nullable()->after('variant_title');
            $table->index(['package_id', 'pack_slot_id'], 'package_items_pkg_slot_index');
        });

        Schema::table('package_events', function (Blueprint $table) {
            // Notification idempotency: re-recording a status appends an event
            // (admins legitimately log repeated scans) but must not re-notify.
            $table->timestamp('notified_at')->nullable()->after('metadata');
            $table->index(['package_id', 'status'], 'package_events_pkg_status_index');
        });

        Schema::table('pack_campaigns', function (Blueprint $table) {
            $table->timestamp('filled_at')->nullable()->after('expires_at');
            // Denormalised pointer for O(1) lookup. Source of truth stays
            // packages.pack_campaign_id + is_pack.
            $table->string('consignment_package_id')->nullable()->after('filled_at');
            $table->integer('forward_fee_override')->nullable()->after('consignment_package_id');
            $table->index('consignment_package_id');
        });

        $this->backfill();
    }

    /**
     * Thumbnails live here rather than in the data-only backfill migration: a guard
     * there would have no-opped (this column did not exist yet) and never re-run.
     */
    private function backfill(): void
    {
        // UPDATE...JOIN is MySQL-only; sqlite (the test database) cannot parse it.
        // Portable row-by-row instead — this touches a handful of rows, once.
        $rows = DB::table('package_items')
            ->whereNull('thumbnail')
            ->whereNotNull('order_line_id')
            ->pluck('order_line_id', 'id');

        foreach ($rows as $itemId => $lineId) {
            $thumb = DB::table('order_line_items')->where('id', $lineId)->value('thumbnail');
            if ($thumb) {
                DB::table('package_items')->where('id', $itemId)->update(['thumbnail' => $thumb]);
            }
        }

        // Existing packages all predate consignments: they are ordinary parcels.
        DB::table('packages')->whereNull('leg')->update([
            'leg'              => 'direct',
            'destination_kind' => 'customer',
        ]);

        // Campaigns already marked filled should carry a filled_at.
        DB::table('pack_campaigns')
            ->where('status', 'filled')
            ->whereNull('filled_at')
            ->update(['filled_at' => DB::raw('updated_at')]);
    }

    public function down(): void
    {
        Schema::table('pack_campaigns', function (Blueprint $table) {
            $table->dropIndex(['consignment_package_id']);
            $table->dropColumn(['filled_at', 'consignment_package_id', 'forward_fee_override']);
        });

        Schema::table('package_events', function (Blueprint $table) {
            $table->dropIndex('package_events_pkg_status_index');
            $table->dropColumn('notified_at');
        });

        Schema::table('package_items', function (Blueprint $table) {
            $table->dropIndex('package_items_pkg_slot_index');
            $table->dropColumn(['thumbnail', 'size_label']);
        });

        Schema::table('packages', function (Blueprint $table) {
            if ($this->isMysql()) {
                $table->dropForeign(['pack_campaign_id']);
            }
            $table->dropIndex('packages_pack_lookup_index');
            $table->dropIndex(['parent_package_id']);
            $table->dropColumn([
                'destination_kind', 'destination_name', 'destination_email',
                'destination_phone', 'leg', 'parent_package_id',
            ]);
        });

        // NOTE: order_id is deliberately left NULLABLE. Any consignment created
        // while this migration was applied has a null order_id, and restoring the
        // NOT NULL constraint would fail against that data. Reverting fully means
        // deleting consignments first — a data decision, not a schema one.
    }
};
