<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_option_values', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('option_id');
            $table->string('value');
            $table->integer('rank')->default(0);
            $table->foreign('option_id')->references('id')->on('product_options')->cascadeOnDelete();
            $table->index('option_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_option_values');
    }
};
