<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_variants', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('product_id');
            $table->string('title');
            $table->string('sku')->nullable()->unique();
            $table->boolean('manage_inventory')->default(false);
            $table->integer('inventory_quantity')->default(0);
            $table->boolean('allow_backorder')->default(false);
            $table->integer('cost_price')->nullable();
            $table->integer('weight_grams')->nullable();
            $table->timestamp('received_at')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
            $table->index('product_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_variants');
    }
};
