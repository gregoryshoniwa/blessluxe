<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Bless Hive — talking: comments on looks, and Ask.
 *
 * Ask is the plan's second pillar: "what do I wear to this roora?" — a question
 * (optionally a *which one?* photo vote) that people answer with pieces from
 * the shop. A question is purchase intent; the person whose answer is accepted
 * earns Bees, which is the first way an ordinary member earns from the Hive.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hive_looks', function (Blueprint $table) {
            $table->unsignedInteger('comments_count')->default(0)->after('likes_count');
        });

        Schema::create('hive_comments', function (Blueprint $table) {
            $table->string('id')->primary();                 // cmt_<ULID>
            $table->string('look_id');
            $table->string('customer_id');
            $table->string('body', 500);
            $table->string('status', 12)->default('published');   // published | hidden
            $table->unsignedSmallInteger('reports_count')->default(0);
            $table->timestamps();

            $table->foreign('look_id')->references('id')->on('hive_looks')->cascadeOnDelete();
            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
            $table->index(['look_id', 'status', 'created_at', 'id'], 'hive_comments_thread_idx');
        });

        Schema::create('hive_asks', function (Blueprint $table) {
            $table->string('id')->primary();                 // ask_<ULID>
            $table->string('customer_id');
            $table->string('question', 200);
            $table->string('details', 600)->nullable();
            $table->string('occasion', 24)->nullable();
            // 0–4 photos. With two or more, they are the OPTIONS of a vote.
            $table->json('images')->nullable();
            $table->json('votes')->nullable();               // [n, n, …] per option — denormalised tally
            $table->string('status', 12)->default('published');
            $table->unsignedInteger('answers_count')->default(0);
            $table->string('accepted_answer_id')->nullable();
            $table->unsignedSmallInteger('reports_count')->default(0);
            $table->timestamps();

            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
            $table->index(['status', 'created_at', 'id'], 'hive_asks_feed_idx');
            $table->index(['customer_id', 'status', 'created_at']);
        });

        Schema::create('hive_ask_votes', function (Blueprint $table) {
            $table->string('ask_id');
            $table->string('customer_id');
            $table->unsignedTinyInteger('option');
            $table->timestamp('created_at')->nullable();

            $table->primary(['ask_id', 'customer_id']);      // one vote each
            $table->foreign('ask_id')->references('id')->on('hive_asks')->cascadeOnDelete();
            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
        });

        Schema::create('hive_answers', function (Blueprint $table) {
            $table->string('id')->primary();                 // ans_<ULID>
            $table->string('ask_id');
            $table->string('customer_id');
            $table->string('body', 500)->nullable();
            $table->json('refs')->nullable();                // server-written product snapshots (MessageRefs)
            $table->string('status', 12)->default('published');
            $table->unsignedSmallInteger('reports_count')->default(0);
            $table->timestamp('accepted_at')->nullable();
            $table->unsignedInteger('bees_awarded')->default(0);
            $table->timestamps();

            $table->foreign('ask_id')->references('id')->on('hive_asks')->cascadeOnDelete();
            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
            $table->index(['ask_id', 'status', 'created_at', 'id'], 'hive_answers_thread_idx');
            // "How many accepted answers has this person been paid for today?"
            $table->index(['customer_id', 'accepted_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hive_answers');
        Schema::dropIfExists('hive_ask_votes');
        Schema::dropIfExists('hive_asks');
        Schema::dropIfExists('hive_comments');
        Schema::table('hive_looks', fn (Blueprint $table) => $table->dropColumn('comments_count'));
    }
};
