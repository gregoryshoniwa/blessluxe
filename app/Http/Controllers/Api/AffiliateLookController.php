<?php

namespace App\Http\Controllers\Api;

use App\Services\Media;
use App\Http\Controllers\Controller;
use App\Models\Affiliate;
use App\Services\AffiliateLook;
use App\Services\AI\GeminiService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * An affiliate designing their own shop: accent colour, top-bar messages, and
 * hero slides made three ways — upload, a YouTube link, or the AI wizard.
 *
 * All input is normalised by AffiliateLook before it is stored; this class is
 * the HTTP surface and the ownership check.
 */
class AffiliateLookController extends Controller
{
    public function __construct(private GeminiService $gemini)
    {
        GeminiService::$usageContext = [
            'surface'     => 'affiliate_hero',
            'customer_id' => Auth::guard('customer')->id(),
        ];
    }

    /** GET /api/account/affiliate/look — everything the editor needs in one go. */
    public function show()
    {
        $me = $this->mustBeActive();

        return $this->payload($me);
    }

    /**
     * PUT /api/account/affiliate/look
     * { hero_mode?, top_bar_mode?, top_bar_messages?: string[], theme_color?: string|null }
     */
    public function update(Request $request)
    {
        $me = $this->mustBeActive();

        $data = $request->validate([
            'hero_mode'          => ['sometimes', Rule::in(['default', 'custom'])],
            'top_bar_mode'       => ['sometimes', Rule::in(['default', 'custom'])],
            'top_bar_messages'   => ['sometimes', 'array', 'max:' . (AffiliateLook::MAX_MESSAGES * 2)],
            'top_bar_messages.*' => ['nullable', 'string', 'max:200'],
            'theme_color'        => ['sometimes', 'nullable', 'string', 'max:32'],
        ]);

        $patch = [];
        $adjusted = false;

        if (array_key_exists('hero_mode', $data))    $patch['hero_mode'] = $data['hero_mode'];
        if (array_key_exists('top_bar_mode', $data)) $patch['top_bar_mode'] = $data['top_bar_mode'];

        if (array_key_exists('top_bar_messages', $data)) {
            $patch['top_bar_messages'] = json_encode(AffiliateLook::cleanMessages($data['top_bar_messages']));
        }

        if (array_key_exists('theme_color', $data)) {
            if ($data['theme_color'] === null || trim($data['theme_color']) === '') {
                $patch['theme_color'] = null;                       // back to the house gold
            } else {
                $hex = AffiliateLook::parseColor($data['theme_color']);
                if (! $hex) {
                    return response()->json([
                        'error' => "That doesn't look like a colour. Try a hex code like #C2338B, or RGB like 194, 51, 139.",
                    ], 422);
                }
                $usable = AffiliateLook::usable($hex);
                $patch['theme_color'] = $usable['hex'];
                $adjusted = $usable['adjusted'];
            }
        }

        if ($patch) {
            DB::table('affiliates')->where('id', $me->id)->update($patch + ['updated_at' => now()]);
        }

        return $this->payload($me->fresh()) + [
            // Tell them, rather than quietly saving something other than what
            // they picked.
            'notice' => $adjusted
                ? 'We deepened that colour slightly so the white text on your buttons stays readable.'
                : null,
        ];
    }

    /**
     * POST /api/account/affiliate/look/slides
     *   upload : multipart  { image }
     *   youtube: { youtube_url }
     *   ai     : { generated_url }   (a render returned by generate(), below)
     * plus optional { heading, subheading, cta_label, cta_href, focus }
     */
    public function storeSlide(Request $request)
    {
        $me = $this->mustBeActive();

        if (DB::table('affiliate_hero_slides')->where('affiliate_id', $me->id)->count() >= AffiliateLook::MAX_SLIDES) {
            return response()->json(['error' => 'You can have up to ' . AffiliateLook::MAX_SLIDES . ' slides. Remove one to add another.'], 422);
        }

        $g = AffiliateLook::HERO_GUIDE;
        $data = $request->validate($this->textRules() + [
            'image' => [
                'nullable', 'file', 'mimes:jpg,jpeg,png,webp', 'max:' . ($g['max_mb'] * 1024),
                "dimensions:min_width={$g['min_width']},min_height={$g['min_height']}",
            ],
            'youtube_url'   => ['nullable', 'string', 'max:300'],
            'generated_url' => ['nullable', 'string', 'max:300'],
            'prompt'        => ['nullable', 'string', 'max:2000'],
        ], [
            'image.dimensions' => "That image is too small for a full-width banner. Use at least {$g['minimum']} — {$g['recommended']} is ideal.",
            'image.max'        => "That file is over {$g['max_mb']} MB. Export it as a JPG or WebP and try again.",
            'image.mimes'      => "Please use a {$g['formats']} image.",
        ]);

        if ($request->hasFile('image')) {
            $media = ['media_type' => 'image', 'media_url' => Media::upload($request->file('image'), 'uploads/affiliate-hero'), 'source' => 'upload'];
        } elseif (! empty($data['youtube_url'])) {
            $id = AffiliateLook::youtubeId($data['youtube_url']);
            if (! $id) {
                return response()->json(['error' => "We couldn't read that as a YouTube link. Paste the link from the video's Share button."], 422);
            }
            $media = ['media_type' => 'youtube', 'media_url' => $id, 'source' => 'youtube'];
        } elseif (! empty($data['generated_url'])) {
            // Only a file WE rendered for THIS affiliate. Their renders live in a
            // folder named after their id, so another affiliate's render — or any
            // other file, on any host — fails one of these two checks.
            $url = $data['generated_url'];
            if (! Media::isUnder($url, "ai/affiliate-hero/{$me->id}") || ! Media::exists($url)) {
                return response()->json(['error' => 'That image has expired. Please generate it again.'], 422);
            }
            $media = ['media_type' => 'image', 'media_url' => $url, 'source' => 'ai'];
        } else {
            return response()->json(['error' => 'Add an image, a YouTube link, or generate one with AI.'], 422);
        }

        $id = 'ahs_' . Str::random(16);
        DB::table('affiliate_hero_slides')->insert($media + $this->textFields($data) + [
            'id'           => $id,
            'affiliate_id' => $me->id,
            'prompt'       => $data['prompt'] ?? null,
            'position'     => (int) DB::table('affiliate_hero_slides')->where('affiliate_id', $me->id)->max('position') + 1,
            'is_active'    => true,
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);

        return $this->payload($me);
    }

    /** PUT /api/account/affiliate/look/slides/{id} — text, focus, on/off. */
    public function updateSlide(Request $request, string $id)
    {
        $me = $this->mustBeActive();
        $slide = $this->ownSlide($me, $id);

        $data = $request->validate($this->textRules() + ['is_active' => ['sometimes', 'boolean']]);

        $patch = $this->textFields($data, onlyPresent: true);
        if (array_key_exists('is_active', $data)) $patch['is_active'] = (bool) $data['is_active'];

        if ($patch) {
            DB::table('affiliate_hero_slides')->where('id', $slide->id)->update($patch + ['updated_at' => now()]);
        }

        return $this->payload($me);
    }

    /** PUT /api/account/affiliate/look/slides/order  { ids: [...] } */
    public function reorder(Request $request)
    {
        $me = $this->mustBeActive();
        $ids = (array) $request->validate(['ids' => ['required', 'array', 'max:20'], 'ids.*' => ['string']])['ids'];

        foreach (array_values($ids) as $i => $id) {
            // Scoped to the owner on every row: a foreign id simply matches nothing.
            DB::table('affiliate_hero_slides')->where('affiliate_id', $me->id)->where('id', $id)->update(['position' => $i + 1]);
        }

        return $this->payload($me);
    }

    /** DELETE /api/account/affiliate/look/slides/{id} */
    public function destroySlide(string $id)
    {
        $me = $this->mustBeActive();
        $slide = $this->ownSlide($me, $id);

        DB::table('affiliate_hero_slides')->where('id', $slide->id)->delete();
        if ($slide->media_type === 'image') $this->deleteFile($slide->media_url);

        return $this->payload($me);
    }

    /**
     * POST /api/account/affiliate/look/generate  { prompt, style?, product_id? }
     *
     * The AI wizard. Renders ONE wide banner and returns its URL for preview;
     * nothing is added to the shop until they choose to keep it (storeSlide with
     * `generated_url`). Capped per day because every render is a paid call.
     */
    public function generate(Request $request)
    {
        $me = $this->mustBeActive();

        $data = $request->validate([
            'prompt'     => ['required', 'string', 'min:8', 'max:600'],
            'style'      => ['nullable', 'string', 'max:60'],
            'product_id' => ['nullable', 'string', 'max:64'],
        ]);

        if (! $this->gemini->isConfigured()) {
            return response()->json(['error' => 'The AI designer is not switched on yet. You can upload an image or use a YouTube link instead.'], 503);
        }

        $key = "affiliate-hero-ai:{$me->id}:" . now()->toDateString();
        $used = (int) Cache::get($key, 0);
        if ($used >= AffiliateLook::AI_DAILY_LIMIT) {
            return response()->json(['error' => "You've used today's " . AffiliateLook::AI_DAILY_LIMIT . ' AI designs. They reset at midnight — you can still upload an image or use a YouTube link.'], 429);
        }

        // Optionally anchor the scene on one of the shop's real products, so the
        // banner shows something that can actually be bought here.
        $refs = [];
        if (! empty($data['product_id'])) {
            $thumb = DB::table('products')->where('id', $data['product_id'])->where('status', 'published')->value('thumbnail');
            if ($ref = $this->localImage($thumb)) $refs[] = $ref;
        }

        try {
            $result = $this->gemini->generateImage($this->heroPrompt($data['prompt'], $data['style'] ?? null, (bool) $refs), $refs, '16:9');
        } catch (\Throwable $e) {
            return response()->json(['error' => 'The AI designer had a problem. Please try again in a moment.'], 502);
        }
        // Counted once the call was made — a render that comes back empty was
        // still paid for.
        Cache::put($key, $used + 1, now()->endOfDay());

        if (! $result) {
            return response()->json(['error' => "The AI couldn't produce an image for that. Try describing the scene more simply."], 502);
        }

        $url = Media::putRender("ai/affiliate-hero/{$me->id}", $result);

        return [
            'generated_url' => $url,
            'prompt'        => $data['prompt'],
            'remaining'     => max(0, AffiliateLook::AI_DAILY_LIMIT - $used - 1),
        ];
    }

    // ─── Internals ─────────────────────────────────────────────────────────

    private function payload(Affiliate $me): array
    {
        $me = $me->fresh();
        $slides = DB::table('affiliate_hero_slides')->where('affiliate_id', $me->id)
            ->orderBy('position')->orderBy('created_at')->get()
            ->map(fn ($s) => AffiliateLook::slideShape($s))->all();

        $messages = is_string($me->top_bar_messages) ? json_decode($me->top_bar_messages, true) : $me->top_bar_messages;
        $used = (int) Cache::get("affiliate-hero-ai:{$me->id}:" . now()->toDateString(), 0);

        return [
            'look' => [
                'hero_mode'        => $me->hero_mode ?: 'default',
                'top_bar_mode'     => $me->top_bar_mode ?: 'default',
                'top_bar_messages' => array_values((array) $messages),
                'theme_color'      => $me->theme_color,
                'palette'          => AffiliateLook::palette($me->theme_color),
            ],
            'slides' => $slides,
            // Everything the editor explains or enforces comes from the server,
            // so the guidance on screen can never drift from the actual rules.
            'guide' => [
                'hero'           => AffiliateLook::HERO_GUIDE,
                'max_slides'     => AffiliateLook::MAX_SLIDES,
                'max_messages'   => AffiliateLook::MAX_MESSAGES,
                'message_length' => AffiliateLook::MESSAGE_LENGTH,
                'presets'        => AffiliateLook::PRESETS,
                'ai'             => [
                    'available'   => $this->gemini->isConfigured(),
                    'daily_limit' => AffiliateLook::AI_DAILY_LIMIT,
                    'remaining'   => max(0, AffiliateLook::AI_DAILY_LIMIT - $used),
                ],
            ],
        ];
    }

    private function textRules(): array
    {
        return [
            'heading'    => ['sometimes', 'nullable', 'string', 'max:80'],
            'subheading' => ['sometimes', 'nullable', 'string', 'max:160'],
            'cta_label'  => ['sometimes', 'nullable', 'string', 'max:40'],
            'cta_href'   => ['sometimes', 'nullable', 'string', 'max:255'],
            'focus'      => ['sometimes', Rule::in(['left', 'center', 'right'])],
        ];
    }

    private function textFields(array $data, bool $onlyPresent = false): array
    {
        $out = [];
        foreach (['heading', 'subheading', 'cta_label'] as $k) {
            if ($onlyPresent && ! array_key_exists($k, $data)) continue;
            $v = trim(strip_tags((string) ($data[$k] ?? '')));
            $out[$k] = $v === '' ? null : $v;
        }
        if (! $onlyPresent || array_key_exists('cta_href', $data)) {
            // Anything that isn't a path on this site is dropped, not stored.
            $out['cta_href'] = AffiliateLook::internalPath($data['cta_href'] ?? null);
        }
        if (array_key_exists('focus', $data)) $out['focus'] = $data['focus'];

        return $out;
    }

    private function heroPrompt(string $brief, ?string $style, bool $hasProduct): string
    {
        $p = 'Create a wide cinematic website hero banner photograph for a luxury fashion boutique. ';
        $p .= 'Scene: ' . trim($brief) . '. ';
        if ($style) $p .= 'Visual style: ' . trim($style) . '. ';
        if ($hasProduct) $p .= 'Feature the garment or accessory from the reference image, faithfully, worn or styled naturally. ';
        // The page lays a headline over the left and lower part of the image,
        // and phones crop the sides — so compose for both.
        $p .= 'Composition: keep the main subject in the centre third; leave calm, uncluttered space on the left for a headline. ';
        $p .= 'Absolutely no text, letters, logos, watermarks or borders in the image. Photorealistic, soft flattering light, editorial quality.';

        return $p;
    }

    /** A product thumbnail as a reference image — only files that are ours. */
    private function localImage(?string $url): ?array
    {
        return Media::asReference($url);
    }

    private function deleteFile(?string $url): void
    {
        // Only ever inside the two hero folders, whatever URL is on the row.
        if (Media::isUnder($url, 'uploads/affiliate-hero') || Media::isUnder($url, 'ai/affiliate-hero')) {
            Media::delete($url);
        }
    }

    private function ownSlide(Affiliate $me, string $id): object
    {
        $slide = DB::table('affiliate_hero_slides')->where('id', $id)->where('affiliate_id', $me->id)->first();
        if (! $slide) abort(response()->json(['error' => 'Slide not found.'], 404));

        return $slide;
    }

    private function mustBeActive(): Affiliate
    {
        $customer = Auth::guard('customer')->user();
        $a = $customer ? Affiliate::where('customer_id', $customer->id)->first() : null;
        if (! $a) abort(response()->json(['error' => 'You are not an affiliate.'], 404));
        if ($a->status !== 'active') {
            abort(response()->json(['error' => 'Your affiliate account is not active yet.'], 403));
        }

        return $a;
    }
}
