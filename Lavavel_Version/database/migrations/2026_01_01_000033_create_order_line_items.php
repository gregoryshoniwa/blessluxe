<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_line_items', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('order_id');
            $table->string('variant_id');
            $table->string('product_id');
            $table->string('title');
            $table->string('variant_title')->nullable();
            $table->string('sku')->nullable();
            $table->text('thumbnail')->nullable();
            $table->integer('quantity')->default(1);
            $table->integer('unit_price');
            $table->integer('unit_cost')->nullable();
            $table->json('metadata')->nullable();
            $table->foreign('order_id')->references('id')->on('orders')->cascadeOnDelete();
            $table->index('order_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_line_items');
    }
};
