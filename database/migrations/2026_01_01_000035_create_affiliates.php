<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('affiliates', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('code')->unique();
            $table->string('first_name')->nullable();
            $table->string('last_name')->nullable();
            $table->string('email')->unique();
            $table->decimal('commission_rate', 6, 3)->default(10);
            $table->string('status', 32)->default('pending');
            $table->integer('total_earnings')->default(0);
            $table->integer('paid_out')->default(0);
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->index('code');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('affiliates');
    }
};
