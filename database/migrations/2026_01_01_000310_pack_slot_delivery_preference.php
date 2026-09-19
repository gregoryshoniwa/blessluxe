<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How each buyer gets their piece once BLESSLUXE has collected the consignment
 * from the courier.
 *
 * Lives on pack_slots rather than package_items because the buyer must be able to
 * choose at CHECKOUT — before any package_item exists — and change it afterwards.
 * The slot exists from campaign launch and already carries customer_id and order_id.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pack_slots', function (Blueprint $table) {
            // 'collect' is the default because it is free, needs no address and no
            // payment, and so can never strand a piece nobody can dispatch.
            $table->string('delivery_preference', 16)->default('collect')->after('line_item_id');
            $table->string('forward_address_id')->nullable()->after('delivery_preference');
            // Snapshot of the chosen address: address books get edited and deleted,
            // and a dispatched label must not mutate underneath a shipment.
            $table->json('forward_address')->nullable()->after('forward_address_id');
            $table->integer('forward_fee_amount')->nullable()->after('forward_address');
            $table->string('forward_fee_status', 16)->default('none')->after('forward_fee_amount');
            $table->string('forward_payment_session_id')->nullable()->after('forward_fee_status');
            // Stamped when admin acts on the piece; the buyer can change their mind
            // freely until then.
            $table->timestamp('preference_locked_at')->nullable()->after('forward_payment_session_id');

            $table->index(['delivery_preference', 'forward_fee_status'], 'pack_slots_delivery_index');
        });

        Schema::table('payment_sessions', function (Blueprint $table) {
            // THE critical column. PaynowController creates an Order for any paid
            // session without one; a forwarding fee has no order, so without this
            // discriminator a paid shipping fee would mint a second Order, credit
            // Blits on it and possibly accrue affiliate commission.
            $table->string('kind', 24)->default('order')->after('provider');
            $table->index('kind');
        });
    }

    public function down(): void
    {
        Schema::table('payment_sessions', function (Blueprint $table) {
            $table->dropIndex(['kind']);
            $table->dropColumn('kind');
        });

        Schema::table('pack_slots', function (Blueprint $table) {
            $table->dropIndex('pack_slots_delivery_index');
            $table->dropColumn([
                'delivery_preference', 'forward_address_id', 'forward_address',
                'forward_fee_amount', 'forward_fee_status',
                'forward_payment_session_id', 'preference_locked_at',
            ]);
        });
    }
};
