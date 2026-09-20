<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Affiliate;
use App\Services\Hive;
use App\Services\HiveEmbeds;
use App\Services\HiveRewards;
use App\Services\HiveSellers;
use App\Services\HiveTalk;
use App\Services\Media;
use App\Services\MessageRefs;
use App\Services\RemoteImage;
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

        $before = $request->query('before');
        // "For you" is ranked; once its window is used up the cursor becomes a
        // plain look id and the feed carries on by date. Following is by date.
        $feed = $scope === 'everyone' && (! $before || str_starts_with((string) $before, 'r.'))
            ? Hive::ranked($me, $before, $request->query('occasion'))
            : Hive::looks($scope, $me, null, $before, Hive::LOOKS_PER_PAGE, $request->query('occasion'));

        return $feed + [
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

        // A page whose owner is an approved affiliate is a SELLER's page: a shop, and a reputation.
        $aff = HiveSellers::forCustomer($page->customer_id);

        return [
            'page' => Hive::present($page, $me, (bool) $following) + [
                'shop_code'  => $aff?->code,
                'reputation' => $aff ? HiveSellers::reputation($aff) : null,
            ],
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

        return ['me' => Hive::present($me, $me), 'options' => [
            'shapes' => Hive::SHAPES, 'occasions' => Hive::OCCASIONS,
            'video' => ['max_seconds' => Hive::VIDEO_MAX_SECONDS, 'max_bytes' => self::uploadCeiling()],
        ]];
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
            // A look is photos (uploaded and/or copied from links), OR one clip, OR one post from another platform.
            'images'       => ['required_without_all:image_urls,embed_url', 'array', 'max:' . Hive::MAX_IMAGES],
            'image_urls'   => ['nullable', 'array', 'max:' . Hive::MAX_IMAGES],
            'image_urls.*' => ['string', 'max:2000', 'starts_with:https://'],
            'embed_url'    => ['nullable', 'string', 'max:500'],
            'shape'        => ['nullable', Rule::in(Hive::SHAPES_OF_FRAME)],
            'images.*' => ['image', 'mimes:jpg,jpeg,png,webp', 'max:6144'],
            'caption'  => ['nullable', 'string', 'max:500'],
            'occasion' => ['nullable', Rule::in(Hive::OCCASIONS)],
            'refs'     => ['nullable'],
            // A short clip. Its poster travels as images[0], so a video look has exactly one image.
            'video'         => ['nullable', 'file', 'mimetypes:video/mp4,video/webm,video/quicktime', 'max:' . (int) (Hive::VIDEO_MAX_BYTES / 1024)],
            'video_seconds' => ['nullable', 'required_with:video', 'numeric', 'between:1,' . (Hive::VIDEO_MAX_SECONDS + 1)],
            'challenge_id' => ['nullable', 'string', 'max:64'],
            // Try-on: a look about something they bought.
            'line_item_id' => ['nullable', 'string', 'max:64'],
            'fit'          => ['nullable', 'required_with:line_item_id', Rule::in(HiveRewards::FITS)],
            'size_worn'    => ['nullable', 'string', 'max:24'],
            'rating'       => ['nullable', 'integer', 'between:1,5'],
        ], [
            'images.required_without_all' => 'Add a photo, a video or a link.', 'fit.required_with' => 'Tell people how it fits.',
            'video.max' => 'That clip is too large — keep it under ' . (int) (Hive::VIDEO_MAX_BYTES / 1048576) . ' MB.',
            'video.mimetypes' => 'Videos need to be MP4, MOV or WebM.',
            'video_seconds.between' => 'Clips can be up to ' . Hive::VIDEO_MAX_SECONDS . ' seconds.',
        ]);
        $files = $request->file('images') ?? [];
        $links = array_values(array_unique($data['image_urls'] ?? []));
        if ($request->hasFile('video') && (count($files) !== 1 || $links)) {
            return response()->json(['errors' => ['images' => ['A video look has one cover image.']]], 422);
        }
        if (count($files) + count($links) > Hive::MAX_IMAGES) {
            return response()->json(['errors' => ['images' => ['A look can have up to ' . Hive::MAX_IMAGES . ' photos.']]], 422);
        }

        $embed = null;
        if (! empty($data['embed_url'])) {
            $embed = HiveEmbeds::parse($data['embed_url']);
            if (! $embed) return response()->json(['errors' => ['embed_url' => ["We can show posts from YouTube, TikTok, Instagram and Facebook. Check the link and try again."]]], 422);
            if ($request->hasFile('video') || $files || $links) return response()->json(['errors' => ['embed_url' => ['Share the link on its own — or upload, but not both.']]], 422);
            // "Ordered vs got" has to be the buyer's own picture, not somebody's reel.
            if (! empty($data['line_item_id'])) return response()->json(['errors' => ['embed_url' => ['A try-on needs your own photo or video.']]], 422);
        }

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

        $dir = "hive/looks/{$me->customer_id}";
        $urls = array_map(fn ($f) => Media::upload($f, $dir), $files);
        try {
            foreach ($links as $link) $urls[] = RemoteImage::import($link, $dir);
        } catch (\RuntimeException $e) {
            foreach ($urls as $u) Media::delete($u);              // don't keep half a look
            return response()->json(['errors' => ['image_urls' => [$e->getMessage()]]], 422);
        }
        if ($embed && ($cover = HiveEmbeds::cover($embed['provider'], $embed['ref'], $dir))) $urls[] = $cover;
        $video = $request->file('video');
        $videoUrl = $video ? Media::upload($video, "hive/looks/{$me->customer_id}") : null;

        $id = 'look_' . Str::ulid();
        DB::transaction(function () use ($id, $me, $data, $urls, $refs, $line, $challenge, $video, $videoUrl, $embed) {
            DB::table('hive_looks')->insert([
                'id' => $id, 'customer_id' => $me->customer_id,
                'caption' => ($c = trim(strip_tags((string) ($data['caption'] ?? '')))) === '' ? null : $c,
                'images' => json_encode($urls), 'refs' => $refs ? json_encode($refs) : null,
                'embed_provider' => $embed['provider'] ?? null, 'embed_ref' => $embed['ref'] ?? null,
                'shape' => ($embed || $video) ? ($data['shape'] ?? null) : null,
                'video_url' => $videoUrl, 'video_bytes' => $video?->getSize(),
                'video_seconds' => $video ? (int) round((float) $data['video_seconds']) : null,
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

    // ─── Sellers ───────────────────────────────────────────────────────────

    /** GET /api/store/hive/pages/{handle}/shop — the seller's line, and what their buyers posted. */
    public function shop(string $handle)
    {
        $page = Hive::byHandle($handle);
        $seller = $page ? HiveSellers::forCustomer($page->customer_id) : null;
        if (! $seller) return response()->json(['error' => "This page doesn't have a shop."], 404);

        return HiveSellers::products($seller) + [
            'code' => $seller->code, 'title' => $seller->storefront_title, 'intro' => $seller->storefront_intro,
            'reputation' => HiveSellers::reputation($seller),
            'buyer_tryons' => HiveSellers::buyerTryOns($seller, $this->me()),
        ];
    }

    /**
     * POST /api/store/hive/shop-via { look_id | answer_id | handle }
     *
     * Someone tapped a product under a seller's look (or answer, or on their
     * page). Put them in that seller's shop — the SAME session attribution a
     * shop link sets, so pricing, the cart and commission follow the affiliate
     * process untouched. The server works out whose it is; the browser can't
     * name a seller. `hive_look_id` rides along so the seller can see which of
     * their looks sell.
     */
    public function shopVia(Request $request)
    {
        $data = $request->validate(['look_id' => ['nullable', 'string', 'max:64'], 'answer_id' => ['nullable', 'string', 'max:64'], 'handle' => ['nullable', 'string', 'max:40']]);

        $lookId = null;
        $ownerId = match (true) {
            ! empty($data['look_id'])   => DB::table('hive_looks')->where('id', $data['look_id'])->where('status', 'published')->value('customer_id'),
            ! empty($data['answer_id']) => DB::table('hive_answers')->where('id', $data['answer_id'])->where('status', 'published')->value('customer_id'),
            ! empty($data['handle'])    => Hive::byHandle($data['handle'])?->customer_id,
            default                     => null,
        };
        if ($ownerId && ! empty($data['look_id'])) $lookId = $data['look_id'];

        $seller = $ownerId ? HiveSellers::forCustomer($ownerId) : null;
        // Not a seller's: nothing changes — an ordinary member's tag is just a link.
        if (! $seller) return ['seller' => null];

        $request->session()->put('affiliate_code', $seller->code);
        $lookId ? $request->session()->put('hive_look_id', $lookId) : $request->session()->forget('hive_look_id');

        return ['seller' => ['code' => $seller->code]];
    }

    /** GET /api/store/hive/sellers — trusted sellers, for Discover. */
    public function sellers()
    {
        return ['sellers' => HiveSellers::directory($this->me())];
    }

    /** GET /api/account/hive/closet — everything I've bought. */
    public function closet()
    {
        $me = $this->mustBeMember(requireAdult: false);

        return ['items' => HiveSellers::closet($me->customer_id), 'reward' => HiveRewards::TRY_ON_BEES];
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
        $seller = HiveSellers::forCustomer($me->customer_id);

        return HiveRewards::statement($me->customer_id) + ['shop_code' => $seller?->code, 'seller' => $seller ? HiveSellers::dashboard($seller) : null];
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

    /**
     * POST /api/account/hive/links/inspect { url } — what would this link become?
     * Recognised platforms answer at once. Anything else is treated as a picture
     * and only vetted here (is it a public https address?); the copy itself is
     * made when the look is posted, so abandoned drafts leave no files behind.
     */
    public function inspectLink(Request $request)
    {
        $this->mustBeMember(requireAdult: false);
        $url = trim((string) $request->validate(['url' => ['required', 'string', 'max:2000']])['url']);

        if ($embed = HiveEmbeds::parse($url)) {
            return ['kind' => 'embed', 'embed' => HiveEmbeds::present($embed['provider'], $embed['ref']), 'shapes' => Hive::SHAPES_OF_FRAME];
        }
        // A platform's PAGE isn't a picture, and copying it would just fail later with a vaguer message.
        if (preg_match('~^https://([\w-]+\.)*(youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|fb\.watch)/~i', $url)) {
            return response()->json(['error' => "We couldn't read that link. Open the post, tap Share → Copy link, and paste that."], 422);
        }
        try {
            RemoteImage::vet($url);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        return ['kind' => 'image', 'url' => $url];
    }

    /** PUT /api/account/hive/looks/{id}/shape { shape } — fix how my video or linked post is framed. */
    public function reshape(Request $request, string $id)
    {
        $me = $this->mustBeMember(requireAdult: false);
        $shape = $request->validate(['shape' => ['required', Rule::in(Hive::SHAPES_OF_FRAME)]])['shape'];

        $changed = DB::table('hive_looks')->where('id', $id)->where('customer_id', $me->customer_id)
            ->where(fn ($q) => $q->whereNotNull('embed_provider')->orWhereNotNull('video_url'))
            ->update(['shape' => $shape, 'updated_at' => now()]);
        if (! $changed && ! DB::table('hive_looks')->where('id', $id)->where('customer_id', $me->customer_id)->where('shape', $shape)->exists()) {
            return response()->json(['error' => 'Look not found.'], 404);
        }

        return ['look' => Hive::look($id, $me)];
    }

    /** DELETE /api/account/hive/looks/{id} — the owner takes their look down. */
    public function destroyLook(string $id)
    {
        $me = $this->mustBeMember(requireAdult: false);
        $look = DB::table('hive_looks')->where('id', $id)->where('customer_id', $me->customer_id)->first();
        if (! $look) return response()->json(['error' => 'Look not found.'], 404);

        Hive::setLookStatus($id, 'removed');
        foreach (array_filter([...(json_decode((string) $look->images, true) ?: []), $look->video_url]) as $url) {
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

    /**
     * The largest clip this server will really accept: ours, or PHP's own upload
     * limits if those are lower (hosting decides them, not the app). The phone
     * compresses to fit whatever this says, so a small limit means a lower
     * bitrate rather than a failed upload.
     */
    private static function uploadCeiling(): int
    {
        $bytes = function (string $v): int {
            $n = (float) $v;
            return (int) match (strtolower(substr(trim($v), -1))) { 'g' => $n * 1073741824, 'm' => $n * 1048576, 'k' => $n * 1024, default => $n };
        };
        $limits = array_filter([$bytes((string) ini_get('upload_max_filesize')), (int) ($bytes((string) ini_get('post_max_size')) * 0.9)]);

        return (int) min(Hive::VIDEO_MAX_BYTES, ...($limits ?: [Hive::VIDEO_MAX_BYTES]));
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
