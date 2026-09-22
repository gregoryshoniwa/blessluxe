<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Payments through more than one gateway.
 *
 * `provider` (already there) names the gateway that took the money. `method`
 * is what the customer chose to pay WITH (ecocash, card, …) — useful whether
 * or not the gateway cares. `provider_meta` holds whatever a gateway needs to
 * find the payment again (VelocityAfrica: the sales order and transaction
 * trace), so `poll_url` can stay the one opaque "poll handle" every driver
 * shares.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payment_sessions', function (Blueprint $table) {
            $table->string('method', 24)->nullable()->after('provider');
            $table->json('provider_meta')->nullable()->after('poll_url');
            $table->index(['provider', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('payment_sessions', function (Blueprint $table) {
            $table->dropIndex(['provider', 'status']);
            $table->dropColumn(['method', 'provider_meta']);
        });
    }
};
