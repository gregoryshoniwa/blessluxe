<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Bless Hive — live sessions, by link.
 *
 * There is no streaming service here (that is a per-minute bill). A host goes
 * live on YouTube, TikTok, Facebook or Instagram as they already do, and
 * schedules it in the Hive with that link; it plays in the same tap-to-load
 * frame as any linked look. What the Hive adds is the room around it: a time,
 * reminders, a "live now" badge, and gifts.
 *
 * No scheduler runs in production, so nothing here is flipped by a clock. The
 * HOST starts and ends a session; everything else (upcoming, missed, timed out)
 * is worked out from the timestamps when it is read.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hive_lives', function (Blueprint $table) {
            $table->string('id')->primary();                 // live_<ULID>
            $table->string('customer_id');
            $table->string('title', 100);
            $table->string('description', 400)->nullable();
            $table->string('embed_provider', 16);
            $table->string('embed_ref', 512);
            $table->string('shape', 8)->nullable();
            $table->string('cover_url', 1024)->nullable();
            $table->timestamp('starts_at');
            $table->timestamp('went_live_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->string('status', 12)->default('scheduled');   // scheduled | cancelled | hidden
            $table->unsignedInteger('reminders_count')->default(0);
            $table->unsignedInteger('gifts_bees')->default(0);
            $table->unsignedSmallInteger('reports_count')->default(0);
            $table->timestamps();

            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
            $table->index(['status', 'starts_at']);
            $table->index(['customer_id', 'starts_at']);
        });

        Schema::create('hive_live_reminders', function (Blueprint $table) {
            $table->string('live_id');
            $table->string('customer_id');
            $table->timestamp('created_at')->nullable();

            $table->primary(['live_id', 'customer_id']);
            $table->foreign('live_id')->references('id')->on('hive_lives')->cascadeOnDelete();
            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
        });

        // Gifts reuse the long-standing `blits_gift_types` / `blits_gift_events`
        // tables (storage keeps the old word — see App\Services\Bees). These two
        // make "what was given on this look / in this live" a lookup, not a JSON scan.
        Schema::table('blits_gift_events', function (Blueprint $table) {
            $table->string('context_type', 8)->nullable()->after('gift_type_id');     // look | live
            $table->string('context_id')->nullable()->after('context_type');
            $table->index(['context_type', 'context_id', 'created_at'], 'gift_context_idx');
            $table->index(['from_customer_id', 'created_at'], 'gift_sender_day_idx');
        });
    }

    public function down(): void
    {
        Schema::table('blits_gift_events', function (Blueprint $table) {
            $table->dropIndex('gift_context_idx');
            $table->dropIndex('gift_sender_day_idx');
            $table->dropColumn(['context_type', 'context_id']);
        });
        Schema::dropIfExists('hive_live_reminders');
        Schema::dropIfExists('hive_lives');
    }
};
