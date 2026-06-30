<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('order_number')->unique();
            $table->string('cart_id')->nullable();
            $table->string('customer_id')->nullable();
            $table->string('region_id')->nullable();
            $table->string('email')->nullable();
            $table->string('currency_code', 8)->default('usd');
            $table->integer('total')->default(0);
            $table->integer('subtotal')->default(0);
            $table->integer('shipping_total')->default(0);
            $table->integer('discount_total')->default(0);
            $table->integer('tax_total')->default(0);
            $table->string('status', 32)->default('pending');
            $table->string('payment_method')->nullable();
            $table->string('payment_status')->nullable();
            $table->string('campaign_id')->nullable();
            $table->json('shipping_address')->nullable();
            $table->json('billing_address')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->foreign('cart_id')->references('id')->on('carts')->nullOnDelete();
            $table->foreign('customer_id')->references('id')->on('customers')->nullOnDelete();
            $table->foreign('region_id')->references('id')->on('regions')->nullOnDelete();
            $table->foreign('campaign_id')->references('id')->on('marketing_campaigns')->nullOnDelete();
            $table->index('customer_id');
            $table->index('created_at');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
