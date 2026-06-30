<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pack_definitions', function (Blueprint $table) {
            $table->string('id')->primary();
            // For legacy single-product packs; null for 'merge' packs that
            // pull variants from multiple products via the existing
            // pack_definition_product table.
            $table->string('product_id')->nullable();
            $table->string('pack_kind', 16)->default('single'); // 'single' | 'merge'
            $table->string('title');
            $table->string('handle')->nullable();
            $table->text('description')->nullable();
            $table->string('status', 32)->default('draft'); // draft | published | archived
            $table->timestamps();
            $table->timestamp('deleted_at')->nullable();
            $table->foreign('product_id')->references('id')->on('products')->nullOnDelete();
            $table->index(['status', 'deleted_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pack_definitions');
    }
};
