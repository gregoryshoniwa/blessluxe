<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('returns', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('order_id');
            $table->string('customer_id')->nullable();
            $table->string('status', 32)->default('requested'); // requested|approved|rejected|refunded
            $table->text('reason')->nullable();
            $table->text('admin_notes')->nullable();
            $table->integer('refund_amount')->default(0);
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
            $table->foreign('order_id')->references('id')->on('orders')->cascadeOnDelete();
            $table->foreign('customer_id')->references('id')->on('customers')->nullOnDelete();
            $table->index('order_id');
            $table->index('customer_id');
            $table->index('status');
        });

        Schema::create('return_items', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('return_id');
            $table->string('order_line_item_id');
            $table->integer('quantity')->default(1);
            $table->string('reason', 80)->nullable();
            $table->timestamps();
            $table->foreign('return_id')->references('id')->on('returns')->cascadeOnDelete();
            $table->foreign('order_line_item_id')->references('id')->on('order_line_items')->cascadeOnDelete();
            $table->index('return_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('return_items');
        Schema::dropIfExists('returns');
    }
};
