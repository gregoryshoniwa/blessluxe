<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('reference')->unique();
            $table->string('provider', 32)->default('paynow');
            $table->string('status', 32)->default('pending');
            $table->string('provider_status')->nullable();
            $table->string('provider_reference')->nullable();
            $table->text('poll_url')->nullable();
            $table->integer('amount');
            $table->string('currency_code', 8);
            $table->string('email')->nullable();
            $table->string('customer_id')->nullable();
            $table->json('cart_snapshot');
            $table->string('order_id')->nullable();
            $table->longText('raw_init_response')->nullable();
            $table->longText('raw_ipn_payload')->nullable();
            $table->timestamps();
            $table->foreign('customer_id')->references('id')->on('customers')->nullOnDelete();
            $table->foreign('order_id')->references('id')->on('orders')->nullOnDelete();
            $table->index('reference');
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_sessions');
    }
};
