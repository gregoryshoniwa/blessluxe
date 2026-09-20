<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Bless Hive — short video on a look.
 *
 * A video look keeps its POSTER in `images[0]`, so every grid, card, share
 * preview and moderation screen that already shows a look keeps working; the
 * clip itself is only fetched when someone taps play. `video_bytes` is stored
 * so the card can say what that tap will cost ("Video · 2.4 MB") — where data
 * is ~$4/GB that label is the feature.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hive_looks', function (Blueprint $table) {
            $table->string('video_url', 1024)->nullable()->after('images');
            $table->unsignedInteger('video_bytes')->nullable()->after('video_url');
            $table->unsignedSmallInteger('video_seconds')->nullable()->after('video_bytes');
        });
    }

    public function down(): void
    {
        Schema::table('hive_looks', fn (Blueprint $table) => $table->dropColumn(['video_url', 'video_bytes', 'video_seconds']));
    }
};
