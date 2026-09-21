<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Hive;
use App\Services\HiveEmbeds;
use App\Services\HiveLive;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** Live sessions (by link) and gifts. Watching is open; hosting, reminding and gifting need an 18+ member. */
class HiveLiveController extends Controller
{
    /** GET /api/store/hive/lives */
    public function index()
    {
        return HiveLive::listing($this->me());
    }

    /** GET /api/store/hive/lives/{id} */
    public function show(string $id)
    {
        $me = $this->me();
        $live = HiveLive::find($id, $me);
        if (! $live) return response()->json(['error' => "That live isn't here any more."], 404);

        return ['live' => $live, 'gifts' => HiveLive::recentGifts($id)] + $this->wallet($me);
    }

    /** GET /api/store/hive/lives/{id}/gifts — polled by the room while it's live. */
    public function gifts(string $id)
    {
        $live = HiveLive::find($id, $this->me());
        if (! $live) return response()->json(['error' => 'Not found.'], 404);

        return ['gifts' => HiveLive::recentGifts($id), 'state' => $live['state'], 'gifts_bees' => $live['gifts_bees']];
    }

    /** GET /api/account/hive/gifts — the menu, my balance, and what I can still send today. */
    public function menu()
    {
        return $this->wallet($this->member(requireAdult: false));
    }

    /** POST /api/account/hive/lives { title, url, starts_at, description?, shape? } */
    public function store(Request $request)
    {
        $me = $this->member();
        $data = $request->validate([
            'title'       => ['required', 'string', 'min:4', 'max:100'],
            'description' => ['nullable', 'string', 'max:400'],
            'url'         => ['required', 'string', 'max:500'],
            'starts_at'   => ['required', 'date', 'after:' . now()->subMinutes(10)->toIso8601String(), 'before:' . now()->addDays(60)->toIso8601String()],
            'shape'       => ['nullable', Rule::in(Hive::SHAPES_OF_FRAME)],
        ], ['starts_at.after' => 'Pick a time in the future.', 'starts_at.before' => 'Lives can be scheduled up to 60 days ahead.']);

        $embed = HiveEmbeds::parse($data['url']);
        if (! $embed) return response()->json(['errors' => ['url' => ['Paste the link to your live on YouTube, TikTok, Facebook or Instagram.']]], 422);
        if (HiveLive::upcomingCount($me->customer_id) >= HiveLive::MAX_UPCOMING_PER_HOST) {
            return response()->json(['errors' => ['starts_at' => ['You can have ' . HiveLive::MAX_UPCOMING_PER_HOST . ' lives scheduled at a time.']]], 422);
        }

        $id = 'live_' . Str::ulid();
        DB::table('hive_lives')->insert([
            'id' => $id, 'customer_id' => $me->customer_id,
            'title' => trim(strip_tags($data['title'])),
            'description' => ($d = trim(strip_tags((string) ($data['description'] ?? '')))) === '' ? null : $d,
            'embed_provider' => $embed['provider'], 'embed_ref' => $embed['ref'], 'shape' => $data['shape'] ?? null,
            'cover_url' => HiveEmbeds::cover($embed['provider'], $embed['ref'], "hive/lives/{$me->customer_id}"),
            'starts_at' => Carbon::parse($data['starts_at']), 'status' => 'scheduled', 'created_at' => now(), 'updated_at' => now(),
        ]);

        return ['live' => HiveLive::find($id, $me)];
    }

    public function start(string $id)  { return $this->hostAction($id, 'start', "It's too early or too late to start this one."); }
    public function end(string $id)    { return $this->hostAction($id, 'end', "That live isn't running."); }
    public function cancel(string $id) { return $this->hostAction($id, 'cancel', "A live that has started can't be cancelled — end it instead."); }

    private function hostAction(string $id, string $what, string $failed)
    {
        $me = $this->member();
        if (! HiveLive::{$what}($id, $me)) return response()->json(['error' => $failed], 422);

        return ['live' => HiveLive::find($id, $me) ?? ['id' => $id, 'state' => 'cancelled']];
    }

    public function remind(string $id)   { return $this->setReminder($id, true); }
    public function unremind(string $id) { return $this->setReminder($id, false); }

    private function setReminder(string $id, bool $on)
    {
        $me = $this->member();
        if (! HiveLive::find($id, $me)) return response()->json(['error' => 'Not found.'], 404);
        HiveLive::remind($id, $me->customer_id, $on);

        return ['live' => HiveLive::find($id, $me)];
    }

    /** POST /api/account/hive/gifts { context: look|live, id, gift, key } */
    public function give(Request $request)
    {
        $me = $this->member();
        $data = $request->validate([
            'context' => ['required', Rule::in(['look', 'live'])],
            'id'      => ['required', 'string', 'max:64'],
            'gift'    => ['required', 'string', 'max:40'],
            'key'     => ['required', 'string', 'min:8', 'max:64'],
        ]);

        $result = HiveLive::give($me, $data['context'], $data['id'], $data['gift'], $data['key']);
        if (is_string($result)) return response()->json(['error' => $result], 422);

        return ['gift' => $result] + $this->wallet($me);
    }

    private function wallet(?object $me): array
    {
        return [
            'gift_types' => HiveLive::giftTypes(),
            'balance'    => $me ? (int) DB::table('customers')->where('id', $me->customer_id)->value('loyalty_points') : null,
            'left_today' => $me ? max(0, HiveLive::DAILY_SEND_CAP - HiveLive::sentToday($me->customer_id)) : null,
        ];
    }

    private function me(): ?object
    {
        $c = Auth::guard('customer')->user();

        return $c ? Hive::profile($c) : null;
    }

    private function member(bool $requireAdult = true): object
    {
        $me = $this->me();
        if (! $me) abort(response()->json(['error' => 'Sign in to join Bless Hive.'], 401));
        if ($me->suspended_at) abort(response()->json(['error' => 'Your page has been suspended.'], 403));
        if ($requireAdult && ! $me->adult_confirmed_at) {
            abort(response()->json(['error' => 'Please confirm you are 18 or older to take part.', 'needs' => 'adult_confirmation'], 403));
        }

        return $me;
    }
}
