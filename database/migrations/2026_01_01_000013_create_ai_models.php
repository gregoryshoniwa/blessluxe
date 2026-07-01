<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_models', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('gender')->nullable();
            $table->string('age_range')->nullable();
            $table->string('ethnicity')->nullable();
            $table->text('prompt_template')->nullable();
            $table->string('primary_asset_id')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->index(['is_active', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_models');
    }
};
