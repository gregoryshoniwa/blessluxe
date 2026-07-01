<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_reviews', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('product_id');
            $table->string('customer_id')->nullable();
            $table->string('customer_email')->nullable();
            $table->string('customer_name')->nullable();
            $table->string('order_id')->nullable();
            $table->string('title');
            $table->text('content');
            $table->tinyInteger('rating');
            $table->boolean('is_verified_purchase')->default(false);
            $table->string('status', 32)->default('pending');
            $table->text('admin_response')->nullable();
            $table->integer('helpful_count')->default(0);
            $table->json('images')->nullable();
            $table->json('metadata')->nullable();
            $table->boolean('reward_credited')->default(false);
            $table->timestamp('reward_credited_at')->nullable();
            $table->timestamps();
            $table->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
            $table->foreign('customer_id')->references('id')->on('customers')->nullOnDelete();
            $table->index('product_id');
            $table->index('customer_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_reviews');
    }
};
