<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customers', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('email')->unique();
            $table->string('password')->nullable();
            $table->string('first_name')->nullable();
            $table->string('last_name')->nullable();
            $table->string('phone')->nullable();
            $table->date('date_of_birth')->nullable();
            $table->string('gender')->nullable();
            $table->boolean('marketing_consent')->default(false);
            $table->integer('loyalty_points')->default(0);
            $table->string('loyalty_tier', 32)->default('bronze');
            $table->string('referral_code')->nullable()->unique();
            $table->string('referred_by')->nullable();
            $table->json('style_preferences')->nullable();
            $table->json('size_profile')->nullable();
            $table->json('metadata')->nullable();
            $table->string('oauth_provider')->nullable();
            $table->string('oauth_subject')->nullable();
            $table->text('avatar_url')->nullable();
            $table->timestamp('email_verified_at')->nullable();
            $table->timestamp('last_login_at')->nullable();
            $table->timestamps();
            $table->index('email');
            $table->index('referral_code');
            $table->index(['oauth_provider', 'oauth_subject']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customers');
    }
};
