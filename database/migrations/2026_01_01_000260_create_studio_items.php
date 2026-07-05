<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Show Room "Studio" — branded-wear compositions: a logo applied to a
        // garment (the customer's digitised product or a preset), rendered as
        // a mockup / worn photography / angle sheet / advert, optionally
        // animated. Items are bundled into PDF proposals.
        Schema::create('studio_items', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('customer_id')->index();
            $table->string('logo_id')->nullable()->index();
            $table->string('customer_product_id')->nullable()->index();
            // mockup | worn | angles | advert
            $table->string('kind', 20)->default('mockup');
            // Garment preset when no customer product is chosen ("men's polo").
            $table->string('garment', 120)->nullable();
            // men | women | family (worn photography / adverts).
            $table->string('audience', 20)->nullable();
            $table->string('placement', 60)->nullable();
            // embroidered | printed
            $table->string('application', 20)->nullable();
            $table->text('prompt')->nullable();
            // AI-written advert script (advert kind).
            $table->text('script')->nullable();
            $table->string('image_url', 1024)->nullable();
            $table->string('video_url', 1024)->nullable();
            $table->string('status', 20)->default('ready');
            $table->json('meta')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('studio_items');
    }
};
