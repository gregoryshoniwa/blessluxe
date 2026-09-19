<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Not everything BLESSLUXE sells is imported.
 *
 *   IMPORT — sourced from a supplier in Turkey/China, carried by a courier, lands
 *            at the courier depot, collected by BLESSLUXE, then handed to the buyer.
 *            The buyer picks which courier carries it and pays that courier's rate.
 *   LOCAL  — already in Zimbabwe. No courier leg, no import shipping cost; collect
 *            or take quick local delivery.
 *
 * Charging import shipping on local stock would overcharge, so `sourcing` defaults
 * to 'local': the safe direction. Admin marks imports explicitly.
 */
return new class extends Migration
{
    public function up(): void
    {
        // ─── Couriers the buyer can choose between ──────────────────────
        Schema::create('couriers', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('code')->unique();          // matches config/carriers.php where possible
            $table->string('name');
            $table->text('description')->nullable();   // "cheapest", "fastest" etc
            $table->integer('base_fee')->default(0);   // cents, per consignment piece
            $table->integer('per_item_fee')->default(0);
            $table->unsignedSmallInteger('min_days')->nullable();
            $table->unsignedSmallInteger('max_days')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('is_default')->default(false);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->index(['is_active', 'sort_order']);
        });

        // ─── Local vs import, set by admin on the product ───────────────
        Schema::table('products', function (Blueprint $table) {
            $table->string('sourcing', 16)->default('local')->after('status');
            // Overrides the courier choice for this product when it must travel a
            // particular way; null means the buyer picks.
            $table->string('default_courier_id')->nullable()->after('sourcing');
            $table->index('sourcing');
        });

        Schema::table('pack_definitions', function (Blueprint $table) {
            // Packs are normally imports, but a pack of local stock is legitimate.
            $table->string('sourcing', 16)->default('import')->after('status');
        });

        // ─── The buyer's chosen courier, per slot ───────────────────────
        Schema::table('pack_slots', function (Blueprint $table) {
            $table->string('courier_id')->nullable()->after('delivery_preference');
            $table->index('courier_id');
        });

        Schema::table('packages', function (Blueprint $table) {
            $table->string('courier_id')->nullable()->after('carrier');
        });

        // ─── A genuinely secret collection credential ───────────────────
        Schema::table('package_items', function (Blueprint $table) {
            // sub_code (BL-XXXX-XXXX-Y-NN) is derivable from the consignment code
            // and is printed on the manifest, so it identifies a piece but proves
            // nothing. collection_pin is random, never derivable, and shown only to
            // the buyer who owns the piece.
            $table->string('collection_pin', 12)->nullable()->after('sub_code');
            $table->unsignedTinyInteger('collection_attempts')->default(0)->after('collection_pin');
            $table->index('collection_pin');
        });

        $this->seedCouriers();
    }

    /** Five starting couriers; admin edits rates and adds more. */
    private function seedCouriers(): void
    {
        $now = now();
        $rows = [
            ['code' => 'zimpost', 'name' => 'Zimpost',          'description' => 'Cheapest, slowest',       'base_fee' => 1200, 'per_item_fee' => 200, 'min_days' => 14, 'max_days' => 28, 'sort_order' => 1, 'is_default' => false],
            ['code' => 'swift',   'name' => 'Swift Transport',  'description' => 'Regional road freight',   'base_fee' => 1800, 'per_item_fee' => 300, 'min_days' => 10, 'max_days' => 18, 'sort_order' => 2, 'is_default' => true],
            ['code' => 'aramex',  'name' => 'Aramex',           'description' => 'Balanced cost and speed', 'base_fee' => 2500, 'per_item_fee' => 400, 'min_days' => 7,  'max_days' => 14, 'sort_order' => 3, 'is_default' => false],
            ['code' => 'dhl',     'name' => 'DHL Express',      'description' => 'Fastest, premium',        'base_fee' => 4500, 'per_item_fee' => 600, 'min_days' => 3,  'max_days' => 7,  'sort_order' => 4, 'is_default' => false],
            ['code' => 'fedex',   'name' => 'FedEx',            'description' => 'Fast, tracked throughout','base_fee' => 4200, 'per_item_fee' => 550, 'min_days' => 4,  'max_days' => 8,  'sort_order' => 5, 'is_default' => false],
        ];

        foreach ($rows as $i => $r) {
            DB::table('couriers')->updateOrInsert(['code' => $r['code']], array_merge($r, [
                'id'         => 'cour_' . $r['code'],
                'is_active'  => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]));
        }
    }

    public function down(): void
    {
        Schema::table('package_items', function (Blueprint $table) {
            $table->dropIndex(['collection_pin']);
            $table->dropColumn(['collection_pin', 'collection_attempts']);
        });
        Schema::table('packages', fn (Blueprint $t) => $t->dropColumn('courier_id'));
        Schema::table('pack_slots', function (Blueprint $table) {
            $table->dropIndex(['courier_id']);
            $table->dropColumn('courier_id');
        });
        Schema::table('pack_definitions', fn (Blueprint $t) => $t->dropColumn('sourcing'));
        Schema::table('products', function (Blueprint $table) {
            $table->dropIndex(['sourcing']);
            $table->dropColumn(['sourcing', 'default_courier_id']);
        });
        Schema::dropIfExists('couriers');
    }
};
