<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What the people in a series say to each other — the group chat a WhatsApp
 * series would have, kept on the page everyone was sent to.
 *
 * Ids are ULIDs so two messages in the same second stay in the order they were
 * sent, the same rule as chat messages. `pack_` stays in storage like the rest
 * of the series tables; nothing a person reads says "pack".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pack_campaign_posts', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('pack_campaign_id');
            $table->string('customer_id');
            $table->text('body');
            $table->timestamp('hidden_at')->nullable();      // staff took it down; the row stays
            $table->timestamp('created_at')->useCurrent();
            $table->index(['pack_campaign_id', 'created_at']);
            $table->index(['customer_id', 'created_at']);
            $table->foreign('pack_campaign_id')->references('id')->on('pack_campaigns')->cascadeOnDelete();
            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pack_campaign_posts');
    }
};
