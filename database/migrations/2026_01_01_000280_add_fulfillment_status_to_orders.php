<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Orders carried payment state but no fulfilment state, so an order that was paid
 * and not yet shipped looked identical to one that had been delivered. Shopify's
 * split: financial status and fulfilment status answer different questions and
 * cannot share a column.
 *
 * Always DERIVED from the order's packages by Shipping::syncOrderFulfillment();
 * denormalised onto the order so admin can filter on it with an index seek
 * instead of joining packages for every row.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            if (! Schema::hasColumn('orders', 'fulfillment_status')) {
                $table->string('fulfillment_status', 32)->default('unfulfilled')->after('payment_status');
                $table->index('fulfillment_status');
            }
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            if (Schema::hasColumn('orders', 'fulfillment_status')) {
                $table->dropIndex(['fulfillment_status']);
                $table->dropColumn('fulfillment_status');
            }
        });
    }
};
