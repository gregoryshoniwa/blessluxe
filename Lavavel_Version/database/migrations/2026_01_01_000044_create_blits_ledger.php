<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('blits_ledger', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('customer_id');
            $table->integer('delta');
            $table->integer('balance_after');
            $table->string('reason');
            $table->string('reference')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
            $table->index(['customer_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('blits_ledger');
    }
};
