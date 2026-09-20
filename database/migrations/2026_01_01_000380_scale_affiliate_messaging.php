<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Makes the affiliate inbox cost the same at 5,000 threads as it does at 5.
 *
 * Before this, listing the admin inbox ran `MAX(created_at) GROUP BY
 * affiliate_id` across EVERY message ever sent, then two more queries per
 * thread — and the admin page asks for that list every 15 seconds. It grows
 * with the total history, not with what is on screen.
 *
 * `last_message_at` is the standard fix: the one fact the list is sorted by is
 * kept on the parent row and indexed, so "the 30 most recent conversations" is
 * an index range read that never touches the messages table.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('affiliates', function (Blueprint $table) {
            $table->timestamp('last_message_at')->nullable();
            $table->index('last_message_at');
        });

        Schema::table('affiliate_messages', function (Blueprint $table) {
            // "How many unread across all threads" — the admin badge. The
            // existing (affiliate_id, sender, read_at) index leads with the
            // thread, so a cross-thread count could only scan. Unread rows are
            // a tiny slice of the table; leading with read_at finds just them.
            $table->index(['read_at', 'sender'], 'affiliate_messages_unread_idx');
        });

        // Correlated subquery rather than UPDATE…JOIN: the latter is MySQL-only
        // and the test suite migrates on sqlite.
        DB::statement('
            UPDATE affiliates
            SET last_message_at = (
                SELECT MAX(created_at) FROM affiliate_messages
                WHERE affiliate_messages.affiliate_id = affiliates.id
            )
        ');
    }

    public function down(): void
    {
        Schema::table('affiliate_messages', function (Blueprint $table) {
            $table->dropIndex('affiliate_messages_unread_idx');
        });
        Schema::table('affiliates', function (Blueprint $table) {
            $table->dropIndex(['last_message_at']);
            $table->dropColumn('last_message_at');
        });
    }
};
