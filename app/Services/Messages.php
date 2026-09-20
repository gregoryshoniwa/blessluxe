<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The affiliate ↔ admin conversation.
 *
 * One thread per affiliate rather than per topic: an affiliate has one
 * relationship with the brand, and splitting it into separate inboxes for
 * product requests, pricing questions and exclusivity would mean checking
 * several places for one conversation.
 *
 * Product requests post INTO this thread, so admin replies where they read.
 */
class Messages
{
    public static function post(
        string $affiliateId,
        string $sender,          // 'affiliate' | 'admin'
        ?string $authorId,
        string $body,
        array $attachments = [],
        ?string $requestId = null,
    ): string {
        $id = 'amsg_' . Str::random(16);

        DB::table('affiliate_messages')->insert([
            'id'           => $id,
            'affiliate_id' => $affiliateId,
            'sender'       => $sender,
            // Prefixed: users.id is an int and customers.id is a cust_* string,
            // and they share this column.
            'author_id'    => $authorId,
            'body'         => $body,
            'attachments'  => $attachments ? json_encode($attachments) : null,
            'request_id'   => $requestId,
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);

        return $id;
    }

    /** @return array<int,array> oldest first, the way a conversation reads */
    public static function thread(string $affiliateId, int $limit = 200): array
    {
        return DB::table('affiliate_messages')
            ->where('affiliate_id', $affiliateId)
            ->orderBy('created_at')
            ->limit($limit)
            ->get()
            ->map(fn ($m) => (array) $m + [
                'attachments' => json_decode((string) $m->attachments, true) ?: [],
            ])
            ->all();
    }

    /**
     * Mark the OTHER side's messages read.
     *
     * $reader is who is looking, so opening your own inbox never marks your own
     * messages read — that would zero the badge on the side that hasn't looked.
     */
    public static function markRead(string $affiliateId, string $reader): void
    {
        DB::table('affiliate_messages')
            ->where('affiliate_id', $affiliateId)
            ->where('sender', '!=', $reader)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);
    }

    /** Unread count for one side of one thread. */
    public static function unreadFor(string $affiliateId, string $reader): int
    {
        return DB::table('affiliate_messages')
            ->where('affiliate_id', $affiliateId)
            ->where('sender', '!=', $reader)
            ->whereNull('read_at')
            ->count();
    }

    /** Every thread with activity, newest first — the admin inbox list. */
    public static function adminInbox(): array
    {
        $latest = DB::table('affiliate_messages')
            ->select('affiliate_id', DB::raw('MAX(created_at) as last_at'))
            ->groupBy('affiliate_id');

        return DB::table('affiliates')
            ->joinSub($latest, 'm', 'm.affiliate_id', '=', 'affiliates.id')
            ->orderByDesc('m.last_at')
            ->get(['affiliates.id', 'affiliates.code', 'affiliates.first_name', 'affiliates.last_name', 'affiliates.email', 'm.last_at'])
            ->map(fn ($r) => (array) $r + [
                'unread'  => self::unreadFor($r->id, 'admin'),
                'preview' => Str::limit((string) DB::table('affiliate_messages')
                    ->where('affiliate_id', $r->id)->latest('created_at')->value('body'), 90),
            ])
            ->all();
    }
}
