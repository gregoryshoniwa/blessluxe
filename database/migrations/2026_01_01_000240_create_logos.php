<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('logos', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('customer_id')->index();
            $table->string('name', 120)->nullable();
            // The creation brief ("lion crest for a barbershop", ...).
            $table->text('prompt')->nullable();
            // Optional uploaded references (sketches, existing marks) — kept
            // so My Products / Studio can reuse them later, mirroring avatars.
            $table->json('source_images')->nullable();
            // Current render.
            $table->string('image_url', 1024)->nullable();
            // Editable attributes (colors, style, text, ...) merged on edit.
            $table->json('settings')->nullable();
            $table->string('status', 20)->default('ready');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('logos');
    }
};
