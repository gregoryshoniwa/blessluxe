<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Bless Hive — a look can be a LINK to a post on YouTube, TikTok, Instagram or
 * Facebook instead of an upload.
 *
 * Only the provider and a reference we parsed ourselves are stored — never an
 * embed URL or HTML from the member. The iframe address is built by us at
 * render time (HiveEmbeds::embedUrl), so nothing a member types can choose
 * what gets framed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hive_looks', function (Blueprint $table) {
            $table->string('embed_provider', 16)->nullable()->after('video_seconds');   // youtube | tiktok | instagram | facebook
            $table->string('embed_ref', 512)->nullable()->after('embed_provider');
        });
    }

    public function down(): void
    {
        Schema::table('hive_looks', fn (Blueprint $table) => $table->dropColumn(['embed_provider', 'embed_ref']));
    }
};
