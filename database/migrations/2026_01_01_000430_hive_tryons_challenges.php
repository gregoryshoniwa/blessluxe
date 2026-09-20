<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Bless Hive — try-ons and challenges.
 *
 * A TRY-ON is a look about something the person actually bought: "ordered vs
 * got", the size they took and how it ran. It is the most useful thing a
 * shopper can read before buying, so it earns Bees — once per purchased line,
 * ever. That promise lives in `hive_tryon_rewards`, NOT on the look: a look can
 * be deleted and re-posted, a payout row can't.
 *
 * A CHALLENGE is a themed call for looks (#SundayBest) with a Bees prize that
 * staff award. There is no scheduler in production, so "live" is never a stored
 * state — it is always worked out from the dates.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hive_challenges', function (Blueprint $table) {
            $table->string('id')->primary();                 // chal_<ULID>
            $table->string('slug', 40)->unique();            // sunday-best → #SundayBest, /hive/challenge/sunday-best
            $table->string('title', 80);
            $table->string('description', 400)->nullable();
            $table->string('cover_url', 1024)->nullable();
            $table->unsignedInteger('prize_bees')->default(0);   // per winner
            $table->unsignedTinyInteger('winners')->default(3);
            $table->timestamp('starts_at');
            $table->timestamp('ends_at');
            $table->boolean('is_published')->default(false);
            $table->timestamp('awarded_at')->nullable();     // set once winners are paid; final
            $table->unsignedInteger('entries_count')->default(0);
            $table->timestamps();

            $table->index(['is_published', 'starts_at', 'ends_at']);
        });

        Schema::table('hive_looks', function (Blueprint $table) {
            $table->string('challenge_id')->nullable()->after('occasion');
            $table->timestamp('won_at')->nullable()->after('challenge_id');
            // ── Try-on ──
            $table->string('product_id')->nullable()->after('won_at');
            $table->string('line_item_id')->nullable()->after('product_id');
            $table->string('fit', 8)->nullable()->after('line_item_id');          // small | true | large
            $table->string('size_worn', 24)->nullable()->after('fit');
            $table->unsignedTinyInteger('rating')->nullable()->after('size_worn'); // 1–5

            $table->index(['challenge_id', 'status', 'created_at'], 'hive_looks_challenge_idx');
            $table->index(['product_id', 'status', 'created_at'], 'hive_looks_product_idx');
        });

        Schema::create('hive_tryon_rewards', function (Blueprint $table) {
            $table->string('line_item_id')->primary();       // one payout per purchased line, for ever
            $table->string('customer_id');
            $table->string('product_id');
            $table->unsignedInteger('bees');
            $table->timestamp('created_at')->nullable();

            $table->index(['customer_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hive_tryon_rewards');
        Schema::table('hive_looks', function (Blueprint $table) {
            $table->dropIndex('hive_looks_challenge_idx');
            $table->dropIndex('hive_looks_product_idx');
            $table->dropColumn(['challenge_id', 'won_at', 'product_id', 'line_item_id', 'fit', 'size_worn', 'rating']);
        });
        Schema::dropIfExists('hive_challenges');
    }
};
