<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Bless Hive — the community. Phase 1: pages, fit, looks, follows.
 *
 * Every customer has a page; there is no separate "creator" account. A row in
 * `hive_profiles` is created the first time it is needed, so signing up for the
 * shop is signing up for the Hive. (Being an affiliate is an upgrade that lets
 * a page earn — it is not a different kind of account.)
 *
 * Body measurements are the most sensitive thing this app stores. They live on
 * the profile but are PRIVATE by default (`fit_visibility`), and are never sent
 * to another person as numbers unless the owner chose `public` — a "fit twin"
 * sees a match percentage and the sizes someone wears, not their waist.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hive_profiles', function (Blueprint $table) {
            $table->string('customer_id')->primary();
            $table->string('handle', 30)->unique();          // blessluxe.com/@handle — lowercase
            $table->string('display_name', 60);
            $table->string('bio', 200)->nullable();
            $table->string('avatar_url', 1024)->nullable();
            $table->string('city', 60)->nullable();
            // The community is 18+ (Zimbabwean law treats under-18s as children
            // needing guardian consent). Posting and following need this set.
            $table->timestamp('adult_confirmed_at')->nullable();

            // ── Fit ──
            $table->unsignedSmallInteger('height_cm')->nullable();
            $table->unsignedSmallInteger('bust_cm')->nullable();
            $table->unsignedSmallInteger('waist_cm')->nullable();
            $table->unsignedSmallInteger('hips_cm')->nullable();
            $table->string('body_shape', 16)->nullable();    // pear | hourglass | apple | rectangle | inverted
            $table->string('size_top', 12)->nullable();
            $table->string('size_bottom', 12)->nullable();
            $table->string('size_dress', 12)->nullable();
            $table->string('size_shoe', 12)->nullable();
            // private: nobody · twins: used for matching, numbers never shown
            // public: shown on the page. Default is the most private.
            $table->string('fit_visibility', 12)->default('private');

            // Denormalised so a page never has to COUNT its followers.
            $table->unsignedInteger('followers_count')->default(0);
            $table->unsignedInteger('following_count')->default(0);
            $table->unsignedInteger('looks_count')->default(0);

            $table->timestamp('suspended_at')->nullable();
            $table->timestamps();

            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
            // Fit-twin search narrows on these before scoring.
            $table->index(['fit_visibility', 'bust_cm', 'waist_cm', 'hips_cm'], 'hive_fit_idx');
        });

        Schema::create('hive_follows', function (Blueprint $table) {
            $table->string('follower_id');
            $table->string('followed_id');
            $table->timestamp('created_at')->nullable();

            $table->primary(['follower_id', 'followed_id']);
            $table->index(['followed_id', 'created_at']);
            $table->foreign('follower_id')->references('id')->on('customers')->cascadeOnDelete();
            $table->foreign('followed_id')->references('id')->on('customers')->cascadeOnDelete();
        });

        Schema::create('hive_looks', function (Blueprint $table) {
            $table->string('id')->primary();                 // look_<ULID>: sortable, so (created_at, id) pages cleanly
            $table->string('customer_id');
            $table->string('caption', 500)->nullable();
            $table->json('images');                          // Media URLs, 1–4
            // Tagged products/packs — the same server-written snapshots as chat
            // (MessageRefs). A look with nothing to buy is just Instagram.
            $table->json('refs')->nullable();
            $table->string('occasion', 24)->nullable();      // wedding | church | work | …
            // published | hidden (by staff or by reports) | removed (by owner)
            $table->string('status', 12)->default('published');
            $table->unsignedInteger('likes_count')->default(0);
            $table->unsignedSmallInteger('reports_count')->default(0);
            $table->timestamps();

            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
            $table->index(['status', 'created_at', 'id'], 'hive_looks_feed_idx');
            $table->index(['customer_id', 'status', 'created_at'], 'hive_looks_page_idx');
        });

        Schema::create('hive_likes', function (Blueprint $table) {
            $table->string('look_id');
            $table->string('customer_id');
            $table->timestamp('created_at')->nullable();

            $table->primary(['look_id', 'customer_id']);
            $table->index('customer_id');
            $table->foreign('look_id')->references('id')->on('hive_looks')->cascadeOnDelete();
            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
        });

        Schema::create('hive_reports', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('reporter_id');
            $table->string('subject_type', 16);              // look | page
            $table->string('subject_id');
            $table->string('reason', 24);                    // nudity | minor | harassment | scam | spam | other
            $table->string('note', 300)->nullable();
            $table->string('status', 12)->default('open');   // open | upheld | dismissed
            $table->string('resolved_by')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            // One report per person per thing — repeat taps must not be able to
            // hide someone's post on their own.
            $table->unique(['reporter_id', 'subject_type', 'subject_id']);
            $table->index(['status', 'created_at']);
            $table->foreign('reporter_id')->references('id')->on('customers')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hive_reports');
        Schema::dropIfExists('hive_likes');
        Schema::dropIfExists('hive_looks');
        Schema::dropIfExists('hive_follows');
        Schema::dropIfExists('hive_profiles');
    }
};
