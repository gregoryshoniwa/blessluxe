<?php

namespace App\Services;

use App\Models\Customer;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Bless Hive — pages, fit, looks, follows.
 *
 * Three rules this class exists to hold in one place:
 *
 *   1. EVERY customer has a page. `profile()` creates it on first need, so
 *      nothing else has to ask "do they have one yet?".
 *   2. A person's measurements never leave here as numbers unless they chose
 *      `public`. Everything that describes a profile to someone else goes
 *      through `present()`, and `present()` is where that is enforced.
 *   3. Cost follows what is on screen: feeds are keyset-paged windows on
 *      indexed columns, counts are denormalised, nothing scans.
 */
class Hive
{
    public const LOOKS_PER_PAGE = 12;
    /** "For you" ranks the newest RANK_WINDOW looks from the last RANK_DAYS; older ones follow in date order. */
    public const RANK_WINDOW = 300;
    public const RANK_DAYS = 21;
    public const SHAPES_OF_FRAME = ['tall', 'wide', 'post'];
    public const VIDEO_MAX_SECONDS = 30;
    public const VIDEO_MAX_BYTES = 12 * 1024 * 1024;
    public const MAX_IMAGES = 4;
    /** Distinct reporters before a look is hidden pending review. */
    public const REPORTS_TO_HIDE = 3;

    public const SHAPES = ['pear', 'hourglass', 'apple', 'rectangle', 'inverted'];
    public const OCCASIONS = ['everyday', 'work', 'church', 'wedding', 'roora', 'kitchen-party', 'graduation', 'date', 'party', 'funeral', 'travel'];
    public const REPORT_REASONS = ['nudity', 'minor', 'harassment', 'scam', 'spam', 'other'];

    /**
     * Handles that would collide with a route, impersonate the brand, or read
     * as official. A handle is a URL — blessluxe.com/@admin must not be someone.
     */
    private const RESERVED = [
        'admin', 'administrator', 'api', 'hive', 'blesshive', 'blessluxe', 'bless', 'luxe', 'support', 'help', 'staff',
        'official', 'team', 'moderator', 'mod', 'security', 'system', 'root', 'shop', 'store', 'account', 'login',
        'signup', 'checkout', 'cart', 'pages', 'page', 'feed', 'explore', 'twins', 'looks', 'look', 'me', 'you',
        'about', 'terms', 'privacy', 'bees', 'affiliate', 'affiliates', 'null', 'undefined', 'everyone', 'all',
    ];

    // ─── Profiles ──────────────────────────────────────────────────────────

    /** The customer's page — created on first need. */
    public static function profile(Customer $customer): object
    {
        $row = DB::table('hive_profiles')->where('customer_id', $customer->id)->first();
        if ($row) return $row;

        $name = trim(($customer->first_name ?? '') . ' ' . ($customer->last_name ?? ''));

        // Two requests can both find "no profile" at once (the header and the
        // page both ask on first load); the second insert must not be an error.
        DB::table('hive_profiles')->insertOrIgnore([
            'customer_id'  => $customer->id,
            'handle'       => self::freeHandle($name ?: Str::before((string) $customer->email, '@')),
            'display_name' => Str::limit($name ?: 'New member', 60, ''),
            'avatar_url'   => $customer->avatar_url,
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);

        return DB::table('hive_profiles')->where('customer_id', $customer->id)->first();
    }

    public static function byHandle(string $handle): ?object
    {
        $handle = self::normaliseHandle($handle);

        return $handle === '' ? null : DB::table('hive_profiles')->where('handle', $handle)->whereNull('suspended_at')->first();
    }

    /** Lowercase letters, digits, dot and underscore; no leading/trailing/double punctuation. */
    public static function normaliseHandle(?string $raw): string
    {
        $h = Str::lower(Str::ascii(trim((string) $raw)));
        $h = ltrim($h, '@');
        $h = preg_replace('/[^a-z0-9._]+/', '', str_replace([' ', '-'], '_', $h));
        $h = preg_replace('/[._]{2,}/', '_', (string) $h);

        return substr(trim((string) $h, '._'), 0, 30);
    }

    /** Why a handle can't be used, or null if it can. */
    public static function handleProblem(string $handle, ?string $ownerId = null): ?string
    {
        if (strlen($handle) < 3) return 'Use at least 3 letters or numbers.';
        if (in_array($handle, self::RESERVED, true) || Str::startsWith($handle, ['blessluxe', 'bless_luxe', 'blesshive'])) {
            return 'That name is reserved.';
        }
        $taken = DB::table('hive_profiles')->where('handle', $handle)
            ->when($ownerId, fn ($q) => $q->where('customer_id', '!=', $ownerId))->exists();

        return $taken ? 'That name is taken.' : null;
    }

    private static function freeHandle(string $seed): string
    {
        $base = self::normaliseHandle($seed);
        if (strlen($base) < 3 || self::handleProblem($base)) $base = substr($base ?: 'member', 0, 22);

        for ($i = 0; $i < 25; $i++) {
            $try = $i === 0 ? $base : substr($base, 0, 24) . '_' . random_int(10, 9999);
            if (strlen($try) >= 3 && ! self::handleProblem($try)) return $try;
        }

        return 'member_' . Str::lower(Str::random(10));
    }

    /**
     * A profile as ANOTHER person may see it.
     *
     * @param  ?object $viewer  the viewer's own profile row, if signed in
     */
    public static function present(object $p, ?object $viewer = null, bool $following = false): array
    {
        $mine = $viewer && $viewer->customer_id === $p->customer_id;
        $showNumbers = $mine || $p->fit_visibility === 'public';
        // Sizes are what make a fit twin USEFUL ("she wears a 12 in this"), so
        // they are shared at the `twins` level; the tape-measure numbers are not.
        $showSizes = $showNumbers || $p->fit_visibility === 'twins';

        $out = [
            'handle'       => $p->handle,
            'display_name' => $p->display_name,
            'bio'          => $p->bio,
            'avatar_url'   => $p->avatar_url,
            'city'         => $p->city,
            'followers'    => (int) $p->followers_count,
            'following'    => (int) $p->following_count,
            'looks'        => (int) $p->looks_count,
            'is_me'        => $mine,
            'i_follow'     => $following,
            'fit'          => null,
        ];

        if ($showSizes) {
            $out['fit'] = array_filter([
                'body_shape'  => $p->body_shape,
                'size_top'    => $p->size_top,
                'size_bottom' => $p->size_bottom,
                'size_dress'  => $p->size_dress,
                'size_shoe'   => $p->size_shoe,
            ] + ($showNumbers ? [
                'height_cm' => $p->height_cm, 'bust_cm' => $p->bust_cm,
                'waist_cm'  => $p->waist_cm,  'hips_cm' => $p->hips_cm,
            ] : []), fn ($v) => $v !== null && $v !== '');
        }
        if ($viewer && ! $mine) $out['twin_match'] = self::matchPercent($viewer, $p);
        if ($mine) {
            $out['fit_visibility'] = $p->fit_visibility;
            $out['adult_confirmed'] = $p->adult_confirmed_at !== null;
        }

        return $out;
    }

    // ─── Fit twins ─────────────────────────────────────────────────────────

    /**
     * How alike two bodies are, 0–100, or null when it can't honestly be said
     * (one side hasn't shared, or fewer than two measurements in common).
     * Each centimetre apart costs points; hips and bust weigh most because they
     * decide whether a garment goes on at all.
     */
    public static function matchPercent(object $a, object $b): ?int
    {
        if ($a->fit_visibility === 'private' || $b->fit_visibility === 'private') return null;

        $weights = ['bust_cm' => 3.0, 'waist_cm' => 2.5, 'hips_cm' => 3.0, 'height_cm' => 1.0];
        $penalty = 0.0; $used = 0;
        foreach ($weights as $k => $w) {
            if (! $a->$k || ! $b->$k) continue;
            $penalty += abs($a->$k - $b->$k) * $w;
            $used++;
        }
        if ($used < 2) return null;

        $score = 100 - ($penalty / $used) * 1.6;
        if ($a->body_shape && $a->body_shape === $b->body_shape) $score += 4;

        return (int) max(0, min(100, round($score)));
    }

    /** People built like $me who agreed to be matched — best first. */
    public static function twins(object $me, int $limit = 24): array
    {
        if ($me->fit_visibility === 'private' || ! ($me->bust_cm && $me->hips_cm || $me->waist_cm && $me->hips_cm || $me->bust_cm && $me->waist_cm)) {
            return [];
        }

        // Narrow on the index first (within 8 cm on whatever I have entered),
        // then score the small set that survives in PHP.
        $q = DB::table('hive_profiles')
            ->where('customer_id', '!=', $me->customer_id)
            ->whereIn('fit_visibility', ['twins', 'public'])
            ->whereNull('suspended_at');
        foreach (['bust_cm', 'waist_cm', 'hips_cm'] as $k) {
            if ($me->$k) $q->whereBetween($k, [$me->$k - 8, $me->$k + 8]);
        }

        $mine = self::followedIds($me->customer_id);

        return $q->limit(300)->get()
            ->map(fn ($p) => ['p' => $p, 'm' => self::matchPercent($me, $p)])
            ->filter(fn ($r) => $r['m'] !== null && $r['m'] >= 70)
            ->sortByDesc('m')->take($limit)
            ->map(fn ($r) => self::present($r['p'], $me, in_array($r['p']->customer_id, $mine, true)))
            ->values()->all();
    }

    /** Find people by name or @handle. Prefix match on the indexed handle first, then names. */
    public static function searchPeople(string $q, ?object $viewer, int $limit = 20): array
    {
        $q = trim(ltrim(trim($q), '@'));
        if (mb_strlen($q) < 2) return [];
        // "%" and "\\" are dropped rather than escaped (escaping differs between
        // MySQL and the sqlite the tests run on). "_" stays: handles contain it,
        // and as a one-character wildcard it can only widen the match slightly.
        $like = str_replace(['\\', '%'], '', $q) . '%';

        $rows = DB::table('hive_profiles')->whereNull('suspended_at')
            ->where(fn ($w) => $w->where('handle', 'like', mb_strtolower($like))->orWhere('display_name', 'like', $like)->orWhere('display_name', 'like', '% ' . $like))
            ->orderByDesc('followers_count')->limit($limit)->get();
        $mine = $viewer ? self::followedIds($viewer->customer_id) : [];

        return $rows->map(fn ($p) => self::present($p, $viewer, in_array($p->customer_id, $mine, true)))->all();
    }

    /** People worth following when you follow nobody yet: active pages, most followed first. */
    public static function suggested(?object $viewer, int $limit = 12): array
    {
        $mine = $viewer ? self::followedIds($viewer->customer_id) : [];
        $rows = DB::table('hive_profiles')->whereNull('suspended_at')->where('looks_count', '>', 0)
            ->when($viewer, fn ($w) => $w->where('customer_id', '!=', $viewer->customer_id))
            ->when($mine, fn ($w) => $w->whereNotIn('customer_id', array_slice($mine, 0, 1000)))
            ->orderByDesc('followers_count')->orderByDesc('looks_count')->limit($limit)->get();

        return $rows->map(fn ($p) => self::present($p, $viewer, false))->all();
    }

    /** A single published look, for a shared link or a notification. */
    public static function look(string $id, ?object $viewer): ?array
    {
        $l = DB::table('hive_looks as l')->join('hive_profiles as p', 'p.customer_id', '=', 'l.customer_id')
            ->where('l.id', $id)->where('l.status', 'published')->whereNull('p.suspended_at')
            ->first(['l.*', 'p.handle', 'p.display_name', 'p.avatar_url']);
        if (! $l) return null;
        $liked = $viewer && DB::table('hive_likes')->where('look_id', $id)->where('customer_id', $viewer->customer_id)->exists();

        return self::presentLook($l, $viewer, (bool) $liked);
    }

    // ─── Following ─────────────────────────────────────────────────────────

    /** @return array<int,string> */
    public static function followedIds(string $customerId): array
    {
        return DB::table('hive_follows')->where('follower_id', $customerId)->limit(5000)->pluck('followed_id')->all();
    }

    public static function follow(string $followerId, string $followedId): bool
    {
        if ($followerId === $followedId) return false;

        return DB::transaction(function () use ($followerId, $followedId) {
            $new = DB::table('hive_follows')->insertOrIgnore([
                'follower_id' => $followerId, 'followed_id' => $followedId, 'created_at' => now(),
            ]);
            // Counters move only when a row really changed, so a double tap
            // can't inflate anyone's follower count.
            if ($new) {
                DB::table('hive_profiles')->where('customer_id', $followedId)->increment('followers_count');
                DB::table('hive_profiles')->where('customer_id', $followerId)->increment('following_count');
            }

            return (bool) $new;
        });
    }

    public static function unfollow(string $followerId, string $followedId): bool
    {
        return DB::transaction(function () use ($followerId, $followedId) {
            $gone = DB::table('hive_follows')->where('follower_id', $followerId)->where('followed_id', $followedId)->delete();
            if ($gone) {
                DB::table('hive_profiles')->where('customer_id', $followedId)->where('followers_count', '>', 0)->decrement('followers_count');
                DB::table('hive_profiles')->where('customer_id', $followerId)->where('following_count', '>', 0)->decrement('following_count');
            }

            return (bool) $gone;
        });
    }

    // ─── Looks ─────────────────────────────────────────────────────────────

    /**
     * A page of looks, newest first.
     *
     * @param  'everyone'|'following'|'page' $scope
     * @return array{looks: array<int,array>, next: ?string}
     */
    public static function looks(string $scope, ?object $viewer, ?string $pageCustomerId = null, ?string $before = null, int $limit = self::LOOKS_PER_PAGE, ?string $occasion = null, ?string $challengeId = null): array
    {
        $q = DB::table('hive_looks as l')
            ->join('hive_profiles as p', 'p.customer_id', '=', 'l.customer_id')
            ->where('l.status', 'published')
            ->whereNull('p.suspended_at');

        if ($scope === 'page') {
            $q->where('l.customer_id', $pageCustomerId);
        } elseif ($scope === 'following') {
            $ids = $viewer ? self::followedIds($viewer->customer_id) : [];
            if (! $ids) return ['looks' => [], 'next' => null];
            $q->whereIn('l.customer_id', $ids);
        }

        if ($occasion && in_array($occasion, self::OCCASIONS, true)) $q->where('l.occasion', $occasion);
        if ($challengeId) $q->where('l.challenge_id', $challengeId);

        // Keyset, not OFFSET: page 50 costs the same as page 1, and a new look
        // arriving mid-scroll can't shift everything down and repeat one.
        if ($before && ($c = DB::table('hive_looks')->where('id', $before)->first(['id', 'created_at']))) {
            $q->where(fn ($w) => $w->where('l.created_at', '<', $c->created_at)
                ->orWhere(fn ($t) => $t->where('l.created_at', $c->created_at)->where('l.id', '<', $c->id)));
        }

        $rows = $q->orderByDesc('l.created_at')->orderByDesc('l.id')->limit($limit + 1)
            ->get(['l.*', 'p.handle', 'p.display_name', 'p.avatar_url']);

        $more = $rows->count() > $limit;
        $rows = $rows->take($limit);

        $liked = $viewer && $rows->isNotEmpty()
            ? DB::table('hive_likes')->where('customer_id', $viewer->customer_id)->whereIn('look_id', $rows->pluck('id'))->pluck('look_id')->all()
            : [];

        return [
            'looks' => $rows->map(fn ($l) => self::presentLook($l, $viewer, in_array($l->id, $liked, true)))->all(),
            'next'  => $more ? $rows->last()->id : null,
        ];
    }

    public static function presentLook(object $l, ?object $viewer, bool $liked = false): array
    {
        $mine = $viewer && $viewer->customer_id === $l->customer_id;

        return [
            'id'         => $l->id,
            'caption'    => $l->caption,
            'images'     => json_decode((string) $l->images, true) ?: [],
            'refs'       => json_decode((string) ($l->refs ?? ''), true) ?: [],
            'occasion'   => $l->occasion,
            'created_at' => Carbon::parse($l->created_at, config('app.timezone'))->toIso8601String(),
            'author'     => ['handle' => $l->handle ?? null, 'display_name' => $l->display_name ?? null, 'avatar_url' => $l->avatar_url ?? null],
            'liked'      => $liked,
            'is_mine'    => $mine,
            // Only the author sees the number. A public tally turns "does this
            // suit me?" into a popularity score — the comparison loop that the
            // research ties to body-image harm. The heart still works for everyone.
            'likes'      => $mine ? (int) $l->likes_count : null,
            // Conversation isn't a popularity score, so this one is public.
            'comments'   => (int) ($l->comments_count ?? 0),
            // "Ordered vs got": set only when this look is about a real purchase.
            // The clip is fetched only on tap; the label says what that tap costs.
            'video'      => ! empty($l->video_url) ? [
                'url' => $l->video_url, 'seconds' => (int) $l->video_seconds, 'shape' => ($l->shape ?? null) ?: 'post',
                'size_label' => $l->video_bytes ? (($mb = $l->video_bytes / 1048576) >= 1 ? number_format($mb, 1) . ' MB' : max(1, (int) round($l->video_bytes / 1024)) . ' KB') : null,
            ] : null,
            // A post on another platform, framed only after a tap. The address is built by us.
            'embed'      => HiveEmbeds::present($l->embed_provider ?? null, $l->embed_ref ?? null, $l->shape ?? null),
            'try_on'     => ! empty($l->line_item_id) ? ['fit' => $l->fit, 'size_worn' => $l->size_worn, 'rating' => $l->rating ? (int) $l->rating : null] : null,
            'challenge_id' => $l->challenge_id ?? null,
            'won'        => ! empty($l->won_at),
        ];
    }

    /** @return bool whether this was a NEW heart (a second tap isn't, and must not notify again) */
    public static function like(string $lookId, string $customerId): bool
    {
        return DB::transaction(function () use ($lookId, $customerId) {
            $new = DB::table('hive_likes')->insertOrIgnore(['look_id' => $lookId, 'customer_id' => $customerId, 'created_at' => now()]);
            if ($new) DB::table('hive_looks')->where('id', $lookId)->increment('likes_count');

            return (bool) $new;
        });
    }

    public static function unlike(string $lookId, string $customerId): void
    {
        DB::transaction(function () use ($lookId, $customerId) {
            if (DB::table('hive_likes')->where('look_id', $lookId)->where('customer_id', $customerId)->delete()) {
                DB::table('hive_looks')->where('id', $lookId)->where('likes_count', '>', 0)->decrement('likes_count');
            }
        });
    }

    // ─── "For you" ─────────────────────────────────────────────────────────

    /**
     * The ranked feed.
     *
     * Ranking and paging pull against each other: a score that changes between
     * requests makes page 2 repeat or skip things. So the candidate set is
     * FROZEN by the cursor — `r.<anchor>.<offset>` means "the newest RANK_WINDOW
     * looks no newer than <anchor>, ranked, starting at <offset>". New looks
     * arriving mid-scroll don't enter it; reloading starts a new one. When the
     * ranked window is used up, the feed carries on in date order from where
     * the window ended (an ordinary look-id cursor).
     *
     * What counts, for a signed-in member: how fresh it is, whether you follow
     * them, whether they're built like you, whether it's a real try-on, and
     * conversation (comments count double — hearts are cheap). Then a spacing
     * rule so one busy person can't fill the screen. Signed out, it's freshness
     * and conversation only. At this size it is one indexed query of 300 rows
     * per page; past ~50k looks a day, precompute it.
     */
    public static function ranked(?object $viewer, ?string $cursor = null, ?string $occasion = null): array
    {
        [$anchor, $offset] = [null, 0];
        if ($cursor && preg_match('/^r\.([A-Za-z0-9_]+)\.(\d+)$/', $cursor, $m)) [$anchor, $offset] = [$m[1], (int) $m[2]];

        $q = DB::table('hive_looks as l')->join('hive_profiles as p', 'p.customer_id', '=', 'l.customer_id')
            ->where('l.status', 'published')->whereNull('p.suspended_at')
            ->where('l.created_at', '>=', now()->subDays(self::RANK_DAYS));
        if ($occasion && in_array($occasion, self::OCCASIONS, true)) $q->where('l.occasion', $occasion);
        if ($anchor) $q->where('l.id', '<=', $anchor);

        $rows = $q->orderByDesc('l.id')->limit(self::RANK_WINDOW)->get(['l.*', 'p.handle', 'p.display_name', 'p.avatar_url',
            'p.fit_visibility', 'p.bust_cm', 'p.waist_cm', 'p.hips_cm', 'p.height_cm', 'p.body_shape']);
        // Nothing recent: fall back to plain date order so the feed is never empty while looks exist.
        if ($rows->isEmpty()) return self::looks('everyone', $viewer, null, null, self::LOOKS_PER_PAGE, $occasion);

        $anchor ??= $rows->first()->id;
        $follows = $viewer ? array_flip(self::followedIds($viewer->customer_id)) : [];
        $canMatch = $viewer && $viewer->fit_visibility !== 'private';
        $matches = [];                                   // per author, not per look

        $scored = $rows->map(function ($l) use ($viewer, $follows, $canMatch, &$matches) {
            $ageHours = max(0, abs(now()->diffInMinutes(Carbon::parse($l->created_at))) / 60);
            $score = 100 * exp(-$ageHours / 36);
            $score += 12 * log(1 + (int) $l->likes_count + 2 * (int) $l->comments_count);
            if (! empty($l->line_item_id)) $score += 15;
            if (! empty($l->won_at)) $score += 10;
            if ($viewer) {
                if (isset($follows[$l->customer_id]) || $l->customer_id === $viewer->customer_id) $score += 40;
                if ($canMatch && $l->fit_visibility !== 'private' && $l->customer_id !== $viewer->customer_id) {
                    $matches[$l->customer_id] ??= self::matchPercent($viewer, $l) ?? 0;
                    if ($matches[$l->customer_id] >= 70) $score += $matches[$l->customer_id] - 60;
                }
            }

            return ['l' => $l, 's' => $score];
        })->sortByDesc('s')->values();

        // Spacing: each further look by the same person is worth a little less.
        $seen = [];
        $ranked = $scored->map(function ($r) use (&$seen) {
            $k = $seen[$r['l']->customer_id] = ($seen[$r['l']->customer_id] ?? -1) + 1;
            $r['s'] -= 25 * min($k, 4);

            return $r;
        })->sortByDesc('s')->values();

        $page = $ranked->slice($offset, self::LOOKS_PER_PAGE)->pluck('l')->values();
        $liked = $viewer && $page->isNotEmpty()
            ? DB::table('hive_likes')->where('customer_id', $viewer->customer_id)->whereIn('look_id', $page->pluck('id'))->pluck('look_id')->all() : [];

        $nextOffset = $offset + self::LOOKS_PER_PAGE;
        $next = $nextOffset < $ranked->count()
            ? "r.{$anchor}.{$nextOffset}"
            // Window used up: carry on by date from its oldest look, if anything is older.
            : (DB::table('hive_looks')->where('status', 'published')->where('id', '<', $rows->last()->id)->exists() ? $rows->last()->id : null);

        return [
            'looks' => $page->map(fn ($l) => self::presentLook($l, $viewer, in_array($l->id, $liked, true)))->all(),
            'next'  => $next,
        ];
    }

    // ─── Reports ───────────────────────────────────────────────────────────

    /**
     * File a report. A look that several DIFFERENT people report is hidden until
     * staff look at it — one person can report once, so nobody can take a post
     * down alone. A report about a child is never left waiting: it hides at once.
     */
    public static function report(string $reporterId, string $type, string $subjectId, string $reason, ?string $note): void
    {
        $new = DB::table('hive_reports')->insertOrIgnore([
            'id' => 'hrep_' . Str::ulid(), 'reporter_id' => $reporterId, 'subject_type' => $type, 'subject_id' => $subjectId,
            'reason' => $reason, 'note' => $note ? Str::limit(strip_tags($note), 300, '') : null,
            'status' => 'open', 'created_at' => now(), 'updated_at' => now(),
        ]);
        if (! $new) return;
        if (HiveTalk::isTalk($type)) { HiveTalk::reported($type, $subjectId, $reason); return; }
        if ($type !== 'look') return;

        DB::table('hive_looks')->where('id', $subjectId)->increment('reports_count');
        $count = (int) DB::table('hive_looks')->where('id', $subjectId)->value('reports_count');

        if ($reason === 'minor' || $count >= self::REPORTS_TO_HIDE) {
            self::setLookStatus($subjectId, 'hidden');
        }
    }

    /** Change a look's visibility, keeping the owner's public count honest. */
    public static function setLookStatus(string $lookId, string $status): void
    {
        DB::transaction(function () use ($lookId, $status) {
            $look = DB::table('hive_looks')->where('id', $lookId)->lockForUpdate()->first();
            if (! $look || $look->status === $status) return;

            DB::table('hive_looks')->where('id', $lookId)->update(['status' => $status, 'updated_at' => now()]);

            $was = $look->status === 'published'; $is = $status === 'published';
            if ($was && ! $is) DB::table('hive_profiles')->where('customer_id', $look->customer_id)->where('looks_count', '>', 0)->decrement('looks_count');
            if (! $was && $is) DB::table('hive_profiles')->where('customer_id', $look->customer_id)->increment('looks_count');
            // …and a challenge's entry count, if it was entered in one.
            if ($look->challenge_id && $was !== $is) {
                $c = DB::table('hive_challenges')->where('id', $look->challenge_id);
                $is ? $c->increment('entries_count') : $c->where('entries_count', '>', 0)->decrement('entries_count');
            }
        });
    }
}
