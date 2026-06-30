<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('variant_option_values', function (Blueprint $table) {
            $table->string('variant_id');
            $table->string('option_value_id');
            $table->primary(['variant_id', 'option_value_id']);
            $table->foreign('variant_id')->references('id')->on('product_variants')->cascadeOnDelete();
            $table->foreign('option_value_id')->references('id')->on('product_option_values')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('variant_option_values');
    }
};
