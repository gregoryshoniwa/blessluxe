<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('affiliate_sales', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('affiliate_id');
            $table->string('order_id');
            $table->integer('order_total');
            $table->integer('commission_amount');
            $table->string('currency_code', 8)->default('usd');
            $table->string('status', 32)->default('pending');
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('affiliate_id')->references('id')->on('affiliates')->cascadeOnDelete();
            $table->index('affiliate_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('affiliate_sales');
    }
};
