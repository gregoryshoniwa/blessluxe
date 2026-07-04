<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('headings', function (Blueprint $table) {
            // Cover image for the storefront "Shop By Category" card.
            $table->string('image_url', 1024)->nullable()->after('description');
        });
    }

    public function down(): void
    {
        Schema::table('headings', function (Blueprint $table) {
            $table->dropColumn('image_url');
        });
    }
};
