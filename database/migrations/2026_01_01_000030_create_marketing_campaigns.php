<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('marketing_campaigns', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('name');
            $table->string('handle')->unique();
            $table->text('description')->nullable();
            $table->text('banner_url')->nullable();
            $table->text('banner_text')->nullable();
            $table->string('banner_cta_label')->nullable();
            $table->string('banner_cta_href')->nullable();
            $table->decimal('discount_percent', 5, 2)->nullable();
            $table->timestamp('starts_at');
            $table->timestamp('ends_at');
            $table->boolean('is_active')->default(true);
            $table->boolean('show_countdown')->default(true);
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->index(['is_active', 'starts_at', 'ends_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketing_campaigns');
    }
};
