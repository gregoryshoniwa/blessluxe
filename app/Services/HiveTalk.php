<?php

namespace App\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Bless Hive — the talking parts: comments on looks, Ask, and the activity
 * that tells people someone responded.
 *
 * Ask is where an ordinary member first EARNS: the asker accepts the answer
 * that helped and that helper is paid in Bees. Bees are money-like (100 = $1),
 * so every rule around `accept()` exists to stop two accounts paying each other:
 *   - you can't answer, or accept, your own question
 *   - one accepted answer per question, and accepting is final
 *   - a helper is paid for at most PAID_ACCEPTS_PER_DAY answers a day
 *   - the same asker pays the same helper at most once a week
 * Past a cap the answer is still accepted (the status is real) — it just
 * carries no Bees.
 */
class HiveTalk
{
    public const COMMENTS_PER_PAGE = 20;
    public const ASKS_PER_PAGE = 12;
    public const MAX_ASK_IMAGES = 4;

    public const ACCEPTED_ANSWER_BEES = 25;
    public const PAID_ACCEPTS_PER_DAY = 4;
    public const SAME_PAIR_COOLDOWN_DAYS = 7;

    /** Notification kinds that belong on the Hive's Activity page. */
    public const ACTIVITY_KINDS = ['hive_follow', 'hive_like', 'hive_comment', 'hive_answer', 'hive_accepted'];

    /** Reportable things beyond looks/pages: type → [table, parent counter]. */
    private const TALK = [
        'comment' => ['hive_comments', 'hive_looks', 'look_id', 'comments_count'],
        'answer'  => ['hive_answers',  'hive_asks',  'ask_id',  'answers_count'],
        'ask'     => ['hive_asks',     null,         null,      null],
    ];

    // ─── Comments ──────────────────────────────────────────────────────────

    /** Newest window first; the client shows them oldest → newest. */
    public static function comments(string $lookId, ?object $viewer, ?string $before = null): array
    {
        $look = DB::table('hive_looks')->where('id', $lookId)->first(['id', 'customer_id']);
        if (! $look) return ['comments' => [], 'next' => null];

        $q = DB::table('hive_comments as c')
            ->join('hive_profiles as p', 'p.customer_id', '=', 'c.customer_id')
            ->where('c.look_id', $lookId)->where('c.status', 'published')->whereNull('p.suspended_at');
        if ($before) $q->where('c.id', '<', $before);      // ULIDs sort by time

        $rows = $q->orderByDesc('c.id')->limit(self::COMMENTS_PER_PAGE + 1)->get(['c.*', 'p.handle', 'p.display_name', 'p.avatar_url']);
        $more = $rows->count() > self::COMMENTS_PER_PAGE;
        $rows = $rows->take(self::COMMENTS_PER_PAGE);

        return [
            'comments' => $rows->reverse()->values()->map(fn ($c) => self::presentComment($c, $viewer, $look->customer_id))->all(),
            'next'     => $more ? $rows->last()->id : null,
        ];
    }

    public static function addComment(object $look, object $me, string $body): array
    {
        $id = 'cmt_' . Str::ulid();
        DB::transaction(function () use ($id, $look, $me, $body) {
            DB::table('hive_comments')->insert([
                'id' => $id, 'look_id' => $look->id, 'customer_id' => $me->customer_id, 'body' => $body,
                'status' => 'published', 'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('hive_looks')->where('id', $look->id)->increment('comments_count');
        });

        self::notify($look->customer_id, $me, 'hive_comment', "{$me->display_name} commented on your look", Str::limit($body, 90), "/@{$look->handle}?look={$look->id}");

        $row = (object) (['id' => $id, 'body' => $body, 'customer_id' => $me->customer_id, 'created_at' => now(),
            'handle' => $me->handle, 'display_name' => $me->display_name, 'avatar_url' => $me->avatar_url]);

        return self::presentComment($row, $me, $look->customer_id);
    }

    /** The commenter can remove their words; the look's owner can remove anything under their look. */
    public static function deleteComment(string $commentId, object $me): bool
    {
        return DB::transaction(function () use ($commentId, $me) {
            $c = DB::table('hive_comments as c')->join('hive_looks as l', 'l.id', '=', 'c.look_id')
                ->where('c.id', $commentId)->first(['c.id', 'c.look_id', 'c.customer_id', 'c.status', 'l.customer_id as owner_id']);
            if (! $c || ! in_array($me->customer_id, [$c->customer_id, $c->owner_id], true)) return false;

            DB::table('hive_comments')->where('id', $commentId)->delete();
            if ($c->status === 'published') DB::table('hive_looks')->where('id', $c->look_id)->where('comments_count', '>', 0)->decrement('comments_count');

            return true;
        });
    }

    private static function presentComment(object $c, ?object $viewer, string $lookOwnerId): array
    {
        return [
            'id' => $c->id, 'body' => $c->body, 'created_at' => self::iso($c->created_at),
            'author' => ['handle' => $c->handle, 'display_name' => $c->display_name, 'avatar_url' => $c->avatar_url],
            'is_mine' => $viewer && $viewer->customer_id === $c->customer_id,
            'can_delete' => $viewer && in_array($viewer->customer_id, [$c->customer_id, $lookOwnerId], true),
        ];
    }

    // ─── Ask ───────────────────────────────────────────────────────────────

    public static function asks(?object $viewer, ?string $before = null, ?string $occasion = null, ?string $byCustomerId = null): array
    {
        $q = DB::table('hive_asks as a')->join('hive_profiles as p', 'p.customer_id', '=', 'a.customer_id')
            ->where('a.status', 'published')->whereNull('p.suspended_at');
        if ($occasion) $q->where('a.occasion', $occasion);
        if ($byCustomerId) $q->where('a.customer_id', $byCustomerId);
        if ($before) $q->where('a.id', '<', $before);

        $rows = $q->orderByDesc('a.id')->limit(self::ASKS_PER_PAGE + 1)->get(['a.*', 'p.handle', 'p.display_name', 'p.avatar_url']);
        $more = $rows->count() > self::ASKS_PER_PAGE;
        $rows = $rows->take(self::ASKS_PER_PAGE);

        $mine = $viewer && $rows->isNotEmpty()
            ? DB::table('hive_ask_votes')->where('customer_id', $viewer->customer_id)->whereIn('ask_id', $rows->pluck('id'))->pluck('option', 'ask_id')->all()
            : [];

        return [
            'asks' => $rows->map(fn ($a) => self::presentAsk($a, $viewer, $mine[$a->id] ?? null))->all(),
            'next' => $more ? $rows->last()->id : null,
        ];
    }

    /** One question with its answers — the accepted one first, then oldest first. */
    public static function ask(string $id, ?object $viewer): ?array
    {
        $a = DB::table('hive_asks as a')->join('hive_profiles as p', 'p.customer_id', '=', 'a.customer_id')
            ->where('a.id', $id)->where('a.status', 'published')->whereNull('p.suspended_at')
            ->first(['a.*', 'p.handle', 'p.display_name', 'p.avatar_url']);
        if (! $a) return null;

        $vote = $viewer ? DB::table('hive_ask_votes')->where('ask_id', $id)->where('customer_id', $viewer->customer_id)->value('option') : null;
        $isAsker = $viewer && $viewer->customer_id === $a->customer_id;

        $answers = DB::table('hive_answers as n')->join('hive_profiles as p', 'p.customer_id', '=', 'n.customer_id')
            ->where('n.ask_id', $id)->where('n.status', 'published')->whereNull('p.suspended_at')
            ->orderByRaw('n.accepted_at IS NULL')->orderBy('n.id')->limit(200)
            ->get(['n.*', 'p.handle', 'p.display_name', 'p.avatar_url']);

        return [
            'ask' => self::presentAsk($a, $viewer, $vote),
            'answers' => $answers->map(fn ($n) => [
                'id' => $n->id, 'body' => $n->body, 'refs' => json_decode((string) ($n->refs ?? ''), true) ?: [],
                'created_at' => self::iso($n->created_at),
                'author' => ['handle' => $n->handle, 'display_name' => $n->display_name, 'avatar_url' => $n->avatar_url],
                'accepted' => $n->accepted_at !== null,
                'bees' => (int) $n->bees_awarded,
                'is_mine' => $viewer && $viewer->customer_id === $n->customer_id,
                'can_accept' => $isAsker && ! $a->accepted_answer_id && $n->customer_id !== $a->customer_id,
            ])->all(),
        ];
    }

    public static function presentAsk(object $a, ?object $viewer, ?int $myVote): array
    {
        $images = json_decode((string) ($a->images ?? ''), true) ?: [];
        $mine = $viewer && $viewer->customer_id === $a->customer_id;
        $isPoll = count($images) >= 2;
        // The tally is shown once you've voted (or it's your question): seeing
        // it first just makes people vote with the crowd.
        $showTally = $isPoll && ($mine || $myVote !== null);
        $votes = array_pad(json_decode((string) ($a->votes ?? ''), true) ?: [], count($images), 0);

        return [
            'id' => $a->id, 'question' => $a->question, 'details' => $a->details, 'occasion' => $a->occasion,
            'images' => $images, 'is_poll' => $isPoll,
            'my_vote' => $myVote, 'votes' => $showTally ? $votes : null, 'votes_total' => $showTally ? array_sum($votes) : null,
            'answers' => (int) $a->answers_count, 'solved' => $a->accepted_answer_id !== null,
            'created_at' => self::iso($a->created_at),
            'author' => ['handle' => $a->handle ?? null, 'display_name' => $a->display_name ?? null, 'avatar_url' => $a->avatar_url ?? null],
            'is_mine' => $mine,
        ];
    }

    /** One vote each, and it's final. Returns the fresh tally, or null if it didn't count. */
    public static function vote(string $askId, object $me, int $option): ?array
    {
        return DB::transaction(function () use ($askId, $me, $option) {
            $a = DB::table('hive_asks')->where('id', $askId)->where('status', 'published')->lockForUpdate()->first();
            if (! $a || $a->customer_id === $me->customer_id) return null;

            $n = count(json_decode((string) ($a->images ?? ''), true) ?: []);
            if ($n < 2 || $option < 0 || $option >= $n) return null;

            $new = DB::table('hive_ask_votes')->insertOrIgnore(['ask_id' => $askId, 'customer_id' => $me->customer_id, 'option' => $option, 'created_at' => now()]);
            $votes = array_pad(json_decode((string) ($a->votes ?? ''), true) ?: [], $n, 0);
            if ($new) {
                $votes[$option]++;
                DB::table('hive_asks')->where('id', $askId)->update(['votes' => json_encode($votes)]);
            }

            return $votes;
        });
    }

    public static function addAnswer(object $ask, object $me, ?string $body, array $refs): string
    {
        $id = 'ans_' . Str::ulid();
        DB::transaction(function () use ($id, $ask, $me, $body, $refs) {
            DB::table('hive_answers')->insert([
                'id' => $id, 'ask_id' => $ask->id, 'customer_id' => $me->customer_id, 'body' => $body,
                'refs' => $refs ? json_encode($refs) : null, 'status' => 'published', 'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('hive_asks')->where('id', $ask->id)->increment('answers_count');
        });

        self::notify($ask->customer_id, $me, 'hive_answer', "{$me->display_name} answered your question", Str::limit($ask->question, 90), "/hive/ask/{$ask->id}");

        return $id;
    }

    /**
     * The asker marks the answer that helped. Returns ['bees' => n] or an
     * error string. See the class docblock for why each check exists.
     */
    public static function accept(string $askId, string $answerId, object $me): array|string
    {
        $result = DB::transaction(function () use ($askId, $answerId, $me) {
            $ask = DB::table('hive_asks')->where('id', $askId)->lockForUpdate()->first();
            if (! $ask || $ask->customer_id !== $me->customer_id) return 'Only the person who asked can accept an answer.';
            if ($ask->accepted_answer_id) return "You've already accepted an answer.";

            $ans = DB::table('hive_answers')->where('id', $answerId)->where('ask_id', $askId)->where('status', 'published')->first();
            if (! $ans) return 'That answer is no longer there.';
            if ($ans->customer_id === $me->customer_id) return "You can't accept your own answer.";

            $paidToday = DB::table('hive_answers')->where('customer_id', $ans->customer_id)->where('bees_awarded', '>', 0)
                ->where('accepted_at', '>=', now()->startOfDay())->count();
            $samePair = DB::table('hive_answers as n')->join('hive_asks as a', 'a.id', '=', 'n.ask_id')
                ->where('n.customer_id', $ans->customer_id)->where('a.customer_id', $me->customer_id)->where('n.bees_awarded', '>', 0)
                ->where('n.accepted_at', '>=', now()->subDays(self::SAME_PAIR_COOLDOWN_DAYS))->exists();
            $bees = ($paidToday >= self::PAID_ACCEPTS_PER_DAY || $samePair || ! Bees::settings()['enabled']) ? 0 : self::ACCEPTED_ANSWER_BEES;

            DB::table('hive_answers')->where('id', $answerId)->update(['accepted_at' => now(), 'bees_awarded' => $bees, 'updated_at' => now()]);
            DB::table('hive_asks')->where('id', $askId)->update(['accepted_answer_id' => $answerId, 'updated_at' => now()]);

            return ['bees' => $bees, 'helper' => $ans->customer_id, 'question' => $ask->question];
        });
        if (is_string($result)) return $result;

        if ($result['bees'] > 0) Bees::credit($result['helper'], $result['bees'], 'hive_answer_accepted', $askId);
        self::notify($result['helper'], $me, 'hive_accepted',
            $result['bees'] > 0 ? "Your answer was accepted — you earned {$result['bees']} Bees" : 'Your answer was accepted',
            Str::limit($result['question'], 90), "/hive/ask/{$askId}");

        return ['bees' => $result['bees']];
    }

    // ─── Moderation for comments / asks / answers ──────────────────────────

    public static function isTalk(string $type): bool { return isset(self::TALK[$type]); }

    public static function exists(string $type, string $id): bool
    {
        return DB::table(self::TALK[$type][0])->where('id', $id)->exists();
    }

    public static function ownerOf(string $type, string $id): ?string
    {
        return DB::table(self::TALK[$type][0])->where('id', $id)->value('customer_id');
    }

    /** Called for each NEW report. Same thresholds as looks. */
    public static function reported(string $type, string $id, string $reason): void
    {
        [$table] = self::TALK[$type];
        DB::table($table)->where('id', $id)->increment('reports_count');
        $count = (int) DB::table($table)->where('id', $id)->value('reports_count');

        if ($reason === 'minor' || $count >= Hive::REPORTS_TO_HIDE) self::setStatus($type, $id, 'hidden');
    }

    /** Hide or restore, keeping the parent's visible count honest. */
    public static function setStatus(string $type, string $id, string $status): void
    {
        [$table, $parent, $fk, $counter] = self::TALK[$type];

        DB::transaction(function () use ($table, $parent, $fk, $counter, $id, $status) {
            $row = DB::table($table)->where('id', $id)->lockForUpdate()->first();
            if (! $row || $row->status === $status) return;

            DB::table($table)->where('id', $id)->update(['status' => $status, 'updated_at' => now()]);
            if (! $parent) return;

            $was = $row->status === 'published'; $is = $status === 'published';
            if ($was && ! $is) DB::table($parent)->where('id', $row->$fk)->where($counter, '>', 0)->decrement($counter);
            if (! $was && $is) DB::table($parent)->where('id', $row->$fk)->increment($counter);
        });
    }

    // ─── Activity ──────────────────────────────────────────────────────────

    /**
     * Tell someone that another member did something. Never for your own
     * actions, and never allowed to break the action itself.
     */
    public static function notify(string $recipientId, object $actor, string $kind, string $title, ?string $body, string $url): void
    {
        if ($recipientId === $actor->customer_id) return;
        try {
            Notifications::forCustomer($recipientId, $kind, $title, $body, $url, ['actor' => $actor->handle, 'avatar_url' => $actor->avatar_url]);
        } catch (\Throwable $e) {
            Log::warning('Hive notification failed', ['kind' => $kind, 'error' => $e->getMessage()]);
        }
    }

    public static function activity(string $customerId, int $limit = 50): array
    {
        $base = fn () => DB::table('notifications')->where('recipient_type', Notifications::TYPE_CUSTOMER)
            ->where('recipient_id', $customerId)->whereIn('kind', self::ACTIVITY_KINDS);

        return [
            'unread' => $base()->whereNull('read_at')->count(),
            'items' => $base()->orderByDesc('created_at')->limit($limit)->get()->map(function ($n) {
                $meta = json_decode((string) ($n->metadata ?? ''), true) ?: [];

                return ['id' => $n->id, 'kind' => $n->kind, 'title' => $n->title, 'body' => $n->body, 'url' => $n->action_url,
                    'actor' => $meta['actor'] ?? null, 'avatar_url' => $meta['avatar_url'] ?? null,
                    'unread' => $n->read_at === null, 'created_at' => self::iso($n->created_at)];
            })->all(),
        ];
    }

    public static function markActivityRead(string $customerId): void
    {
        DB::table('notifications')->where('recipient_type', Notifications::TYPE_CUSTOMER)->where('recipient_id', $customerId)
            ->whereIn('kind', self::ACTIVITY_KINDS)->whereNull('read_at')->update(['read_at' => now()]);
    }

    private static function iso($at): string
    {
        return Carbon::parse($at, config('app.timezone'))->toIso8601String();
    }
}
