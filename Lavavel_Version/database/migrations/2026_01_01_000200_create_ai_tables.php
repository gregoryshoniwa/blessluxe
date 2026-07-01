<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Full BLESSLUXE AI agent schema. Mirrors the Next.js / Express version,
 * but with MySQL-flavoured choices:
 *
 *   - No pgvector — use MySQL FULLTEXT for memory recall (good enough for
 *     short-text "remember when I asked about that grey coat" matches).
 *   - JSON columns for flexible tool-call / metadata / preferences blobs.
 *   - String FKs to customers because customer_id is already a string PK.
 *
 * Tables created:
 *   ai_conversations           — session metadata + summary + sentiment
 *   ai_messages                — chat turns (user / assistant / tool / system)
 *   ai_customer_memories       — long-term recall, FULLTEXT searchable
 *   ai_customer_interactions   — telemetry (views, searches, cart adds)
 *   ai_customer_preferences    — learned colours/styles/sizes/budget
 *   ai_event_subscriptions     — price-drop / back-in-stock alerts
 *   ai_reminders               — scheduled nudges
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_conversations', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('session_id')->unique();
            $table->string('customer_id')->nullable();
            $table->text('summary')->nullable();
            $table->string('sentiment', 16)->nullable();   // positive|neutral|negative
            $table->json('topics')->nullable();
            $table->json('products_discussed')->nullable();
            $table->timestamp('started_at')->useCurrent();
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();
            $table->foreign('customer_id')->references('id')->on('customers')->nullOnDelete();
            $table->index('customer_id');
            $table->index('started_at');
        });

        Schema::create('ai_messages', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('conversation_id');
            $table->string('role', 16);  // user|assistant|tool|system
            $table->longText('content');
            $table->json('tool_calls')->nullable();
            $table->json('tool_results')->nullable();
            $table->json('products')->nullable();
            $table->json('suggestions')->nullable();
            $table->json('ui_updates')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('conversation_id')->references('id')->on('ai_conversations')->cascadeOnDelete();
            $table->index(['conversation_id', 'created_at']);
        });

        Schema::create('ai_customer_memories', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('customer_id');
            $table->text('content');
            $table->string('content_type', 32)->default('fact'); // fact|preference|event|insight
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
            $table->index(['customer_id', 'created_at']);
        });
        // FULLTEXT for keyword recall. Raw SQL because Schema builder doesn't
        // expose FULLTEXT directly on MySQL prior to a separate DB::statement.
        DB::statement('ALTER TABLE ai_customer_memories ADD FULLTEXT memory_content_ft (content)');

        Schema::create('ai_customer_interactions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('customer_id')->nullable();
            $table->string('session_id')->nullable();
            $table->string('interaction_type', 32);  // view|search|cart_add|wishlist_add|click
            $table->string('product_id')->nullable();
            $table->string('category')->nullable();
            $table->string('search_query')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('customer_id')->references('id')->on('customers')->nullOnDelete();
            $table->index(['customer_id', 'interaction_type']);
            $table->index('session_id');
            $table->index('created_at');
        });

        Schema::create('ai_customer_preferences', function (Blueprint $table) {
            $table->string('customer_id')->primary();
            $table->json('favorite_colors')->nullable();
            $table->json('favorite_styles')->nullable();
            $table->json('preferred_fits')->nullable();
            $table->json('avoided_styles')->nullable();
            $table->string('top_size', 16)->nullable();
            $table->string('bottom_size', 16)->nullable();
            $table->string('dress_size', 16)->nullable();
            $table->string('shoe_size', 16)->nullable();
            $table->string('price_sensitivity', 16)->nullable();  // budget|mid|luxury
            $table->integer('budget_min')->nullable();
            $table->integer('budget_max')->nullable();
            $table->json('preferred_categories')->nullable();
            $table->json('favorite_brands')->nullable();
            $table->json('purchase_occasions')->nullable();
            $table->string('preferred_contact', 16)->nullable();
            $table->string('notification_frequency', 16)->nullable();
            $table->text('style_profile')->nullable();
            $table->decimal('recommendations_accuracy', 4, 3)->nullable();
            $table->timestamps();
            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
        });

        Schema::create('ai_event_subscriptions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('customer_id');
            $table->string('event_type', 32);   // price_drop|back_in_stock|sale_start|new_arrival
            $table->string('target_id');
            $table->string('target_type', 32);  // product|category|brand|style
            $table->json('conditions')->nullable();
            $table->string('channel', 16)->default('push');  // push|email|sms
            $table->boolean('active')->default(true);
            $table->integer('triggered_count')->default(0);
            $table->timestamp('last_triggered_at')->nullable();
            $table->timestamps();
            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
            $table->index(['customer_id', 'active']);
            $table->index(['event_type', 'target_id']);
        });

        Schema::create('ai_reminders', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('customer_id');
            $table->text('message');
            $table->json('context')->nullable();
            $table->timestamp('scheduled_for');
            $table->string('channel', 16)->default('push');
            $table->string('status', 16)->default('pending');  // pending|sent|cancelled
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();
            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
            $table->index(['status', 'scheduled_for']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_reminders');
        Schema::dropIfExists('ai_event_subscriptions');
        Schema::dropIfExists('ai_customer_preferences');
        Schema::dropIfExists('ai_customer_interactions');
        Schema::dropIfExists('ai_customer_memories');
        Schema::dropIfExists('ai_messages');
        Schema::dropIfExists('ai_conversations');
    }
};
