<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Product and pack references on a message — what an "@" mention becomes.
 *
 * Stored as a SNAPSHOT (title, thumbnail, price label at the time of sending),
 * not as bare ids to be looked up on read. Two reasons:
 *   - a thread window is 50 messages; hydrating live would put a catalogue join
 *     on every open and every poll, for data that almost never changes
 *   - a conversation is a record. "Can you restock this, it was $45" should
 *     still say $45 next month, the way a forwarded message keeps its text.
 * The link is by handle/code, so clicking always lands on the live item.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('affiliate_messages', function (Blueprint $table) {
            $table->json('refs')->nullable()->after('attachments');
        });
    }

    public function down(): void
    {
        Schema::table('affiliate_messages', function (Blueprint $table) {
            $table->dropColumn('refs');
        });
    }
};
