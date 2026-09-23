<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What shoppers say about a product: a rating, a heart, a few words.
 *
 * `product_engagement_rewards` is the PROMISE that Bees were paid, kept apart
 * from the rating/like/comment itself. Unliking deletes the like; the promise
 * stays, so liking again earns nothing. Same idea as `hive_tryon_rewards`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_ratings', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('product_id');
            $table->string('customer_id');
            $table->unsignedTinyInteger('stars');            // 1–5
            $table->timestamps();
            $table->unique(['product_id', 'customer_id']);   // one voice each, changeable
            $table->index(['product_id', 'created_at']);
            $table->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
        });

        Schema::create('product_likes', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('product_id');
            $table->string('customer_id');
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['product_id', 'customer_id']);
            $table->index(['product_id', 'created_at']);
            $table->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
        });

        Schema::create('product_comments', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('product_id');
            $table->string('customer_id');
            $table->text('body');
            $table->timestamp('hidden_at')->nullable();      // staff took it down; the row stays
            $table->timestamps();
            $table->index(['product_id', 'created_at']);
            $table->index(['customer_id', 'created_at']);
            $table->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
        });

        Schema::create('product_engagement_rewards', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('customer_id');
            $table->string('product_id');
            $table->string('action', 12);                    // rate | like | comment
            $table->unsignedInteger('bees');
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['customer_id', 'product_id', 'action']);
            $table->index(['customer_id', 'created_at']);    // the daily cap reads this
            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
        });

        // Denormalised so a grid never aggregates, and trending can sort cheaply.
        Schema::table('products', function (Blueprint $table) {
            $table->unsignedInteger('rating_count')->default(0);
            $table->unsignedInteger('rating_sum')->default(0);
            $table->unsignedInteger('likes_count')->default(0);
            $table->unsignedInteger('comments_count')->default(0);
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn(['rating_count', 'rating_sum', 'likes_count', 'comments_count']);
        });
        Schema::dropIfExists('product_engagement_rewards');
        Schema::dropIfExists('product_comments');
        Schema::dropIfExists('product_likes');
        Schema::dropIfExists('product_ratings');
    }
};
