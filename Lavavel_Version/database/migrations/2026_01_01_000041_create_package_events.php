<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('package_events', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('package_id');
            $table->string('status');
            $table->string('location')->nullable();
            $table->text('notes')->nullable();
            $table->string('created_by')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('package_id')->references('id')->on('packages')->cascadeOnDelete();
            $table->index('package_id');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('package_events');
    }
};
