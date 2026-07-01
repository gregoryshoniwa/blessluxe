<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_tag_map', function (Blueprint $table) {
            $table->string('product_id');
            $table->string('tag_id');
            $table->primary(['product_id', 'tag_id']);
            $table->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
            $table->foreign('tag_id')->references('id')->on('product_tags')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_tag_map');
    }
};
