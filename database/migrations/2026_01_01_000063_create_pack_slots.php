<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pack_slots', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('pack_campaign_id');
            $table->string('variant_id');
            $table->string('size_label')->nullable();
            // 'available' is the default; 'reserved' has a TTL (reserved_until)
            // and a customer_id; 'paid' is permanent (post-checkout).
            $table->string('status', 32)->default('available');
            $table->string('customer_id')->nullable();
            $table->timestamp('reserved_until')->nullable();
            $table->string('order_id')->nullable();
            $table->string('line_item_id')->nullable();
            $table->timestamps();
            $table->timestamp('deleted_at')->nullable();
            $table->foreign('pack_campaign_id')->references('id')->on('pack_campaigns')->cascadeOnDelete();
            $table->foreign('variant_id')->references('id')->on('product_variants')->cascadeOnDelete();
            $table->foreign('customer_id')->references('id')->on('customers')->nullOnDelete();
            $table->foreign('order_id')->references('id')->on('orders')->nullOnDelete();
            $table->index(['pack_campaign_id', 'status']);
            $table->index('customer_id');
            $table->index('reserved_until');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pack_slots');
    }
};
