<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Affiliate storefronts: a curated product line at the affiliate's own prices.
 *
 * Two modes. 'all' (the default, and what every existing affiliate keeps) simply
 * mirrors the main shop. 'curated' shows only what the affiliate selected, priced
 * with their markup on top.
 *
 * The money rule, decided up front: COMMISSION IS ALWAYS ON THE BASE PRICE, and
 * the markup is the affiliate's in full. BLESSLUXE therefore receives exactly the
 * list price on every sale no matter what an affiliate charges, which is what
 * makes uncapped markup safe for the business.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('affiliates', function (Blueprint $table) {
            $table->string('storefront_mode', 16)->default('all')->after('status');
            $table->string('storefront_title')->nullable()->after('storefront_mode');
            $table->text('storefront_intro')->nullable()->after('storefront_title');
            // Applied to anything the affiliate hasn't priced individually.
            $table->string('default_markup_type', 8)->nullable()->after('storefront_intro');
            $table->integer('default_markup_value')->nullable()->after('default_markup_type');
        });

        // What an affiliate has chosen to sell, and at what uplift.
        Schema::create('affiliate_products', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('affiliate_id');
            $table->string('product_id');
            // 'percent' => value is whole percent (15 = +15%)
            // 'amount'  => value is cents added per unit
            $table->string('markup_type', 8)->nullable();
            $table->integer('markup_value')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();

            $table->foreign('affiliate_id')->references('id')->on('affiliates')->cascadeOnDelete();
            $table->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
            // One row per product per affiliate — two markups for one item would
            // make the displayed price non-deterministic.
            $table->unique(['affiliate_id', 'product_id']);
            $table->index(['affiliate_id', 'is_active']);
        });

        // Markup for a whole catalogue, so an affiliate can price "Women" in one go
        // without touching every product.
        Schema::create('affiliate_category_markups', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('affiliate_id');
            $table->string('catalogue_id');
            $table->string('markup_type', 8);
            $table->integer('markup_value');
            $table->timestamps();

            $table->foreign('affiliate_id')->references('id')->on('affiliates')->cascadeOnDelete();
            $table->foreign('catalogue_id')->references('id')->on('catalogues')->cascadeOnDelete();
            $table->unique(['affiliate_id', 'catalogue_id']);
        });

        // "Could you stock this?" — with photos.
        Schema::create('affiliate_product_requests', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('affiliate_id');
            $table->string('title');
            $table->text('note')->nullable();
            $table->json('images')->nullable();
            $table->string('status', 16)->default('pending'); // pending|accepted|declined
            $table->text('admin_note')->nullable();
            // Set when admin turns the request into a real product.
            $table->string('product_id')->nullable();
            $table->timestamps();

            $table->foreign('affiliate_id')->references('id')->on('affiliates')->cascadeOnDelete();
            $table->foreign('product_id')->references('id')->on('products')->nullOnDelete();
            $table->index(['affiliate_id', 'status']);
            $table->index('status');
        });

        // Affiliate <-> admin conversation. One thread per affiliate; product
        // requests post into it so nothing lives in a separate silo.
        Schema::create('affiliate_messages', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('affiliate_id');
            $table->string('sender', 16);               // 'affiliate' | 'admin'
            $table->string('author_id')->nullable();    // user:N or cust_... — prefixed, shared column
            $table->text('body');
            $table->json('attachments')->nullable();
            $table->string('request_id')->nullable();   // links a message to a product request
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->foreign('affiliate_id')->references('id')->on('affiliates')->cascadeOnDelete();
            $table->index(['affiliate_id', 'created_at']);
            $table->index(['affiliate_id', 'sender', 'read_at']);
        });

        // Markup has to be recorded per sale, or a payout can't tell the
        // affiliate's uplift from BLESSLUXE's revenue after the fact.
        Schema::table('affiliate_sales', function (Blueprint $table) {
            $table->integer('base_total')->nullable()->after('order_total');
            $table->integer('markup_total')->default(0)->after('base_total');
        });
    }

    public function down(): void
    {
        Schema::table('affiliate_sales', fn (Blueprint $t) => $t->dropColumn(['base_total', 'markup_total']));
        Schema::dropIfExists('affiliate_messages');
        Schema::dropIfExists('affiliate_product_requests');
        Schema::dropIfExists('affiliate_category_markups');
        Schema::dropIfExists('affiliate_products');
        Schema::table('affiliates', fn (Blueprint $t) => $t->dropColumn([
            'storefront_mode', 'storefront_title', 'storefront_intro',
            'default_markup_type', 'default_markup_value',
        ]));
    }
};
