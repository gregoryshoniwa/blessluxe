<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('affiliate_payouts', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('affiliate_id');
            $table->integer('amount');
            $table->string('currency_code', 8)->default('usd');
            $table->string('method', 32)->default('bank_transfer');
            $table->string('status', 32)->default('pending');
            $table->string('reference')->nullable();
            $table->text('notes')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->foreign('affiliate_id')->references('id')->on('affiliates')->cascadeOnDelete();
            $table->index('affiliate_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('affiliate_payouts');
    }
};
