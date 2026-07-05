<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('avatars', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('customer_id')->index();
            $table->string('name', 120)->nullable();
            // The creation prompt ("alien version of me", "90s cartoon", ...).
            $table->text('prompt')->nullable();
            // Uploaded selfie paths (public disk). Kept after render so future
            // features (Generations: avatar + products + environment → image/
            // video) can reuse the customer's likeness as reference images.
            $table->json('source_images')->nullable();
            // Current render.
            $table->string('image_url', 1024)->nullable();
            // Editable attributes (eye_color, hair_color, body_type, style, ...)
            // merged on every edit so the current look is always re-creatable.
            $table->json('settings')->nullable();
            $table->string('status', 20)->default('ready');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('avatars');
    }
};
