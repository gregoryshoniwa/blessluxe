<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_catalogue_map', function (Blueprint $table) {
            $table->string('product_id');
            $table->string('catalogue_id');
            $table->primary(['product_id', 'catalogue_id']);
            $table->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
            $table->foreign('catalogue_id')->references('id')->on('catalogues')->cascadeOnDelete();
            $table->index('catalogue_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_catalogue_map');
    }
};
