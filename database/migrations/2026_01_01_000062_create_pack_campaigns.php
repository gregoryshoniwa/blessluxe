<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pack_campaigns', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('pack_definition_id');
            // 'admin' = launched by staff; 'affiliate' = launched by a referral
            // partner; 'customer' = customer-hosted group buy.
            $table->string('host_kind', 16)->default('admin');
            $table->string('affiliate_id')->nullable();
            $table->string('customer_id')->nullable();
            $table->string('public_code')->unique(); // short share-code in /shop/packs/{code}
            $table->string('title')->nullable();
            $table->string('status', 32)->default('open'); // open | filled | closed | cancelled
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
            $table->timestamp('deleted_at')->nullable();
            $table->foreign('pack_definition_id')->references('id')->on('pack_definitions')->cascadeOnDelete();
            $table->foreign('affiliate_id')->references('id')->on('affiliates')->nullOnDelete();
            $table->foreign('customer_id')->references('id')->on('customers')->nullOnDelete();
            $table->index('public_code');
            $table->index(['status', 'deleted_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pack_campaigns');
    }
};
