<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('customer_id');
            $table->string('token')->unique();
            $table->timestamp('expires_at');
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
            $table->index('token');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_sessions');
    }
};
