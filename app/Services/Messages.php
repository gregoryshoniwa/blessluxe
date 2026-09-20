<?php

namespace App\Services;

use App\Services\Media;
use App\Events\AffiliateMessageSent;
use App\Events\AffiliateMessagesRead;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
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
 *
 * ── Built so cost tracks what is on screen, not what is in the table ──────
 *   - A thread is read in WINDOWS of 50, newest first, paged backwards by
 *     keyset (`before`). Never the whole history.
 *   - A client that already has the thread asks only for what is new
 *     (`after`). A quiet poll returns an empty array.
 *   - The inbox list sorts on `affiliates.last_message_at`, which is indexed,
 *     so it never aggregates the messages table.
 *   - Sending returns the one new message, not the thread again.
 */
class Messages
{
    public const WINDOW = 50;

    public static function post(
        string $affiliateId,
        string $sender,          // 'affiliate' | 'admin'
        ?string $authorId,
        string $body,
        array $attachments = [],
        ?string $requestId = null,
        array $refs = [],        // resolved snapshots — see MessageRefs::resolve
    ): string {
        // ULID, not random: ids sort in the order they were created, which is
        // what lets (created_at, id) be a stable cursor. `created_at` alone has
        // one-second resolution, and two messages in the same second would
        // otherwise page in an arbitrary order — or be skipped by a cursor.
        $id  = 'amsg_' . Str::ulid();
        $now = now();

        DB::table('affiliate_messages')->insert([
            'id'           => $id,
            'affiliate_id' => $affiliateId,
            'sender'       => $sender,
            // Prefixed: users.id is an int and customers.id is a cust_* string,
            // and they share this column.
            'author_id'    => $authorId,
            'body'         => $body,
            'attachments'  => $attachments ? json_encode($attachments) : null,
            'refs'         => $refs ? json_encode($refs) : null,
            'request_id'   => $requestId,
            'created_at'   => $now,
            'updated_at'   => $now,
        ]);

        // What the inbox list sorts by. Kept on the parent so listing threads
        // never has to aggregate this table.
        DB::table('affiliates')->where('id', $affiliateId)->update(['last_message_at' => $now]);

        // Push it to whoever is on the thread. Wrapped because a broadcast
        // failure must never lose a message that is already saved — the poll
        // fallback will surface it a few seconds later either way.
        try {
            AffiliateMessageSent::dispatch($affiliateId, self::find($id));
        } catch (\Throwable $e) {
            Log::warning('[affiliate message broadcast] ' . $e->getMessage());
        }

        return $id;
    }

    /** One message, in the shape every endpoint and broadcast uses. */
    public static function find(string $id): ?array
    {
        $row = DB::table('affiliate_messages')->where('id', $id)->first();

        return $row ? self::present($row) : null;
    }

    /**
     * A slice of a thread, always returned oldest-first (the way it reads).
     *
     *   no cursor → the newest WINDOW messages
     *   before    → the WINDOW messages just older than that id   (scrollback)
     *   after     → everything newer than that id                 (delta poll)
     *
     * @return array{messages: array<int,array>, has_more: bool}
     */
    public static function window(string $affiliateId, ?string $before = null, ?string $after = null, int $limit = self::WINDOW): array
    {
        $q = DB::table('affiliate_messages')->where('affiliate_id', $affiliateId);

        if ($after && ($cursor = self::cursor($affiliateId, $after))) {
            // Deltas are small by nature, but cap them so a client that was
            // offline for a month can't ask for the whole table in one go.
            $rows = self::seek($q, $cursor, '>')
                ->orderBy('created_at')->orderBy('id')
                ->limit(200)->get();

            return ['messages' => $rows->map(fn ($r) => self::present($r))->all(), 'has_more' => false];
        }

        if ($before && ($cursor = self::cursor($affiliateId, $before))) {
            self::seek($q, $cursor, '<');
        }

        // Newest-first to take the window off the right end, one extra row to
        // learn whether there is anything older, then flipped for reading.
        $rows = $q->orderByDesc('created_at')->orderByDesc('id')->limit($limit + 1)->get();
        $hasMore = $rows->count() > $limit;

        return [
            'messages' => $rows->take($limit)->reverse()->values()->map(fn ($r) => self::present($r))->all(),
            'has_more' => $hasMore,
        ];
    }

    /** @return array<int,array> the newest window, oldest first */
    public static function thread(string $affiliateId, int $limit = self::WINDOW): array
    {
        return self::window($affiliateId, limit: $limit)['messages'];
    }

    /**
     * The newest of $sender's messages that the other side has read.
     *
     * Reading is always "everything up to now", so one id is the whole read
     * state: a client ticks every message of its own at or before this one.
     * It rides along on delta polls so ticks stay right even with no socket.
     */
    public static function readUpto(string $affiliateId, string $sender): ?string
    {
        return DB::table('affiliate_messages')
            ->where('affiliate_id', $affiliateId)
            ->where('sender', $sender)
            ->whereNotNull('read_at')
            ->orderByDesc('created_at')->orderByDesc('id')
            ->value('id');
    }

    /**
     * Mark the OTHER side's messages read.
     *
     * $reader is who is looking, so opening your own inbox never marks your own
     * messages read — that would zero the badge on the side that hasn't looked.
     */
    public static function markRead(string $affiliateId, string $reader): int
    {
        $at = now();

        $marked = DB::table('affiliate_messages')
            ->where('affiliate_id', $affiliateId)
            ->where('sender', '!=', $reader)
            ->whereNull('read_at')
            ->update(['read_at' => $at]);

        // Only announce a read that actually changed something. Every thread
        // open calls this, so broadcasting unconditionally would put a socket
        // frame on the wire every time anyone glanced at a conversation.
        if ($marked > 0) {
            try {
                AffiliateMessagesRead::dispatch($affiliateId, $reader, $at->toIso8601String());
            } catch (\Throwable $e) {
                Log::warning('[affiliate read broadcast] ' . $e->getMessage());
            }
        }

        return $marked;
    }

    /**
     * The oldest message this side hasn't read yet, before anything is marked.
     *
     * Opening a thread marks it read, so by the time the client renders, every
     * message already looks read and a "new messages" divider could never
     * appear. Capturing the boundary first lets the client keep showing where
     * it left off for as long as the thread stays open.
     *
     * @return array{id: ?string, count: int}
     */
    public static function unreadBoundary(string $affiliateId, string $reader): array
    {
        $unread = DB::table('affiliate_messages')
            ->where('affiliate_id', $affiliateId)
            ->where('sender', '!=', $reader)
            ->whereNull('read_at');

        return [
            'count' => (clone $unread)->count(),
            'id'    => $unread->orderBy('created_at')->orderBy('id')->value('id'),
        ];
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

    /** Everything waiting on the brand, across all threads — the admin badge. */
    public static function adminUnreadTotal(): int
    {
        return DB::table('affiliate_messages')
            ->whereNull('read_at')
            ->where('sender', 'affiliate')
            ->count();
    }

    /**
     * A page of threads, most recently active first — the admin inbox list.
     *
     * Search and the unread filter run HERE, not in the browser: a client can
     * only filter the page it holds, so client-side search silently misses
     * every thread that hasn't been scrolled into view yet.
     *
     * @return array{threads: array<int,array>, has_more: bool}
     */
    public static function adminInbox(?string $search = null, bool $unreadOnly = false, int $page = 1, int $perPage = 30): array
    {
        $unread = fn ($q) => $q->from('affiliate_messages as u')
            ->whereColumn('u.affiliate_id', 'affiliates.id')
            ->where('u.sender', 'affiliate')
            ->whereNull('u.read_at');

        $latest = fn ($q, string $col) => $q->from('affiliate_messages as p')
            ->whereColumn('p.affiliate_id', 'affiliates.id')
            ->orderByDesc('p.created_at')->orderByDesc('p.id')
            ->limit(1)->select("p.$col");

        $q = DB::table('affiliates')
            ->whereNotNull('affiliates.last_message_at')
            ->select(['affiliates.id', 'affiliates.code', 'affiliates.first_name', 'affiliates.last_name', 'affiliates.email', 'affiliates.last_message_at as last_at'])
            // Correlated, but only evaluated for the rows of this page.
            ->selectSub(fn ($s) => $unread($s)->selectRaw('COUNT(*)'), 'unread')
            ->selectSub(fn ($s) => $latest($s, 'body'), 'preview')
            ->selectSub(fn ($s) => $latest($s, 'attachments'), 'last_attachments')
            ->selectSub(fn ($s) => $latest($s, 'refs'), 'last_refs')
            ->selectSub(fn ($s) => $latest($s, 'sender'), 'last_sender');

        if ($search !== null && trim($search) !== '') {
            $like = '%' . addcslashes(trim($search), '%_\\') . '%';
            $q->where(fn ($w) => $w
                ->where('affiliates.code', 'like', $like)
                ->orWhere('affiliates.email', 'like', $like)
                ->orWhere('affiliates.first_name', 'like', $like)
                ->orWhere('affiliates.last_name', 'like', $like));
        }

        if ($unreadOnly) {
            $q->whereExists(fn ($s) => $unread($s)->selectRaw('1'));
        }

        $rows = $q->orderByDesc('affiliates.last_message_at')->orderBy('affiliates.id')
            ->offset((max(1, $page) - 1) * $perPage)
            ->limit($perPage + 1)
            ->get();

        return [
            'has_more' => $rows->count() > $perPage,
            'threads'  => $rows->take($perPage)->map(fn ($r) => [
                'id'          => $r->id,
                'code'        => $r->code,
                'first_name'  => $r->first_name,
                'last_name'   => $r->last_name,
                'email'       => $r->email,
                'last_at'     => self::iso($r->last_at),
                'unread'      => (int) $r->unread,
                'preview'     => self::preview(
                    $r->preview,
                    json_decode((string) $r->last_attachments, true) ?: [],
                    json_decode((string) $r->last_refs, true) ?: [],
                ),
                'last_sender' => $r->last_sender,
            ])->all(),
        ];
    }

    /**
     * One line that stands in for a message — inbox rows, notifications.
     * A message can legitimately have no text (a photo, a product), and an
     * empty preview reads as "nothing was sent".
     */
    public static function preview(?string $body, array $attachments = [], array $refs = [], int $limit = 90): string
    {
        $body = trim((string) $body);
        if ($body !== '') return Str::limit($body, $limit);
        if ($refs) return Str::limit('🏷 ' . ($refs[0]['title'] ?? 'Product') . (count($refs) > 1 ? ' +' . (count($refs) - 1) : ''), $limit);
        if ($attachments) return count($attachments) > 1 ? '📷 ' . count($attachments) . ' photos' : '📷 Photo';

        return '';
    }

    /**
     * Store uploaded chat images, returning their public paths.
     * Shared by both sides so the rules (and the directory) can't drift.
     *
     * @param  array<int,\Illuminate\Http\UploadedFile>  $files
     * @return array<int,string>
     */
    public static function storeImages(array $files): array
    {
        // Naming (random, extension from the file's real bytes) and location
        // are Media's job — see App\Services\Media.
        $paths = [];
        foreach ($files as $file) {
            $paths[] = Media::upload($file, 'uploads/affiliate-messages');
        }

        return $paths;
    }

    /** Validation shared by both send endpoints. */
    public static function sendRules(): array
    {
        return [
            // Text is optional now — a photo or a product can be the message —
            // but SOMETHING has to be there.
            'body'     => ['nullable', 'string', 'max:4000', 'required_without_all:images,refs'],
            'images'   => ['nullable', 'array', 'max:6'],
            'images.*' => ['image', 'max:6144'],
            'refs'     => ['nullable'],
        ];
    }

    /** `refs` arrives as an array (JSON request) or a JSON string (multipart). */
    public static function refsFromRequest(\Illuminate\Http\Request $request): array
    {
        $raw = $request->input('refs');
        if (is_string($raw)) $raw = json_decode($raw, true);

        return is_array($raw) ? $raw : [];
    }

    // ─── Internals ─────────────────────────────────────────────────────────

    /** The (created_at, id) position of a message, scoped to its own thread. */
    private static function cursor(string $affiliateId, string $messageId): ?object
    {
        // Scoped to the thread so an id from someone else's conversation can't
        // be used to probe where it sits in time.
        return DB::table('affiliate_messages')
            ->where('affiliate_id', $affiliateId)
            ->where('id', $messageId)
            ->first(['id', 'created_at']);
    }

    /** Keyset seek on (created_at, id) — stable where OFFSET is not. */
    private static function seek($q, object $cursor, string $op)
    {
        return $q->where(fn ($w) => $w
            ->where('created_at', $op, $cursor->created_at)
            ->orWhere(fn ($t) => $t
                ->where('created_at', $cursor->created_at)
                ->where('id', $op, $cursor->id)));
    }

    private static function present(object $m): array
    {
        return [
            'id'           => $m->id,
            'affiliate_id' => $m->affiliate_id,
            'sender'       => $m->sender,
            'body'         => $m->body,
            'attachments'  => json_decode((string) $m->attachments, true) ?: [],
            'refs'         => json_decode((string) ($m->refs ?? ''), true) ?: [],
            'request_id'   => $m->request_id,
            'read_at'      => self::iso($m->read_at),
            'created_at'   => self::iso($m->created_at),
        ];
    }

    /**
     * Always ISO-8601 with an offset.
     *
     * The raw column is a bare "2026-09-20 09:43:35" in the app's timezone
     * (UTC). A browser parses a bare datetime as LOCAL time, so every bubble
     * showed the server's wall clock — two hours out for anyone in Harare.
     */
    private static function iso($value): ?string
    {
        return $value ? Carbon::parse($value, config('app.timezone'))->toIso8601String() : null;
    }
}
