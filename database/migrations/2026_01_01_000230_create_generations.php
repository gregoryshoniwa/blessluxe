<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('generations', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('customer_id')->index();
            $table->string('avatar_id')->nullable()->index();
            // image | video — video generations also keep the composed image
            // as their poster frame.
            $table->string('kind', 10)->default('image');
            $table->json('product_ids')->nullable();
            $table->string('environment', 160)->nullable();
            $table->text('prompt')->nullable();
            // Composite Nano Banana render (always present once composed).
            $table->string('image_url', 1024)->nullable();
            // Omni Flash output (video generations only).
            $table->string('video_url', 1024)->nullable();
            // pending → composing/animating; ready; failed.
            $table->string('status', 20)->default('pending');
            // Snapshots + provider bookkeeping (product titles, Omni
            // interaction id, failure reason...).
            $table->json('meta')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('generations');
    }
};
