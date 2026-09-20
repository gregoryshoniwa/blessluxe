<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * An affiliate's shop can look like THEIRS: own hero slides, own top-bar
 * messages, own accent colour — or any of them left on the BLESSLUXE default.
 *
 * Each of the three is an independent switch ("default" | "custom"), because
 * wanting your own colour says nothing about wanting to produce hero artwork.
 * Switching back to default never deletes anything — the slides and messages
 * stay saved, they just stop being shown.
 *
 * Slides get their own table rather than sharing `announcements`: those rows
 * are the brand's, edited by staff under different rules (20 MB videos, any
 * link). Mixing the two would mean every staff query needing a "not an
 * affiliate's" filter, and the first one to forget it shows an affiliate's
 * slide on the main site.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('affiliates', function (Blueprint $table) {
            $table->string('hero_mode', 16)->default('default');      // default | custom
            $table->string('top_bar_mode', 16)->default('default');   // default | custom
            $table->json('top_bar_messages')->nullable();
            // Normalised "#RRGGBB". NULL = the BLESSLUXE gold.
            $table->string('theme_color', 7)->nullable();
        });

        Schema::create('affiliate_hero_slides', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('affiliate_id');
            $table->string('media_type', 16);            // image | youtube
            $table->string('media_url', 1024);           // public path, or the 11-char YouTube id
            $table->string('source', 16);                // upload | ai | youtube
            $table->text('prompt')->nullable();          // what the AI was asked, for re-use
            $table->string('heading', 80)->nullable();
            $table->string('subheading', 160)->nullable();
            $table->string('cta_label', 40)->nullable();
            $table->string('cta_href', 255)->nullable(); // internal paths only
            // Where the subject sits, so a wide image crops sensibly on a phone.
            $table->string('focus', 16)->default('center');   // left | center | right
            $table->unsignedSmallInteger('position')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->foreign('affiliate_id')->references('id')->on('affiliates')->cascadeOnDelete();
            $table->index(['affiliate_id', 'is_active', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('affiliate_hero_slides');
        Schema::table('affiliates', fn (Blueprint $t) => $t->dropColumn(['hero_mode', 'top_bar_mode', 'top_bar_messages', 'theme_color']));
    }
};
