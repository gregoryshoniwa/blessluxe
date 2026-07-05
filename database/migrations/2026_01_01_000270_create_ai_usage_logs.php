<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Every Google AI call (image / video / text) with an estimated cost —
        // the ledger behind /admin/ai-usage, and the future basis for
        // charging customers for Show Room tools.
        Schema::create('ai_usage_logs', function (Blueprint $table) {
            $table->id();
            $table->string('customer_id')->nullable()->index();
            // Which feature spent it: avatars, logos, my-products, studio,
            // generations, admin-ai, luxe-agent, other.
            $table->string('surface', 60)->index();
            $table->string('kind', 10);           // image | video | text
            $table->string('model', 120)->nullable();
            $table->decimal('units', 8, 2)->default(1); // images, est. video seconds, calls
            $table->decimal('cost', 10, 4)->default(0); // estimated USD
            $table->json('meta')->nullable();
            $table->timestamp('created_at')->useCurrent()->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_usage_logs');
    }
};
