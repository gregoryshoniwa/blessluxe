<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Ratings, hearts and comments on a product — and the Bees they earn.
 *
 * **Bees are money** (100 = $1 off at checkout), so earning here is deliberately
 * hard to farm:
 *
 *   - paid ONCE per customer per product per action, for ever. The promise is a
 *     row in `product_engagement_rewards`, not the rating/like/comment, so
 *     unliking and liking again, or deleting and re-posting, earns nothing.
 *   - at most `daily_cap` paid actions a day per customer. Past that the
 *     action still happens, it just pays 0 — never a refusal, which would read
 *     as a bug to someone who only wanted to say something.
 *   - a comment has to be worth its Bees: `min_length` characters, and only the
 *     first comment on a product pays.
 *   - nothing pays while Bees are switched off.
 *
 * The rates themselves are staff-editable at /admin/bees (`settings()`), so the
 * guards above are what keep any figure they choose safe.
 *
 * Counters on `products` are recomputed from the rows inside the same
 * transaction that changed them, so they cannot drift out of step.
 */
class ProductEngagement
{
    public const KEY = 'product_engagement';

    /** What a fresh install pays. Staff change these at /admin/bees. */
    public const DEFAULTS = [
        'rate'       => 1,
        'like'       => 1,
        'comment'    => 2,
        'daily_cap'  => 5,      // paid actions per customer per day, all products
        'min_length' => 15,     // characters before a review is worth anything
    ];

    /** Ceilings on what staff can set. Bees are money — a typo shouldn't cost a fortune. */
    public const LIMITS = ['bees' => 100, 'daily_cap' => 50, 'min_length' => 200];

    public const MAX_LENGTH = 1000;

    /**
     * The live rates, seeded on first read the same way Bees and Payments do it,
     * so the admin page always has something to show.
     */
    public static function settings(): array
    {
        $raw = json_decode((string) DB::table('settings')->where('key', self::KEY)->value('value'), true);
        if (! is_array($raw)) {
            $raw = self::DEFAULTS;
            DB::table('settings')->updateOrInsert(['key' => self::KEY], ['value' => json_encode($raw), 'updated_at' => now()]);
        }

        $out = [];
        foreach (self::DEFAULTS as $k => $default) $out[$k] = (int) ($raw[$k] ?? $default);

        return $out;
    }

    /** @return array|string  A string is the reason it was refused. */
    public static function setConfig(array $patch): array|string
    {
        $next = self::settings();
        foreach (['rate', 'like', 'comment'] as $k) {
            if (! array_key_exists($k, $patch)) continue;
            $v = (int) $patch[$k];
            if ($v < 0 || $v > self::LIMITS['bees']) return "A reward has to be between 0 and " . self::LIMITS['bees'] . ' Bees.';
            $next[$k] = $v;
        }
        if (array_key_exists('daily_cap', $patch)) {
            $v = (int) $patch['daily_cap'];
            if ($v < 0 || $v > self::LIMITS['daily_cap']) return 'The daily limit has to be between 0 and ' . self::LIMITS['daily_cap'] . '.';
            $next['daily_cap'] = $v;
        }
        if (array_key_exists('min_length', $patch)) {
            $v = (int) $patch['min_length'];
            if ($v < 1 || $v > self::LIMITS['min_length']) return 'The shortest review has to be between 1 and ' . self::LIMITS['min_length'] . ' characters.';
            $next['min_length'] = $v;
        }

        DB::table('settings')->updateOrInsert(['key' => self::KEY], ['value' => json_encode($next), 'updated_at' => now()]);

        return $next;
    }

    /** Ledger reasons, so the Bees history reads plainly. */
    public const REASONS = [
        'product_rating'  => 'Rated a piece',
        'product_like'    => 'Loved a piece',
        'product_comment' => 'Reviewed a piece',
    ];

    // ─── Reading ───────────────────────────────────────────────────────────

    /**
     * Everything the product page needs: the verdict, the counts, and what this
     * viewer has already done (so the page never offers Bees twice).
     */
    public static function summary(string $productId, ?string $customerId = null): array
    {
        $p = DB::table('products')->where('id', $productId)
            ->first(['rating_count', 'rating_sum', 'likes_count', 'comments_count']);

        $count = (int) ($p->rating_count ?? 0);
        $average = $count > 0 ? round(((int) $p->rating_sum) / $count, 1) : null;

        $out = [
            'average'        => $average,
            'average_label'  => $average !== null ? number_format($average, 1) : null,
            'rating_count'   => $count,
            'likes_count'    => (int) ($p->likes_count ?? 0),
            'comments_count' => (int) ($p->comments_count ?? 0),
            'breakdown'      => self::breakdown($productId, $count),
            'rewards'        => self::settings() + ['enabled' => Bees::settings()['enabled']],
            'mine' => ['stars' => null, 'liked' => false, 'commented' => false, 'earned' => []],
        ];

        if ($customerId) {
            $out['mine'] = [
                'stars'     => (int) DB::table('product_ratings')->where('product_id', $productId)->where('customer_id', $customerId)->value('stars') ?: null,
                'liked'     => DB::table('product_likes')->where('product_id', $productId)->where('customer_id', $customerId)->exists(),
                'commented' => DB::table('product_comments')->where('product_id', $productId)->where('customer_id', $customerId)->exists(),
                // Which actions have already been paid for on THIS product.
                'earned'    => DB::table('product_engagement_rewards')
                    ->where('customer_id', $customerId)->where('product_id', $productId)->pluck('action')->all(),
            ];
        }

        return $out;
    }

    /** How many gave each number of stars, for the little bar chart. */
    private static function breakdown(string $productId, int $count): array
    {
        $out = [5 => 0, 4 => 0, 3 => 0, 2 => 0, 1 => 0];
        if ($count === 0) return $out;

        foreach (DB::table('product_ratings')->where('product_id', $productId)
            ->select('stars', DB::raw('count(*) as n'))->groupBy('stars')->get() as $row) {
            $out[(int) $row->stars] = (int) $row->n;
        }

        return $out;
    }

    /**
     * A page of comments, newest first. Hidden ones never leave the server.
     * "Verified buyer" is worked out from paid orders, not claimed by anyone.
     */
    public static function comments(string $productId, ?string $before = null, int $limit = 10): array
    {
        $q = DB::table('product_comments as c')
            ->join('customers as cu', 'cu.id', '=', 'c.customer_id')
            ->where('c.product_id', $productId)
            ->whereNull('c.hidden_at')
            ->orderByDesc('c.created_at')->orderByDesc('c.id')
            ->limit($limit + 1)
            ->select('c.id', 'c.body', 'c.customer_id', 'c.created_at', 'cu.first_name', 'cu.last_name');

        if ($before) {
            $row = DB::table('product_comments')->where('id', $before)->first(['created_at']);
            if ($row) $q->where('c.created_at', '<', $row->created_at);
        }

        $rows = $q->get();
        $more = $rows->count() > $limit;
        $rows = $rows->take($limit);

        $buyers = self::buyersOf($productId, $rows->pluck('customer_id')->all());

        return [
            'comments' => $rows->map(fn ($c) => [
                'id'         => $c->id,
                'body'       => $c->body,
                'author'     => self::shortName($c->first_name, $c->last_name),
                'verified'   => in_array($c->customer_id, $buyers, true),
                'mine'       => false,                       // filled in by the controller
                'customer_id' => $c->customer_id,
                'created_at' => \Carbon\Carbon::parse($c->created_at)->toIso8601String(),
            ])->values()->all(),
            'next' => $more ? $rows->last()->id : null,
        ];
    }

    /** Of these customers, which actually bought this product (paid, not refunded). */
    private static function buyersOf(string $productId, array $customerIds): array
    {
        if (! $customerIds) return [];

        return DB::table('order_line_items as li')
            ->join('orders as o', 'o.id', '=', 'li.order_id')
            ->where('li.product_id', $productId)
            ->where('o.payment_status', 'paid')
            ->whereIn('o.customer_id', $customerIds)
            ->distinct()->pluck('o.customer_id')->all();
    }

    /** "Rudo M." — a first name and an initial is enough to feel human. */
    private static function shortName(?string $first, ?string $last): string
    {
        $first = trim((string) $first);
        $initial = trim((string) $last) !== '' ? ' ' . strtoupper(substr(trim($last), 0, 1)) . '.' : '';

        return ($first !== '' ? $first : 'A customer') . $initial;
    }

    // ─── Acting ────────────────────────────────────────────────────────────

    /** 1–5 stars. Changing your mind is allowed; it only pays the first time. */
    public static function rate(string $customerId, string $productId, int $stars): array
    {
        $stars = max(1, min(5, $stars));

        DB::transaction(function () use ($customerId, $productId, $stars) {
            DB::table('product_ratings')->updateOrInsert(
                ['product_id' => $productId, 'customer_id' => $customerId],
                ['id' => 'prate_' . Str::random(16), 'stars' => $stars, 'created_at' => now(), 'updated_at' => now()],
            );
            self::recount($productId);
        });

        return ['bees' => self::pay($customerId, $productId, 'rate', self::settings()['rate'], 'product_rating')];
    }

    /** Heart on, heart off. Only the first heart ever pays. */
    public static function toggleLike(string $customerId, string $productId): array
    {
        $liked = false;
        DB::transaction(function () use ($customerId, $productId, &$liked) {
            $existing = DB::table('product_likes')->where('product_id', $productId)->where('customer_id', $customerId)->first(['id']);
            if ($existing) {
                DB::table('product_likes')->where('id', $existing->id)->delete();
            } else {
                DB::table('product_likes')->insert([
                    'id' => 'plike_' . Str::random(16), 'product_id' => $productId,
                    'customer_id' => $customerId, 'created_at' => now(),
                ]);
                $liked = true;
            }
            self::recount($productId);
        });

        return ['liked' => $liked, 'bees' => $liked ? self::pay($customerId, $productId, 'like', self::settings()['like'], 'product_like') : 0];
    }

    /** @return array{comment:array,bees:int}|string  A string is the reason it was refused. */
    public static function comment(string $customerId, string $productId, string $body): array|string
    {
        $body = trim(preg_replace('/\s+/u', ' ', strip_tags($body)));
        $min = self::settings()['min_length'];
        if (mb_strlen($body) < $min) return "Tell us a little more — at least {$min} characters.";
        if (mb_strlen($body) > self::MAX_LENGTH) $body = mb_substr($body, 0, self::MAX_LENGTH);

        $id = 'pcom_' . Str::random(16);
        DB::transaction(function () use ($id, $customerId, $productId, $body) {
            DB::table('product_comments')->insert([
                'id' => $id, 'product_id' => $productId, 'customer_id' => $customerId,
                'body' => $body, 'created_at' => now(), 'updated_at' => now(),
            ]);
            self::recount($productId);
        });

        $customer = DB::table('customers')->where('id', $customerId)->first(['first_name', 'last_name']);

        return [
            'comment' => [
                'id' => $id, 'body' => $body,
                'author'   => self::shortName($customer?->first_name, $customer?->last_name),
                'verified' => (bool) self::buyersOf($productId, [$customerId]),
                'mine'     => true,
                'customer_id' => $customerId,
                'created_at' => now()->toIso8601String(),
            ],
            'bees' => self::pay($customerId, $productId, 'comment', self::settings()['comment'], 'product_comment'),
        ];
    }

    /** Your own words, taken back. The Bees stay paid — the promise row is for ever. */
    public static function deleteComment(string $customerId, string $commentId): bool
    {
        $row = DB::table('product_comments')->where('id', $commentId)->first(['product_id', 'customer_id']);
        if (! $row || $row->customer_id !== $customerId) return false;

        DB::transaction(function () use ($commentId, $row) {
            DB::table('product_comments')->where('id', $commentId)->delete();
            self::recount($row->product_id);
        });

        return true;
    }

    /** Staff take one down (or put it back); the row survives either way. */
    public static function setHidden(string $commentId, bool $hidden): bool
    {
        $row = DB::table('product_comments')->where('id', $commentId)->first(['product_id']);
        if (! $row) return false;

        DB::transaction(function () use ($commentId, $row, $hidden) {
            DB::table('product_comments')->where('id', $commentId)->update(['hidden_at' => $hidden ? now() : null, 'updated_at' => now()]);
            self::recount($row->product_id);
        });

        return true;
    }

    // ─── Bees ──────────────────────────────────────────────────────────────

    /**
     * Pay once, ever, for this customer + product + action, and only within the
     * day's allowance. Returns what was actually credited — 0 is normal and is
     * never an error.
     */
    private static function pay(string $customerId, string $productId, string $action, int $bees, string $reason): int
    {
        if ($bees < 1 || ! Bees::settings()['enabled']) return 0;

        $today = DB::table('product_engagement_rewards')
            ->where('customer_id', $customerId)
            ->where('created_at', '>=', now()->startOfDay())
            ->count();
        if ($today >= self::settings()['daily_cap']) return 0;

        // insertOrIgnore is the whole guard: the unique key means a second
        // attempt writes nothing and returns 0, so nobody is paid twice.
        $new = DB::table('product_engagement_rewards')->insertOrIgnore([
            'id' => 'perew_' . Str::random(16), 'customer_id' => $customerId,
            'product_id' => $productId, 'action' => $action, 'bees' => $bees, 'created_at' => now(),
        ]);
        if (! $new) return 0;

        Bees::credit($customerId, $bees, $reason, $productId);

        return $bees;
    }

    /** How many more paid actions today — shown so the offer is never a lie. */
    public static function remainingToday(string $customerId): int
    {
        $used = DB::table('product_engagement_rewards')
            ->where('customer_id', $customerId)
            ->where('created_at', '>=', now()->startOfDay())
            ->count();

        return max(0, self::settings()['daily_cap'] - $used);
    }

    // ─── Trending ──────────────────────────────────────────────────────────

    /**
     * What people are reacting to lately. Comments count double — writing
     * something is a stronger signal than tapping a heart.
     *
     * @return string[] product ids, best first
     */
    public static function trendingIds(int $limit = 12, int $days = 30): array
    {
        $since = now()->subDays($days);
        $union = DB::table('product_ratings')->select('product_id', DB::raw('1 as weight'), 'created_at')->where('created_at', '>=', $since)
            ->unionAll(DB::table('product_likes')->select('product_id', DB::raw('1 as weight'), 'created_at')->where('created_at', '>=', $since))
            ->unionAll(DB::table('product_comments')->select('product_id', DB::raw('2 as weight'), 'created_at')->whereNull('hidden_at')->where('created_at', '>=', $since));

        return DB::query()->fromSub($union, 't')
            ->select('product_id', DB::raw('SUM(weight) as score'))
            ->groupBy('product_id')
            ->orderByDesc('score')
            ->limit($limit)
            ->pluck('product_id')->all();
    }

    // ─── Housekeeping ──────────────────────────────────────────────────────

    /** Counters, straight from the rows. Cheap, and it can never drift. */
    private static function recount(string $productId): void
    {
        $r = DB::table('product_ratings')->where('product_id', $productId)
            ->selectRaw('count(*) as n, coalesce(sum(stars), 0) as s')->first();

        DB::table('products')->where('id', $productId)->update([
            'rating_count'   => (int) $r->n,
            'rating_sum'     => (int) $r->s,
            'likes_count'    => DB::table('product_likes')->where('product_id', $productId)->count(),
            'comments_count' => DB::table('product_comments')->where('product_id', $productId)->whereNull('hidden_at')->count(),
        ]);
    }
}
