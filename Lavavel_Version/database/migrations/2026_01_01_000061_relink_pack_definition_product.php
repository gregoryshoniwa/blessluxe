<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Create pack_definition_product (the junction table for 'merge' packs).
     * Originally skipped in Milestone 2 because pack_definitions didn't
     * exist yet; now that it does, set this up properly with the FKs.
     */
    public function up(): void
    {
        Schema::create('pack_definition_product', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('pack_definition_id');
            $table->string('product_id');
            $table->integer('position')->default(0);
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('pack_definition_id')->references('id')->on('pack_definitions')->cascadeOnDelete();
            $table->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
            $table->index(['pack_definition_id', 'position'], 'idx_pdp_lookup');
            $table->unique(['pack_definition_id', 'product_id'], 'uniq_pdp');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pack_definition_product');
    }
};
