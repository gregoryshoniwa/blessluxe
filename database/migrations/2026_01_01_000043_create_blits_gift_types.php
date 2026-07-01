<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('blits_gift_types', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('code')->unique();
            $table->string('label');
            $table->integer('blits_amount');
            $table->boolean('is_active')->default(true);
            $table->json('metadata')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('blits_gift_types');
    }
};
