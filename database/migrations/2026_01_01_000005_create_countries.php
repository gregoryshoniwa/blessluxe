<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('countries', function (Blueprint $table) {
            $table->string('code', 4)->primary();
            $table->string('name');
            $table->boolean('is_allowed')->default(false);
            $table->integer('sort_order')->default(0);
            $table->timestamp('updated_at')->useCurrent();
            $table->index('is_allowed');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('countries');
    }
};
