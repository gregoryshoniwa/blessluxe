<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_model_assets', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('model_id');
            $table->string('source_kind', 32)->default('upload');
            $table->string('media_type', 16)->default('image');
            $table->text('media_url');
            $table->text('thumbnail_url')->nullable();
            $table->string('caption')->nullable();
            $table->text('prompt')->nullable();
            $table->json('generation_meta')->nullable();
            $table->string('status', 32)->default('ready');
            $table->text('status_message')->nullable();
            $table->string('operation_name')->nullable();
            $table->integer('position')->default(0);
            $table->timestamps();
            $table->foreign('model_id')->references('id')->on('ai_models')->cascadeOnDelete();
            $table->index(['model_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_model_assets');
    }
};
