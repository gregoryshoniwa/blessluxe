<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Paid product exclusivity for affiliates.
 *
 * An affiliate buys the sole right to sell a product for a fixed term. While it
 * is held, the product is hidden from the main shop AND from every other
 * affiliate — a genuine takeover, which is why it can't be bought on anything
 * BLESSLUXE hasn't explicitly put up for it.
 *
 * Structured after how real exclusive distribution agreements work:
 *
 *   - OPT-IN per product. `exclusivity_enabled` defaults to FALSE. Because a
 *     grant removes an item from BLESSLUXE's own shop and is self-serve, the
 *     default must be that nothing is for sale. Otherwise the first affiliate
 *     with a card could pull a bestseller off the storefront.
 *   - TIME-BOXED. Terms expire; nothing is perpetual.
 *   - MINIMUM VOLUME. The standard protection in distribution contracts: miss
 *     the minimum and exclusivity lapses back to open rather than letting a
 *     dormant holder sit on a product indefinitely.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            // Nothing is exclusive-able until BLESSLUXE says so and prices it.
            $table->boolean('exclusivity_enabled')->default(false)->after('default_courier_id');
            $table->integer('exclusivity_fee')->nullable()->after('exclusivity_enabled');
            $table->unsignedSmallInteger('exclusivity_term_days')->default(30)->after('exclusivity_fee');
            // Units the holder must sell within a term to keep it.
            $table->unsignedSmallInteger('exclusivity_min_units')->default(0)->after('exclusivity_term_days');
            $table->index('exclusivity_enabled');
        });

        Schema::create('product_exclusivities', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('product_id');
            $table->string('affiliate_id');

            // pending_payment -> active -> (renewed | lapsed | cancelled)
            $table->string('status', 20)->default('pending_payment');

            // Terms snapshotted at purchase, so an admin editing the product's
            // price or minimum later cannot change a deal already struck.
            $table->integer('fee_amount');
            $table->unsignedSmallInteger('term_days');
            $table->unsignedSmallInteger('min_units');

            $table->unsignedInteger('units_sold')->default(0);
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->boolean('auto_renew')->default(true);
            $table->string('payment_session_id')->nullable();
            $table->timestamp('lapsed_at')->nullable();
            $table->string('lapse_reason')->nullable();
            $table->timestamps();

            $table->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
            $table->foreign('affiliate_id')->references('id')->on('affiliates')->cascadeOnDelete();

            // The hot lookup: "is this product currently spoken for?"
            $table->index(['product_id', 'status', 'ends_at']);
            $table->index(['affiliate_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_exclusivities');
        Schema::table('products', function (Blueprint $table) {
            $table->dropIndex(['exclusivity_enabled']);
            $table->dropColumn([
                'exclusivity_enabled', 'exclusivity_fee',
                'exclusivity_term_days', 'exclusivity_min_units',
            ]);
        });
    }
};
