<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('blits_gift_events', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('from_customer_id')->nullable();
            $table->string('to_customer_id');
            $table->string('gift_type_id')->nullable();
            $table->integer('blits_amount');
            $table->text('note')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('from_customer_id')->references('id')->on('customers')->nullOnDelete();
            $table->foreign('to_customer_id')->references('id')->on('customers')->cascadeOnDelete();
            $table->foreign('gift_type_id')->references('id')->on('blits_gift_types')->nullOnDelete();
            $table->index('to_customer_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('blits_gift_events');
    }
};
