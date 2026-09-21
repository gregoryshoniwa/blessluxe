<?php

namespace App\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Bless Hive — live sessions (by link) and gifts.
 *
 * GIFTS ARE A CLOSED LOOP. Bees can't be bought anywhere in this app and can't
 * be cashed out: they are earned, and spent at the BLESSLUXE checkout. A gift
 * moves Bees one member already earned to another member, who can only spend
 * them in the shop. That is the structure the plan's legal research said sits
 * outside stored-value rules — and it stops being true the day Bees can be
 * bought or withdrawn. If either is ever added, gifts need a lawyer first.
 *
 * Limits exist so a stolen or farmed account can't be drained in one go:
 *   - the gift must be one of the listed types (no free amounts)
 *   - a sender gives at most DAILY_SEND_CAP Bees a day
 *   - you can't gift yourself, a suspended page, or without the 18+ confirmation
 *   - every send carries an idempotency key, so a retried tap never pays twice
 */
class HiveLive
{
    public const DAILY_SEND_CAP = 1000;
    /** What the receiver gets of each gift, in percent. 100 = nothing is kept back. */
    public const CREATOR_SHARE_PERCENT = 100;
    public const MAX_UPCOMING_PER_HOST = 3;
    /** A session the host forgot to end stops counting as live after this. */
    public const LIVE_TIMEOUT_HOURS = 4;
    /** Hosts can start this early, and until this late; after that it shows as missed. */
    public const START_WINDOW_MINUTES = 120;

    private const DEFAULT_GIFTS = [
        ['rose', 'Rose', 10, '🌹'], ['sparkle', 'Sparkle', 25, '✨'], ['bouquet', 'Bouquet', 50, '💐'],
        ['crown', 'Crown', 100, '👑'], ['diamond', 'Diamond', 250, '💎'],
    ];

    // ─── Gifts ─────────────────────────────────────────────────────────────

    /** The gift menu. Seeds itself the first time, so there is always something to send. */
    public static function giftTypes(): array
    {
        if (! DB::table('blits_gift_types')->exists()) {
            foreach (self::DEFAULT_GIFTS as [$code, $label, $bees, $emoji]) {
                DB::table('blits_gift_types')->insertOrIgnore(['id' => 'gift_' . $code, 'code' => $code, 'label' => $label, 'blits_amount' => $bees,
                    'is_active' => true, 'metadata' => json_encode(['emoji' => $emoji]), 'created_at' => now(), 'updated_at' => now()]);
            }
        }

        return DB::table('blits_gift_types')->where('is_active', true)->where('blits_amount', '>', 0)->orderBy('blits_amount')->get()
            ->map(fn ($g) => ['code' => $g->code, 'label' => $g->label, 'bees' => (int) $g->blits_amount, 'emoji' => json_decode((string) $g->metadata, true)['emoji'] ?? '🎁'])->all();
    }

    public static function sentToday(string $customerId): int
    {
        return (int) DB::table('blits_gift_events')->where('from_customer_id', $customerId)->where('created_at', '>=', now()->startOfDay())->sum('blits_amount');
    }

    /**
     * Send a gift on a look or in a live.
     *
     * @return array{bees:int,balance:int,label:string,emoji:string}|string  the gift, or a message for the sender
     */
    public static function give(object $from, string $contextType, string $contextId, string $giftCode, string $key): array|string
    {
        self::giftTypes();      // make sure the menu exists — a send can arrive before anyone has listed it
        $gift = DB::table('blits_gift_types')->where('code', $giftCode)->where('is_active', true)->first();
        if (! $gift || $gift->blits_amount <= 0) return "That gift isn't available.";

        $target = $contextType === 'live'
            ? DB::table('hive_lives')->where('id', $contextId)->where('status', 'scheduled')->first(['id', 'customer_id', 'title'])
            : DB::table('hive_looks')->where('id', $contextId)->where('status', 'published')->first(['id', 'customer_id']);
        if (! $target) return "That's no longer here.";
        if ($target->customer_id === $from->customer_id) return "You can't send a gift to yourself.";

        $to = DB::table('hive_profiles')->where('customer_id', $target->customer_id)->whereNull('suspended_at')->first();
        if (! $to) return "That page can't receive gifts.";
        if (! Bees::settings()['enabled']) return 'Bees are switched off at the moment.';

        $bees = (int) $gift->blits_amount;
        $idem = 'gift:' . $from->customer_id . ':' . Str::limit($key, 64, '');

        try {
            $result = DB::transaction(function () use ($from, $to, $gift, $bees, $idem, $contextType, $contextId) {
                // A retried tap (slow network, double press): already done — say so, pay nothing more.
                if (DB::table('blits_checkout_idempotency')->where('idempotency_key', $idem)->exists()) return 'duplicate';
                if (self::sentToday($from->customer_id) + $bees > self::DAILY_SEND_CAP) return 'cap';

                $debit = Bees::debit($from->customer_id, $bees, 'hive_gift_sent', $idem, $contextId);
                $received = (int) floor($bees * self::CREATOR_SHARE_PERCENT / 100);
                Bees::credit($to->customer_id, $received, 'hive_gift_received', $contextId);

                DB::table('blits_gift_events')->insert([
                    'id' => 'gft_' . Str::ulid(), 'from_customer_id' => $from->customer_id, 'to_customer_id' => $to->customer_id,
                    'gift_type_id' => $gift->id, 'context_type' => $contextType, 'context_id' => $contextId,
                    'blits_amount' => $bees, 'created_at' => now(),
                ]);
                if ($contextType === 'live') DB::table('hive_lives')->where('id', $contextId)->increment('gifts_bees', $bees);

                return ['balance' => (int) $debit['balance_after'], 'received' => $received];
            });
        } catch (\RuntimeException $e) {
            return str_contains($e->getMessage(), 'Insufficient') ? "You don't have enough Bees for that yet." : "That gift didn't go through. Try again.";
        }

        $emoji = json_decode((string) $gift->metadata, true)['emoji'] ?? '🎁';
        if ($result === 'cap') return 'You can send up to ' . self::DAILY_SEND_CAP . ' Bees in gifts a day. More tomorrow.';
        if ($result === 'duplicate') {
            return ['bees' => $bees, 'balance' => (int) DB::table('customers')->where('id', $from->customer_id)->value('loyalty_points'), 'label' => $gift->label, 'emoji' => $emoji];
        }

        $url = $contextType === 'live' ? "/hive/live/{$contextId}" : "/@{$to->handle}?look={$contextId}";
        HiveTalk::notify($to->customer_id, $from, 'hive_gift', "{$from->display_name} sent you a {$gift->label} {$emoji}", "+{$result['received']} Bees to spend in the shop", $url);

        return ['bees' => $bees, 'balance' => $result['balance'], 'label' => $gift->label, 'emoji' => $emoji];
    }

    /** The last few gifts in a live — names and gifts, for the room to see. */
    public static function recentGifts(string $liveId, int $limit = 12): array
    {
        return DB::table('blits_gift_events as e')
            ->join('hive_profiles as p', 'p.customer_id', '=', 'e.from_customer_id')
            ->leftJoin('blits_gift_types as g', 'g.id', '=', 'e.gift_type_id')
            ->where('e.context_type', 'live')->where('e.context_id', $liveId)
            ->orderByDesc('e.created_at')->orderByDesc('e.id')->limit($limit)
            ->get(['e.id', 'e.blits_amount', 'p.handle', 'p.display_name', 'g.label', 'g.metadata'])
            ->map(fn ($e) => ['id' => $e->id, 'from' => $e->display_name, 'handle' => $e->handle, 'label' => $e->label ?? 'Gift',
                'emoji' => json_decode((string) ($e->metadata ?? ''), true)['emoji'] ?? '🎁', 'bees' => (int) $e->blits_amount])->all();
    }

    // ─── Lives ─────────────────────────────────────────────────────────────

    /** upcoming · live · ended · missed · cancelled — always worked out, never stored. */
    public static function state(object $l): string
    {
        if ($l->status !== 'scheduled') return 'cancelled';
        if ($l->ended_at) return 'ended';
        if ($l->went_live_at) {
            return now()->lt(Carbon::parse($l->went_live_at)->addHours(self::LIVE_TIMEOUT_HOURS)) ? 'live' : 'ended';
        }

        return now()->lte(Carbon::parse($l->starts_at)->addMinutes(self::START_WINDOW_MINUTES)) ? 'upcoming' : 'missed';
    }

    public static function present(object $l, ?object $viewer, bool $reminded = false): array
    {
        $mine = $viewer && $viewer->customer_id === $l->customer_id;
        $state = self::state($l);
        $iso = fn ($t) => $t ? Carbon::parse($t, config('app.timezone'))->toIso8601String() : null;

        return [
            'id' => $l->id, 'title' => $l->title, 'description' => $l->description, 'cover_url' => $l->cover_url,
            'state' => $state, 'starts_at' => $iso($l->starts_at), 'went_live_at' => $iso($l->went_live_at), 'ended_at' => $iso($l->ended_at),
            'embed' => HiveEmbeds::present($l->embed_provider, $l->embed_ref, $l->shape),
            'host' => ['handle' => $l->handle ?? null, 'display_name' => $l->display_name ?? null, 'avatar_url' => $l->avatar_url ?? null, 'seller' => HiveSellers::isSeller($l->customer_id)],
            'reminders' => (int) $l->reminders_count, 'reminded' => $reminded, 'is_mine' => $mine,
            // The host sees what the session raised; the room sees the gifts as they arrive, not a total.
            'gifts_bees' => $mine ? (int) $l->gifts_bees : null,
            'can_start' => $mine && $state === 'upcoming' && now()->gte(Carbon::parse($l->starts_at)->subMinutes(self::START_WINDOW_MINUTES)),
            'can_end' => $mine && $state === 'live',
            'can_cancel' => $mine && $state === 'upcoming',
        ];
    }

    private static function base()
    {
        return DB::table('hive_lives as l')->join('hive_profiles as p', 'p.customer_id', '=', 'l.customer_id')
            ->where('l.status', 'scheduled')->whereNull('p.suspended_at')
            ->select(['l.*', 'p.handle', 'p.display_name', 'p.avatar_url']);
    }

    /** Live now first, then what's coming, then the last few that can be watched again. */
    public static function listing(?object $viewer): array
    {
        $liveSince = now()->subHours(self::LIVE_TIMEOUT_HOURS);
        $live = self::base()->whereNotNull('l.went_live_at')->whereNull('l.ended_at')->where('l.went_live_at', '>', $liveSince)->orderByDesc('l.went_live_at')->limit(12)->get();
        $upcoming = self::base()->whereNull('l.went_live_at')->where('l.starts_at', '>=', now()->subMinutes(self::START_WINDOW_MINUTES))->orderBy('l.starts_at')->limit(24)->get();
        $past = self::base()->whereNotNull('l.went_live_at')
            ->where(fn ($w) => $w->whereNotNull('l.ended_at')->orWhere('l.went_live_at', '<=', $liveSince))
            ->where('l.went_live_at', '>=', now()->subDays(14))->orderByDesc('l.went_live_at')->limit(12)->get();

        $all = $live->concat($upcoming)->concat($past);
        $mine = $viewer && $all->isNotEmpty()
            ? DB::table('hive_live_reminders')->where('customer_id', $viewer->customer_id)->whereIn('live_id', $all->pluck('id'))->pluck('live_id')->flip() : collect();
        $shape = fn ($rows) => $rows->map(fn ($l) => self::present($l, $viewer, isset($mine[$l->id])))->values()->all();

        return ['live' => $shape($live), 'upcoming' => $shape($upcoming), 'past' => $shape($past)];
    }

    public static function find(string $id, ?object $viewer): ?array
    {
        $l = self::base()->where('l.id', $id)->first();
        if (! $l) return null;
        $reminded = $viewer && DB::table('hive_live_reminders')->where('live_id', $id)->where('customer_id', $viewer->customer_id)->exists();

        return self::present($l, $viewer, (bool) $reminded);
    }

    /** The host is on: tell everyone who asked. One notification each, written in one insert. */
    public static function start(string $id, object $host): bool
    {
        $changed = DB::table('hive_lives')->where('id', $id)->where('customer_id', $host->customer_id)->where('status', 'scheduled')
            ->whereNull('went_live_at')->whereNull('ended_at')
            ->where('starts_at', '<=', now()->addMinutes(self::START_WINDOW_MINUTES))
            ->where('starts_at', '>=', now()->subMinutes(self::START_WINDOW_MINUTES))
            ->update(['went_live_at' => now(), 'updated_at' => now()]);
        if (! $changed) return false;

        $title = DB::table('hive_lives')->where('id', $id)->value('title');
        $rows = DB::table('hive_live_reminders')->where('live_id', $id)->where('customer_id', '!=', $host->customer_id)->limit(2000)->pluck('customer_id')
            ->map(fn ($cid) => [
                'id' => 'ntf_' . Str::random(20), 'recipient_type' => Notifications::TYPE_CUSTOMER, 'recipient_id' => $cid, 'kind' => 'hive_live',
                'title' => "{$host->display_name} is live now", 'body' => Str::limit((string) $title, 90), 'action_url' => "/hive/live/{$id}",
                'metadata' => json_encode(['actor' => $host->handle, 'avatar_url' => $host->avatar_url]), 'read_at' => null, 'created_at' => now(),
            ])->all();
        foreach (array_chunk($rows, 500) as $chunk) DB::table('notifications')->insert($chunk);

        return true;
    }

    public static function end(string $id, object $host): bool
    {
        return (bool) DB::table('hive_lives')->where('id', $id)->where('customer_id', $host->customer_id)
            ->whereNotNull('went_live_at')->whereNull('ended_at')->update(['ended_at' => now(), 'updated_at' => now()]);
    }

    public static function cancel(string $id, object $host): bool
    {
        return (bool) DB::table('hive_lives')->where('id', $id)->where('customer_id', $host->customer_id)
            ->whereNull('went_live_at')->where('status', 'scheduled')->update(['status' => 'cancelled', 'updated_at' => now()]);
    }

    public static function upcomingCount(string $customerId): int
    {
        return DB::table('hive_lives')->where('customer_id', $customerId)->where('status', 'scheduled')->whereNull('went_live_at')
            ->where('starts_at', '>=', now()->subMinutes(self::START_WINDOW_MINUTES))->count();
    }

    public static function remind(string $id, string $customerId, bool $on): bool
    {
        return DB::transaction(function () use ($id, $customerId, $on) {
            if ($on) {
                $new = DB::table('hive_live_reminders')->insertOrIgnore(['live_id' => $id, 'customer_id' => $customerId, 'created_at' => now()]);
                if ($new) DB::table('hive_lives')->where('id', $id)->increment('reminders_count');
            } else {
                $gone = DB::table('hive_live_reminders')->where('live_id', $id)->where('customer_id', $customerId)->delete();
                if ($gone) DB::table('hive_lives')->where('id', $id)->where('reminders_count', '>', 0)->decrement('reminders_count');
            }

            return $on;
        });
    }
}
