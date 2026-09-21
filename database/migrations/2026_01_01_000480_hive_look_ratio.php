<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The shape of a look's first photo (width ÷ height), measured once at post
 * time. The feed sizes each post's frame to it BEFORE the image arrives, so a
 * full-length photo is shown whole instead of being cut to a fixed box — and
 * the page doesn't jump while you scroll. Older looks without it are measured
 * in the browser (and can be backfilled with `php artisan hive:measure-looks`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hive_looks', fn (Blueprint $table) => $table->decimal('ratio', 6, 3)->nullable()->after('images'));
    }

    public function down(): void
    {
        Schema::table('hive_looks', fn (Blueprint $table) => $table->dropColumn('ratio'));
    }
};
