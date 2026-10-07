<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Who we buy a piece from, and where it ships from. Series come from the same
 * Telegram/WhatsApp sellers again and again, so a supplier is kept once and
 * picked next time instead of being retyped into every product.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('suppliers', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('name');
            $table->string('phone', 40)->nullable();
            $table->string('link', 300)->nullable();       // their channel or group
            $table->string('country', 2)->nullable();      // TR, CN, … — where they ship from
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->index('name');
        });

        Schema::table('products', function (Blueprint $table) {
            $table->string('supplier_id')->nullable()->after('default_courier_id');
            $table->string('origin_country', 2)->nullable()->after('supplier_id');
            $table->index('supplier_id');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropIndex(['supplier_id']);
            $table->dropColumn(['supplier_id', 'origin_country']);
        });
        Schema::dropIfExists('suppliers');
    }
};
