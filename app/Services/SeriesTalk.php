<?php

namespace App\Services;

use App\Http\Controllers\Api\PackController;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The conversation inside a series — the one thing a WhatsApp group does that
 * a page didn't, until now.
 *
 * It's a timeline, not just a list of posts: somebody taking a size and the
 * series filling appear in it as events, so a stranger reading it sees a group
 * that is moving, not a wall of questions. Posts carry a short name ("Rudo M.",
 * the same as a review); join events carry two initials only, because buying
 * is not a decision to be named.
 *
 * Reading is public. Posting needs an account. **Nothing here pays Bees** —
 * paying for chatter would buy exactly the noise a group chat drowns in.
 */
class SeriesTalk
{
    public const MAX_LENGTH = 500;
    public const WINDOW = 60;              // items per read; a series is a short conversation

    /** Openers, for the moment a page is quiet and nobody wants to go first. */
    public const STARTERS = [
        "I'm in! 🎉",
        'Is this true to size?',
        'Who else is collecting in Harare?',
        'Anyone taking the last size? We ship when it fills.',
    ];

    /**
     * Everything said and done in a series, oldest first. With `since`, only
     * what's newer — the page polls with the time of the last thing it saw.
     *
     * @return array<int,array{id:string,kind:string,body:?string,author:?array,created_at:string}>
     */
    public static function timeline(string $campaignId, ?string $since = null, ?string $viewerId = null): array
    {
        $cut = $since ? Carbon::parse($since) : null;
        $buyers = self::buyers($campaignId);

        $posts = DB::table('pack_campaign_posts as p')
            ->join('customers as c', 'c.id', '=', 'p.customer_id')
            ->where('p.pack_campaign_id', $campaignId)
            ->whereNull('p.hidden_at')
            ->when($cut, fn ($q) => $q->where('p.created_at', '>', $cut))
            ->orderByDesc('p.created_at')->orderByDesc('p.id')
            ->limit(self::WINDOW)
            ->get(['p.id', 'p.body', 'p.customer_id', 'p.created_at', 'c.first_name', 'c.last_name'])
            ->map(fn ($r) => [
                'id'         => $r->id,
                'kind'       => 'post',
                'body'       => $r->body,
                'author'     => [
                    'name'      => self::shortName($r->first_name, $r->last_name),
                    'initials'  => PackController::initials($r),
                    'in_series' => in_array($r->customer_id, $buyers, true),
                    'mine'      => $viewerId !== null && $r->customer_id === $viewerId,
                ],
                'created_at' => Carbon::parse($r->created_at)->toIso8601String(),
            ]);

        // Someone taking a size is news in a group buy; it shows as an event.
        $joins = DB::table('pack_slots as s')
            ->join('customers as c', 'c.id', '=', 's.customer_id')
            ->where('s.pack_campaign_id', $campaignId)
            ->where('s.status', 'paid')
            ->whereNull('s.deleted_at')
            ->when($cut, fn ($q) => $q->where('s.updated_at', '>', $cut))
            ->orderByDesc('s.updated_at')
            ->limit(self::WINDOW)
            ->get(['s.id', 's.size_label', 's.customer_id', 's.updated_at', 'c.first_name', 'c.last_name'])
            ->map(fn ($r) => [
                'id'         => 'join_' . $r->id,
                'kind'       => 'joined',
                'body'       => trim('took size ' . ($r->size_label ?: '')),
                'author'     => ['name' => null, 'initials' => PackController::initials($r), 'in_series' => true, 'mine' => $viewerId !== null && $r->customer_id === $viewerId],
                'created_at' => Carbon::parse($r->updated_at)->toIso8601String(),
            ]);

        $events = collect();
        $campaign = DB::table('pack_campaigns')->where('id', $campaignId)->first(['status', 'updated_at']);
        if ($campaign && $campaign->status === 'filled' && (! $cut || Carbon::parse($campaign->updated_at)->gt($cut))) {
            $events->push([
                'id' => 'filled', 'kind' => 'filled', 'body' => 'Every size is paid — the series is being ordered.',
                'author' => null, 'created_at' => Carbon::parse($campaign->updated_at)->toIso8601String(),
            ]);
        }

        return $posts->concat($joins)->concat($events)
            ->sortBy([['created_at', 'asc'], ['id', 'asc']])
            ->take(-self::WINDOW)
            ->values()
            ->all();
    }

    /** @return array{post:array}|string  A string is the reason it was refused. */
    public static function post(string $customerId, string $campaignId, string $body): array|string
    {
        $body = trim(preg_replace('/[ \t]+/u', ' ', strip_tags($body)));
        if ($body === '') return 'Say something first.';
        if (mb_strlen($body) > self::MAX_LENGTH) return 'Keep it under ' . self::MAX_LENGTH . ' characters.';

        $id = 'spost_' . Str::ulid();
        DB::table('pack_campaign_posts')->insert([
            'id' => $id, 'pack_campaign_id' => $campaignId, 'customer_id' => $customerId,
            'body' => $body, 'created_at' => now(),
        ]);

        $c = DB::table('customers')->where('id', $customerId)->first(['first_name', 'last_name']);

        return ['post' => [
            'id'         => $id,
            'kind'       => 'post',
            'body'       => $body,
            'author'     => [
                'name'      => self::shortName($c?->first_name, $c?->last_name),
                'initials'  => PackController::initials($c),
                'in_series' => in_array($customerId, self::buyers($campaignId), true),
                'mine'      => true,
            ],
            'created_at' => now()->toIso8601String(),
        ]];
    }

    /** Your own words, taken back. */
    public static function remove(string $customerId, string $postId): bool
    {
        return DB::table('pack_campaign_posts')->where('id', $postId)->where('customer_id', $customerId)->delete() > 0;
    }

    /** Staff take one down, or put it back; the row survives either way. */
    public static function setHidden(string $postId, bool $hidden): bool
    {
        return DB::table('pack_campaign_posts')->where('id', $postId)->update(['hidden_at' => $hidden ? now() : null]) > 0;
    }

    /** Who has actually paid for a size — the people who are "in". */
    public static function buyers(string $campaignId): array
    {
        return DB::table('pack_slots')->where('pack_campaign_id', $campaignId)
            ->where('status', 'paid')->whereNull('deleted_at')->whereNotNull('customer_id')
            ->distinct()->pluck('customer_id')->all();
    }

    /** "Rudo M." — the same as a review. */
    private static function shortName(?string $first, ?string $last): string
    {
        $first = trim((string) $first);
        $initial = trim((string) $last) !== '' ? ' ' . mb_strtoupper(mb_substr(trim($last), 0, 1)) . '.' : '';

        return ($first !== '' ? $first : 'A member') . $initial;
    }
}
