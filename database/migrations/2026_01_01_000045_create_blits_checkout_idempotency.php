<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('blits_checkout_idempotency', function (Blueprint $table) {
            $table->string('idempotency_key')->primary();
            $table->string('customer_id');
            $table->integer('blits_debited');
            $table->integer('usd_credited')->nullable();
            $table->string('status', 32)->default('pending');
            $table->timestamps();
            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('blits_checkout_idempotency');
    }
};
