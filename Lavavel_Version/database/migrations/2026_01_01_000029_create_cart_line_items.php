<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cart_line_items', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('cart_id');
            $table->string('variant_id');
            $table->integer('quantity')->default(1);
            $table->integer('unit_price');
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->foreign('cart_id')->references('id')->on('carts')->cascadeOnDelete();
            $table->foreign('variant_id')->references('id')->on('product_variants');
            $table->index('cart_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cart_line_items');
    }
};
