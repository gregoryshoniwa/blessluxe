<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('catalogues', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('heading_id');
            $table->string('name');
            $table->string('handle')->unique();
            $table->text('description')->nullable();
            $table->text('thumbnail')->nullable();
            $table->integer('rank')->default(0);
            $table->boolean('is_active')->default(true);
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->foreign('heading_id')->references('id')->on('headings')->cascadeOnDelete();
            $table->index(['heading_id', 'rank']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('catalogues');
    }
};
