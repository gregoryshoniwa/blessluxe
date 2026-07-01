<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('marketing_campaign_products', function (Blueprint $table) {
            $table->string('campaign_id');
            $table->string('product_id');
            $table->primary(['campaign_id', 'product_id']);
            $table->foreign('campaign_id')->references('id')->on('marketing_campaigns')->cascadeOnDelete();
            $table->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketing_campaign_products');
    }
};
