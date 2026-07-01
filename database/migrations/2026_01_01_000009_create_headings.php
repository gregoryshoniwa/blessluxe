<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('headings', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('name');
            $table->string('handle')->unique();
            $table->text('description')->nullable();
            $table->integer('rank')->default(0);
            $table->boolean('is_active')->default(true);
            $table->boolean('is_sale')->default(false);
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->index('rank');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('headings');
    }
};
