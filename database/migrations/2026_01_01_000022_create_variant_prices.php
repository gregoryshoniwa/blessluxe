<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('variant_prices', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('variant_id');
            $table->string('region_id')->nullable();
            $table->string('currency_code', 8)->default('usd');
            $table->integer('amount');
            $table->integer('sale_amount')->nullable();
            $table->timestamp('sale_starts_at')->nullable();
            $table->timestamp('sale_ends_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('variant_id')->references('id')->on('product_variants')->cascadeOnDelete();
            $table->foreign('region_id')->references('id')->on('regions')->nullOnDelete();
            $table->index('variant_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('variant_prices');
    }
};
