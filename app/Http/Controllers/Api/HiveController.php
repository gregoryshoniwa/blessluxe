<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Affiliate;
use App\Services\Hive;
use App\Services\HiveRewards;
use App\Services\HiveTalk;
use App\Services\Media;
use App\Services\MessageRefs;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Bless Hive over HTTP. Reading is open to everyone (a page has to be shareable
 * into WhatsApp and readable without an account); anything that changes
 * something needs a signed-in, 18+ member.
 */
class HiveController extends Controller
{
    // ─── Reading (public) ──────────────────────────────────────────────────

    /** GET /api/store/hive/feed?scope=everyone|following&before=ID */
    public function feed(Request $request)
    {
        $me = $this->me();
        $scope = $request->query('scope') === 'following' ? 'following' : 'everyone';

        return Hive::looks($scope, $me, null, $request->query('before'), Hive::LOOKS_PER_PAGE, $request->query('occasion')) + [
            'scope' => $scope,
            'me'    => $me ? Hive::present($me, $me) : null,
        ];
    }

    /** GET /api/store/hive/pages/{handle}?before=ID */
    public function page(Request $request, string $handle)
    {
        $page = Hive::byHandle($handle);
        if (! $page) return response()->json(['error' => "We couldn't find that page."], 404);

        $me = $this->me();
        $following = $me && DB::table('hive_follows')->where('follower_id', $me->customer_id)->where('followed_id', $page->customer_id)->exists();

        // A page whose owner is an active affiliate also has a shop to visit.
        $aff = Affiliate::where('customer_id', $page->customer_id)->where('status', 'active')->first(['code']);

        return [
            'page' => Hive::present($page, $me, (bool) $following) + ['shop_code' => $aff?->code],
        ] + Hive::looks('page', $me, $page->customer_id, $request->query('before'));
    }

    /** GET /api/store/hive/looks/{id} — one look, for a shared link or a notification. */
    public function look(string $id)
    {
        $look = Hive::look($id, $this->me());

        return $look ? ['look' => $look] : response()->json(['error' => 'That look is no longer here.'], 404);
    }

    /** GET /api/store/hive/discover?q= — people search, or suggestions when empty. */
    public function discover(Request $request)
    {
        $me = $this->me();
        $q = trim((string) $request->query('q'));

        return [
            'people'    => $q !== '' ? Hive::searchPeople($q, $me) : Hive::suggested($me),
            'searching' => $q !== '',
            'occasions' => Hive::OCCASIONS,
        ];
    }

    // ─── My page ───────────────────────────────────────────────────────────

    /** GET /api/account/hive/me */
    public function mine()
    {
        $me = $this->mustBeMember(requireAdult: false);

        return ['me' => Hive::present($me, $me), 'options' => ['shapes' => Hive::SHAPES, 'occasions' => Hive::OCCASIONS]];
    }

    /** PUT /api/account/hive/me — page details, fit, and the 18+ confirmation. */
    public function update(Request $request)
    {
        $me = $this->mustBeMember(requireAdult: false);

        $data = $request->validate([
            'handle'         => ['sometimes', 'string', 'max:40'],
            'display_name'   => ['sometimes', 'string', 'min:2', 'max:60'],
            'bio'            => ['sometimes', 'nullable', 'string', 'max:200'],
            'city'           => ['sometimes', 'nullable', 'string', 'max:60'],
            'avatar'         => ['sometimes', 'image', 'mimes:jpg,jpeg,png,webp', 'max:4096'],
            'confirm_adult'  => ['sometimes', 'accepted'],
            'height_cm'      => ['sometimes', 'nullable', 'integer', 'between:120,230'],
            'bust_cm'        => ['sometimes', 'nullable', 'integer', 'between:55,200'],
            'waist_cm'       => ['sometimes', 'nullable', 'integer', 'between:45,200'],
            'hips_cm'        => ['sometimes', 'nullable', 'integer', 'between:55,220'],
            'body_shape'     => ['sometimes', 'nullable', Rule::in(Hive::SHAPES)],
            'size_top'       => ['sometimes', 'nullable', 'string', 'max:12'],
            'size_bottom'    => ['sometimes', 'nullable', 'string', 'max:12'],
            'size_dress'     => ['sometimes', 'nullable', 'string', 'max:12'],
            'size_shoe'      => ['sometimes', 'nullable', 'string', 'max:12'],
            'fit_visibility' => ['sometimes', Rule::in(['private', 'twins', 'public'])],
        ]);

        $patch = [];
        if (array_key_exists('handle', $data)) {
            $handle = Hive::normaliseHandle($data['handle']);
            if ($problem = Hive::handleProblem($handle, $me->customer_id)) {
                return response()->json(['errors' => ['handle' => [$problem]]], 422);
            }
            $patch['handle'] = $handle;
        }
        foreach (['display_name', 'bio', 'city', 'size_top', 'size_bottom', 'size_dress', 'size_shoe'] as $k) {
            if (array_key_exists($k, $data)) $patch[$k] = ($v = trim(strip_tags((string) $data[$k]))) === '' ? null : $v;
        }
        foreach (['height_cm', 'bust_cm', 'waist_cm', 'hips_cm', 'body_shape', 'fit_visibility'] as $k) {
            if (array_key_exists($k, $data)) $patch[$k] = $data[$k];
        }
        if (isset($patch['display_name']) && $patch['display_name'] === null) unset($patch['display_name']);
        if (! empty($data['confirm_adult']) && ! $me->adult_confirmed_at) $patch['adult_confirmed_at'] = now();

        if ($request->hasFile('avatar')) {
            $patch['avatar_url'] = Media::upload($request->file('avatar'), 'hive/avatars');
            if (Media::isUnder($me->avatar_url, 'hive/avatars')) Media::delete($me->avatar_url);
        }

        if ($patch) DB::table('hive_profiles')->where('customer_id', $me->customer_id)->update($patch + ['updated_at' => now()]);

        $me = DB::table('hive_profiles')->where('customer_id', $me->customer_id)->first();

        return ['me' => Hive::present($me, $me)];
    }

    /** GET /api/account/hive/handle-available?handle= */
    public function handleAvailable(Request $request)
    {
        $me = $this->mustBeMember(requireAdult: false);
        $handle = Hive::normaliseHandle($request->query('handle'));
        $problem = Hive::handleProblem($handle, $me->customer_id);

        return ['handle' => $handle, 'available' => $problem === null, 'problem' => $problem];
    }

    /** GET /api/account/hive/twins */
    public function twins()
    {
        $me = $this->mustBeMember(requireAdult: false);

        return [
            'twins'  => Hive::twins($me),
            // Tell the page WHY it is empty, so it can say what to do about it.
            'ready'  => $me->fit_visibility !== 'private' && collect([$me->bust_cm, $me->waist_cm, $me->hips_cm])->filter()->count() >= 2,
            'sharing' => $me->fit_visibility,
        ];
    }

    // ─── Looks ─────────────────────────────────────────────────────────────

    /** POST /api/account/hive/looks  (multipart: images[], caption, occasion, refs) */
    public function storeLook(Request $request)
    {
        $me = $this->mustBeMember();

        $data = $request->validate([
            'images'   => ['required', 'array', 'min:1', 'max:' . Hive::MAX_IMAGES],
            'images.*' => ['image', 'mimes:jpg,jpeg,png,webp', 'max:6144'],
            'caption'  => ['nullable', 'string', 'max:500'],
            'occasion' => ['nullable', Rule::in(Hive::OCCASIONS)],
            'refs'     => ['nullable'],
            'challenge_id' => ['nullable', 'string', 'max:64'],
            // Try-on: a look about something they bought.
            'line_item_id' => ['nullable', 'string', 'max:64'],
            'fit'          => ['nullable', 'required_with:line_item_id', Rule::in(HiveRewards::FITS)],
            'size_worn'    => ['nullable', 'string', 'max:24'],
            'rating'       => ['nullable', 'integer', 'between:1,5'],
        ], ['images.required' => 'Add at least one photo.', 'fit.required_with' => 'Tell people how it fits.']);

        $line = null;
        if (! empty($data['line_item_id'])) {
            $line = HiveRewards::claimableLine($me->customer_id, $data['line_item_id']);
            if (! $line) return response()->json(['errors' => ['line_item_id' => ["We couldn't match that to one of your orders, or you've already posted it."]]], 422);
        }
        // Entering a challenge that has closed just posts a normal look.
        $challenge = HiveRewards::liveChallenge($data['challenge_id'] ?? null);

        $raw = $request->input('refs');
        if (is_string($raw)) $raw = json_decode($raw, true);
        // Titles, prices and thumbnails are re-read from the catalogue — a post
        // can't invent what a product is called or costs.
        $raw = is_array($raw) ? $raw : [];
        // A try-on always shows what was bought, first.
        if ($line) array_unshift($raw, ['type' => 'product', 'id' => $line->product_id]);
        $refs = MessageRefs::resolve($raw, Affiliate::where('customer_id', $me->customer_id)->first(), false);

        $urls = array_map(fn ($f) => Media::upload($f, "hive/looks/{$me->customer_id}"), $request->file('images'));

        $id = 'look_' . Str::ulid();
        DB::transaction(function () use ($id, $me, $data, $urls, $refs, $line, $challenge) {
            DB::table('hive_looks')->insert([
                'id' => $id, 'customer_id' => $me->customer_id,
                'caption' => ($c = trim(strip_tags((string) ($data['caption'] ?? '')))) === '' ? null : $c,
                'images' => json_encode($urls), 'refs' => $refs ? json_encode($refs) : null,
                'occasion' => $data['occasion'] ?? null, 'status' => 'published',
                'challenge_id' => $challenge?->id,
                'product_id' => $line?->product_id, 'line_item_id' => $line?->id,
                'fit' => $line ? $data['fit'] : null,
                'size_worn' => $line ? (trim(strip_tags((string) ($data['size_worn'] ?? ''))) ?: $line->variant_title) : null,
                'rating' => $line ? ($data['rating'] ?? null) : null,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('hive_profiles')->where('customer_id', $me->customer_id)->increment('looks_count');
            if ($challenge) DB::table('hive_challenges')->where('id', $challenge->id)->increment('entries_count');
        });

        $earned = $line ? HiveRewards::payTryOn($me->customer_id, $line->id, $line->product_id, $id) : 0;

        $look = DB::table('hive_looks as l')->join('hive_profiles as p', 'p.customer_id', '=', 'l.customer_id')
            ->where('l.id', $id)->first(['l.*', 'p.handle', 'p.display_name', 'p.avatar_url']);

        return ['look' => Hive::presentLook($look, $me), 'earned' => $earned];
    }

    // ─── Try-ons, challenges, earnings ─────────────────────────────────────

    /** GET /api/account/hive/tryons/eligible — what I've bought and not shown yet. */
    public function eligibleTryOns()
    {
        $me = $this->mustBeMember(requireAdult: false);

        return ['lines' => HiveRewards::eligibleLines($me->customer_id), 'reward' => HiveRewards::TRY_ON_BEES, 'fits' => HiveRewards::FITS];
    }

    /** GET /api/store/hive/products/{productId}/tryons — "how it fits" for a product page. */
    public function productTryOns(string $productId)
    {
        $id = DB::table('products')->where('id', $productId)->orWhere('handle', $productId)->value('id');
        if (! $id) return response()->json(['error' => 'Product not found.'], 404);

        return HiveRewards::forProduct($id, $this->me());
    }

    /** GET /api/store/hive/challenges — what's open now. */
    public function challenges()
    {
        return ['challenges' => HiveRewards::liveChallenges()];
    }

    /** GET /api/store/hive/challenges/{slug}?before= — one challenge and its entries. */
    public function challenge(Request $request, string $slug)
    {
        $c = DB::table('hive_challenges')->where('slug', $slug)->where('is_published', true)->first();
        if (! $c) return response()->json(['error' => "We couldn't find that challenge."], 404);

        return ['challenge' => HiveRewards::presentChallenge($c)]
            + Hive::looks('everyone', $this->me(), null, $request->query('before'), Hive::LOOKS_PER_PAGE, null, $c->id);
    }

    /** GET /api/account/hive/earnings */
    public function earnings()
    {
        $me = $this->mustBeMember(requireAdult: false);
        $aff = Affiliate::where('customer_id', $me->customer_id)->where('status', 'active')->first(['code']);

        return HiveRewards::statement($me->customer_id) + ['shop_code' => $aff?->code];
    }

    /** GET /api/account/hive/mentions — the product picker for tagging a look. */
    public function mentions(Request $request)
    {
        $me = $this->mustBeMember(requireAdult: false);

        return MessageRefs::search(
            Affiliate::where('customer_id', $me->customer_id)->first(), false,
            (string) $request->query('tab', 'all'),
            $request->query('q'),
            (int) $request->query('page', 1),
        );
    }

    /** DELETE /api/account/hive/looks/{id} — the owner takes their look down. */
    public function destroyLook(string $id)
    {
        $me = $this->mustBeMember(requireAdult: false);
        $look = DB::table('hive_looks')->where('id', $id)->where('customer_id', $me->customer_id)->first();
        if (! $look) return response()->json(['error' => 'Look not found.'], 404);

        Hive::setLookStatus($id, 'removed');
        foreach (json_decode((string) $look->images, true) ?: [] as $url) {
            if (Media::isUnder($url, "hive/looks/{$me->customer_id}")) Media::delete($url);
        }
        DB::table('hive_looks')->where('id', $id)->delete();
        if ($look->challenge_id && $look->status === 'published') {
            DB::table('hive_challenges')->where('id', $look->challenge_id)->where('entries_count', '>', 0)->decrement('entries_count');
        }

        return ['ok' => true];
    }

    public function like(string $id)   { return $this->toggleLike($id, true); }
    public function unlike(string $id) { return $this->toggleLike($id, false); }

    private function toggleLike(string $id, bool $on)
    {
        $me = $this->mustBeMember();
        if (! DB::table('hive_looks')->where('id', $id)->where('status', 'published')->exists()) {
            return response()->json(['error' => 'Look not found.'], 404);
        }
        if (! $on) { Hive::unlike($id, $me->customer_id); return ['liked' => false]; }

        if (Hive::like($id, $me->customer_id)) {
            $look = DB::table('hive_looks as l')->join('hive_profiles as p', 'p.customer_id', '=', 'l.customer_id')->where('l.id', $id)->first(['l.customer_id', 'p.handle']);
            HiveTalk::notify($look->customer_id, $me, 'hive_like', "{$me->display_name} hearted your look", null, "/@{$look->handle}?look={$id}");
        }

        return ['liked' => true];
    }

    // ─── Follow / report ───────────────────────────────────────────────────

    public function follow(string $handle)   { return $this->toggleFollow($handle, true); }
    public function unfollow(string $handle) { return $this->toggleFollow($handle, false); }

    private function toggleFollow(string $handle, bool $on)
    {
        $me = $this->mustBeMember();
        $page = Hive::byHandle($handle);
        if (! $page) return response()->json(['error' => "We couldn't find that page."], 404);
        if ($page->customer_id === $me->customer_id) return response()->json(['error' => "That's your own page."], 422);

        if ($on) {
            if (Hive::follow($me->customer_id, $page->customer_id)) {
                HiveTalk::notify($page->customer_id, $me, 'hive_follow', "{$me->display_name} started following you", null, "/@{$me->handle}");
            }
        } else {
            Hive::unfollow($me->customer_id, $page->customer_id);
        }

        return ['following' => $on, 'followers' => (int) DB::table('hive_profiles')->where('customer_id', $page->customer_id)->value('followers_count')];
    }

    /** POST /api/account/hive/reports  { type: look|page, id, reason, note? } */
    public function report(Request $request)
    {
        $me = $this->mustBeMember(requireAdult: false);
        $data = $request->validate([
            'type'   => ['required', Rule::in(['look', 'page', 'comment', 'ask', 'answer'])],
            'id'     => ['required', 'string', 'max:64'],
            'reason' => ['required', Rule::in(Hive::REPORT_REASONS)],
            'note'   => ['nullable', 'string', 'max:300'],
        ]);

        $subjectId = match (true) {
            $data['type'] === 'page'        => Hive::byHandle($data['id'])?->customer_id,
            HiveTalk::isTalk($data['type']) => HiveTalk::exists($data['type'], $data['id']) ? $data['id'] : null,
            default                         => DB::table('hive_looks')->where('id', $data['id'])->value('id'),
        };
        if (! $subjectId) return response()->json(['error' => 'Nothing to report there.'], 404);
        // Reporting yourself would be a free way to test the thresholds.
        $owner = HiveTalk::isTalk($data['type']) ? HiveTalk::ownerOf($data['type'], $subjectId) : ($data['type'] === 'page' ? $subjectId : DB::table('hive_looks')->where('id', $subjectId)->value('customer_id'));
        if ($owner === $me->customer_id) return response()->json(['error' => "That's yours — you can simply remove it."], 422);

        Hive::report($me->customer_id, $data['type'], $subjectId, $data['reason'], $data['note'] ?? null);

        return ['ok' => true];
    }

    // ─── Internals ─────────────────────────────────────────────────────────

    /** The viewer's own profile, or null when browsing signed out. */
    private function me(): ?object
    {
        $c = Auth::guard('customer')->user();

        return $c ? Hive::profile($c) : null;
    }

    private function mustBeMember(bool $requireAdult = true): object
    {
        $me = $this->me();
        if (! $me) abort(response()->json(['error' => 'Sign in to join Bless Hive.'], 401));
        if ($me->suspended_at) abort(response()->json(['error' => 'Your page has been suspended.'], 403));
        if ($requireAdult && ! $me->adult_confirmed_at) {
            abort(response()->json(['error' => 'Please confirm you are 18 or older to post, like and follow.', 'needs' => 'adult_confirmation'], 403));
        }

        return $me;
    }
}
