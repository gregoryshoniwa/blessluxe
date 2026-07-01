<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_media', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('product_id');
            $table->string('media_type', 16)->default('image');
            $table->text('media_url');
            $table->text('thumbnail_url')->nullable();
            $table->string('alt_text')->nullable();
            $table->string('source_kind', 32)->default('upload');
            $table->string('source_model_id')->nullable();
            $table->text('prompt')->nullable();
            $table->json('generation_meta')->nullable();
            $table->string('status', 32)->default('ready');
            $table->text('status_message')->nullable();
            $table->string('operation_name')->nullable();
            $table->boolean('is_primary')->default(false);
            $table->integer('position')->default(0);
            $table->timestamps();
            $table->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
            $table->foreign('source_model_id')->references('id')->on('ai_models')->nullOnDelete();
            $table->index(['product_id', 'position']);
            $table->index(['product_id', 'is_primary']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_media');
    }
};
