<?php

namespace App\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Bless Hive — the ways a member earns: try-ons, challenges, and the statement
 * that adds it all up.
 *
 * Everything here mints Bees (100 = $1), so each payout has exactly one door
 * and a record that can't be re-created:
 *   try-on     → `hive_tryon_rewards`, keyed by the purchased line item. Deleting
 *                the look and posting again finds the row and pays nothing.
 *   challenge  → staff choose winners ONCE; `awarded_at` makes it final.
 */
class HiveRewards
{
    public const TRY_ON_BEES = 50;
    public const FITS = ['small', 'true', 'large'];
    /** Ledger reasons that count as "earned in the Hive". */
    public const REASONS = [
        'hive_try_on'          => 'Try-on review',
        'hive_answer_accepted' => 'Accepted answer',
        'hive_challenge_win'   => 'Challenge prize',
    ];

    // ─── Try-ons ───────────────────────────────────────────────────────────

    /** Things this customer bought (paid, not refunded) and hasn't shown yet. */
    public static function eligibleLines(string $customerId, int $limit = 30): array
    {
        $done = DB::table('hive_looks')->where('customer_id', $customerId)->whereNotNull('line_item_id')->pluck('line_item_id');

        return DB::table('order_line_items as li')
            ->join('orders as o', 'o.id', '=', 'li.order_id')
            ->where('o.customer_id', $customerId)->where('o.payment_status', 'paid')
            ->whereNotIn('li.id', $done)
            ->orderByDesc('o.created_at')->limit($limit)
            ->get(['li.id', 'li.product_id', 'li.title', 'li.variant_title', 'li.thumbnail', 'o.order_number'])
            ->map(fn ($l) => [
                'line_item_id' => $l->id, 'product_id' => $l->product_id, 'title' => $l->title,
                'variant' => $l->variant_title, 'thumbnail' => $l->thumbnail, 'order_number' => $l->order_number,
                // Already paid out once (the look was deleted since) — still worth posting, just not paid twice.
                'earns' => DB::table('hive_tryon_rewards')->where('line_item_id', $l->id)->exists() ? 0 : self::TRY_ON_BEES,
            ])->all();
    }

    /** The line, if it is really theirs, paid for, and not already shown. */
    public static function claimableLine(string $customerId, string $lineItemId): ?object
    {
        $line = DB::table('order_line_items as li')->join('orders as o', 'o.id', '=', 'li.order_id')
            ->where('li.id', $lineItemId)->where('o.customer_id', $customerId)->where('o.payment_status', 'paid')
            ->first(['li.id', 'li.product_id', 'li.variant_title']);
        if (! $line) return null;

        return DB::table('hive_looks')->where('line_item_id', $lineItemId)->exists() ? null : $line;
    }

    /** Pay for a try-on. Safe to call twice: the second call pays nothing. */
    public static function payTryOn(string $customerId, string $lineItemId, string $productId, string $lookId): int
    {
        if (! Bees::settings()['enabled']) return 0;

        $new = DB::table('hive_tryon_rewards')->insertOrIgnore([
            'line_item_id' => $lineItemId, 'customer_id' => $customerId, 'product_id' => $productId,
            'bees' => self::TRY_ON_BEES, 'created_at' => now(),
        ]);
        if (! $new) return 0;

        Bees::credit($customerId, self::TRY_ON_BEES, 'hive_try_on', $lookId);

        return self::TRY_ON_BEES;
    }

    /**
     * "How it fits" for a product page: the verdict in numbers, then the people.
     * A signed-in viewer sees the people built most like them first.
     */
    public static function forProduct(string $productId, ?object $viewer, int $limit = 12): array
    {
        $base = fn () => DB::table('hive_looks as l')->join('hive_profiles as p', 'p.customer_id', '=', 'l.customer_id')
            ->where('l.product_id', $productId)->where('l.status', 'published')->whereNull('p.suspended_at');

        $counts = $base()->whereNotNull('l.fit')->groupBy('l.fit')->selectRaw('l.fit, COUNT(*) as n')->pluck('n', 'fit');
        $total = (int) $counts->sum();

        $rows = $base()->orderByDesc('l.created_at')->limit(60)->get(['l.*', 'p.handle', 'p.display_name', 'p.avatar_url', 'p.fit_visibility',
            'p.bust_cm', 'p.waist_cm', 'p.hips_cm', 'p.height_cm', 'p.body_shape', 'p.customer_id as pid']);

        $items = $rows->map(function ($l) use ($viewer) {
            $match = $viewer && $viewer->customer_id !== $l->customer_id && $l->fit_visibility !== 'private' && $viewer->fit_visibility !== 'private'
                ? Hive::matchPercent($viewer, $l) : null;

            return Hive::presentLook($l, $viewer) + ['twin_match' => $match];
        })->sortByDesc(fn ($l) => $l['twin_match'] ?? -1)->take($limit)->values()->all();

        return [
            'total'   => $total,
            'summary' => $total ? [
                'small' => (int) round(($counts['small'] ?? 0) / $total * 100),
                'true'  => (int) round(($counts['true'] ?? 0) / $total * 100),
                'large' => (int) round(($counts['large'] ?? 0) / $total * 100),
            ] : null,
            'rating'  => ($avg = $base()->whereNotNull('l.rating')->avg('l.rating')) ? round((float) $avg, 1) : null,
            'tryons'  => $items,
            'reward'  => self::TRY_ON_BEES,
        ];
    }

    // ─── Challenges ────────────────────────────────────────────────────────

    public static function challengeState(object $c): string
    {
        if (! $c->is_published) return 'draft';
        if ($c->awarded_at) return 'awarded';
        if (now()->lt(Carbon::parse($c->starts_at))) return 'upcoming';

        return now()->lte(Carbon::parse($c->ends_at)) ? 'live' : 'judging';
    }

    public static function presentChallenge(object $c): array
    {
        return [
            'id' => $c->id, 'slug' => $c->slug, 'tag' => '#' . Str::studly($c->slug), 'title' => $c->title,
            'description' => $c->description, 'cover_url' => $c->cover_url,
            'prize_bees' => (int) $c->prize_bees, 'winners' => (int) $c->winners, 'entries' => (int) $c->entries_count,
            'starts_at' => Carbon::parse($c->starts_at, config('app.timezone'))->toIso8601String(),
            'ends_at'   => Carbon::parse($c->ends_at, config('app.timezone'))->toIso8601String(),
            'state' => self::challengeState($c),
            'is_published' => (bool) $c->is_published,
        ];
    }

    /** Challenges open for entries right now, soonest deadline first. */
    public static function liveChallenges(): array
    {
        return DB::table('hive_challenges')->where('is_published', true)->whereNull('awarded_at')
            ->where('starts_at', '<=', now())->where('ends_at', '>=', now())
            ->orderBy('ends_at')->limit(6)->get()->map(fn ($c) => self::presentChallenge($c))->all();
    }

    public static function liveChallenge(?string $id): ?object
    {
        if (! $id) return null;
        $c = DB::table('hive_challenges')->where('id', $id)->first();

        return $c && self::challengeState($c) === 'live' ? $c : null;
    }

    /**
     * Pay the winners. One shot: `awarded_at` is claimed inside the transaction
     * before anything is credited, so a double click can't pay twice.
     *
     * @return array<int,string>|string  look ids paid, or an error
     */
    public static function award(string $challengeId, array $lookIds): array|string
    {
        $paid = DB::transaction(function () use ($challengeId, $lookIds) {
            $c = DB::table('hive_challenges')->where('id', $challengeId)->lockForUpdate()->first();
            if (! $c) return 'Challenge not found.';
            if ($c->awarded_at) return 'Prizes for this challenge have already been awarded.';
            if (now()->lte(Carbon::parse($c->ends_at))) return 'This challenge is still open — award it after it ends.';

            $looks = DB::table('hive_looks')->whereIn('id', $lookIds)->where('challenge_id', $challengeId)->where('status', 'published')->get(['id', 'customer_id']);
            if ($looks->isEmpty()) return 'Choose at least one entry.';
            if ($looks->count() > $c->winners) return "This challenge has {$c->winners} prizes.";
            // One prize per person, however many looks they entered.
            if ($looks->pluck('customer_id')->unique()->count() !== $looks->count()) return 'Each winner can take one prize.';

            DB::table('hive_challenges')->where('id', $challengeId)->update(['awarded_at' => now(), 'updated_at' => now()]);
            DB::table('hive_looks')->whereIn('id', $looks->pluck('id'))->update(['won_at' => now()]);

            return ['challenge' => $c, 'looks' => $looks];
        });
        if (is_string($paid)) return $paid;

        foreach ($paid['looks'] as $look) {
            if ($paid['challenge']->prize_bees > 0) Bees::credit($look->customer_id, (int) $paid['challenge']->prize_bees, 'hive_challenge_win', $challengeId);
            $handle = DB::table('hive_profiles')->where('customer_id', $look->customer_id)->value('handle');
            try {
                Notifications::forCustomer($look->customer_id, 'hive_accepted', "You won {$paid['challenge']->title}!",
                    $paid['challenge']->prize_bees > 0 ? "{$paid['challenge']->prize_bees} Bees have been added to your balance." : null, "/@{$handle}?look={$look->id}");
            } catch (\Throwable) { /* the prize matters more than the message */ }
        }

        return $paid['looks']->pluck('id')->all();
    }

    // ─── What I've earned ──────────────────────────────────────────────────

    public static function statement(string $customerId): array
    {
        $rows = DB::table('blits_ledger')->where('customer_id', $customerId)->whereIn('reason', array_keys(self::REASONS));
        $settings = Bees::settings();

        $byReason = (clone $rows)->groupBy('reason')->selectRaw('reason, SUM(delta) as bees, COUNT(*) as n')->get()
            ->map(fn ($r) => ['reason' => $r->reason, 'label' => self::REASONS[$r->reason], 'bees' => (int) $r->bees, 'count' => (int) $r->n])->all();
        $total = array_sum(array_column($byReason, 'bees'));

        return [
            'total_bees'  => $total,
            // Formatted here, never on the client — the app's rule for anything money-like.
            'worth_label' => '$' . number_format($total / max(1, $settings['per_usd']), 2),
            'balance'     => (int) DB::table('customers')->where('id', $customerId)->value('loyalty_points'),
            'by_reason'   => $byReason,
            'recent'      => (clone $rows)->orderByDesc('created_at')->limit(15)->get()->map(fn ($r) => [
                'label' => self::REASONS[$r->reason], 'bees' => (int) $r->delta,
                'at' => Carbon::parse($r->created_at, config('app.timezone'))->toIso8601String(),
            ])->all(),
            'rates' => ['try_on' => self::TRY_ON_BEES, 'accepted_answer' => HiveTalk::ACCEPTED_ANSWER_BEES],
        ];
    }
}
