<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('package_items', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('package_id');
            $table->string('order_line_id')->nullable();
            $table->string('variant_id')->nullable();
            $table->string('product_id')->nullable();
            $table->string('product_title');
            $table->string('variant_title')->nullable();
            $table->string('sku')->nullable();
            $table->integer('quantity')->default(1);
            $table->integer('unit_price')->nullable();
            $table->string('pack_slot_id')->nullable();
            $table->string('sub_code')->nullable()->unique();
            $table->timestamp('claimed_at')->nullable();
            $table->string('claimed_by')->nullable();
            $table->string('status', 32)->default('pending');
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->foreign('package_id')->references('id')->on('packages')->cascadeOnDelete();
            $table->index('package_id');
            $table->index('pack_slot_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('package_items');
    }
};
