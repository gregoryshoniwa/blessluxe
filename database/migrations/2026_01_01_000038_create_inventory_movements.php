<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_movements', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('variant_id');
            $table->integer('delta');
            $table->string('reason');
            $table->string('reference')->nullable();
            $table->text('notes')->nullable();
            $table->integer('cost_per_unit')->nullable();
            $table->string('created_by')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('variant_id')->references('id')->on('product_variants')->cascadeOnDelete();
            $table->index('variant_id');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_movements');
    }
};
