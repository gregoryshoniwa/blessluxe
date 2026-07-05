<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Show Room "My Products" — a customer's OWN physical items (caps,
        // t-shirts, totes...), photographed and digitised. Distinct from the
        // shop's `products` catalogue.
        Schema::create('customer_products', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('customer_id')->index();
            $table->string('name', 120)->nullable();
            $table->string('category', 60)->nullable();
            $table->text('prompt')->nullable();
            // Uploaded photos of the real item — kept so Studio can reference
            // the true product alongside the digital render.
            $table->json('source_images')->nullable();
            // Clean digital render.
            $table->string('image_url', 1024)->nullable();
            // Editable attributes (color, material, angle, ...) merged on edit.
            $table->json('settings')->nullable();
            $table->string('status', 20)->default('ready');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_products');
    }
};
