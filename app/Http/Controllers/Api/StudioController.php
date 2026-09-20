<?php

namespace App\Http\Controllers\Api;

use App\Services\Media;
use App\Http\Controllers\Controller;
use App\Models\CustomerProduct;
use App\Models\Logo;
use App\Models\StudioItem;
use App\Services\AI\GeminiService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Show Room → Studio. The proposal workshop for embroiderers/brand shops:
 *
 *   mockup — logo applied to a garment, clean catalogue render
 *   worn   — professional photography of men / women / a family wearing it
 *   angles — front + side + back presentation sheet ("3D views")
 *   advert — eye-catching campaign visual + AI-written ad script
 *
 * Any item can be animated with Omni Flash (pending → poll, like
 * Generations). Selected items export into a branded PDF proposal.
 */
class StudioController extends Controller
{
    public function __construct(private GeminiService $gemini)
    {
        GeminiService::$usageContext = [
            'surface'     => 'studio',
            'customer_id' => Auth::guard('customer')->id(),
        ];
    }

    /** GET /api/account/studio */
    public function index()
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return ['items' => null];

        return [
            'items' => StudioItem::where('customer_id', $customer->id)
                ->latest()
                ->get()
                ->map(fn ($i) => $this->shape($i)),
        ];
    }

    /**
     * POST /api/account/studio
     * { logo_id, kind, customer_product_id? | garment?, audience?, placement?,
     *   application?, prompt?, with_video? }
     */
    public function store(Request $request)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return response()->json(['error' => 'Sign in to use the studio.'], 401);

        $data = $request->validate([
            'logo_id'             => ['required', 'string'],
            'kind'                => ['required', Rule::in(['mockup', 'worn', 'angles', 'advert'])],
            'customer_product_id' => ['nullable', 'string'],
            'garment'             => ['nullable', 'string', 'max:120'],
            'audience'            => ['nullable', Rule::in(['men', 'women', 'family'])],
            'placement'           => ['nullable', 'string', 'max:60'],
            'application'         => ['nullable', Rule::in(['embroidered', 'printed'])],
            'prompt'              => ['nullable', 'string', 'max:1000'],
            'with_video'          => ['nullable', 'boolean'],
        ]);
        if (! $this->gemini->isConfigured()) {
            return response()->json(['error' => 'The studio is not configured yet.'], 503);
        }

        $logo = Logo::where('customer_id', $customer->id)->find($data['logo_id']);
        if (! $logo) return response()->json(['error' => 'Logo not found.'], 404);

        $product = null;
        if (! empty($data['customer_product_id'])) {
            $product = CustomerProduct::where('customer_id', $customer->id)->find($data['customer_product_id']);
            if (! $product) return response()->json(['error' => 'Product not found.'], 404);
        }
        if (! $product && empty($data['garment'])) {
            return response()->json(['error' => 'Pick one of your products or a garment type.'], 422);
        }

        // References: logo first, then the digitised product when present.
        $refs = array_values(array_filter([
            $this->refFromPublicUrl($logo->image_url),
            $product ? $this->refFromPublicUrl($product->image_url) : null,
        ]));
        if (! $refs) return response()->json(['error' => 'Logo image is missing — re-create it.'], 422);

        try {
            $result = $this->gemini->generateImage($this->renderPrompt($data, $product), $refs);
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 502);
        }
        if (! $result) {
            return response()->json(['error' => 'The model returned no image — try a simpler brief.'], 502);
        }

        // Advert kind also gets an AI-written script (non-fatal if it fails).
        $script = null;
        if ($data['kind'] === 'advert') {
            try {
                $script = $this->gemini->generateText(
                    'You are a senior advertising copywriter. Write a tight, production-ready ad script for a short branded-wear commercial: '
                    . 'a hook line, 3-4 numbered scenes with visual directions and voice-over lines, and a closing call to action. '
                    . 'Keep it under 180 words, no preamble.',
                    'The advert shows: ' . $this->describeSubject($data, $product)
                    . ($data['prompt'] ? " Extra direction: {$data['prompt']}." : ''),
                    ['temperature' => 0.8],
                );
            } catch (\Throwable) {
                // Script is a bonus — the visual is the deliverable.
            }
        }

        $item = StudioItem::create([
            'id'                  => 'stu_' . Str::random(16),
            'customer_id'         => $customer->id,
            'logo_id'             => $logo->id,
            'customer_product_id' => $product?->id,
            'kind'                => $data['kind'],
            'garment'             => $product ? null : $data['garment'],
            'audience'            => $data['audience'] ?? null,
            'placement'           => $data['placement'] ?? null,
            'application'         => $data['application'] ?? null,
            'prompt'              => $data['prompt'] ?? null,
            'script'              => $script,
            'image_url'           => $this->saveFile(base64_decode($result['base64']), $result['mime']),
            'status'              => $request->boolean('with_video') ? 'pending' : 'ready',
            'meta'                => ['label' => $this->describeSubject($data, $product)],
        ]);

        if ($request->boolean('with_video')) {
            try {
                $interaction = $this->gemini->startVideoInteraction(
                    ['base64' => $result['base64'], 'mime' => $result['mime']],
                    $this->animatePrompt($data, $product),
                );
                $this->applyInteraction($item, $interaction);
            } catch (\Throwable $e) {
                $item->update(['status' => 'failed', 'meta' => array_merge($item->meta ?? [], ['error' => $e->getMessage()])]);
            }
        }

        return ['item' => $this->shape($item->fresh())];
    }

    /** GET /api/account/studio/{id} — pending videos poll Omni and finalise. */
    public function show(string $id)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return response()->json(['error' => 'Sign in first.'], 401);

        $item = StudioItem::where('customer_id', $customer->id)->findOrFail($id);
        if ($item->status === 'pending' && ! empty($item->meta['interaction_id'])) {
            try {
                $this->applyInteraction($item, $this->gemini->getInteraction($item->meta['interaction_id']));
            } catch (\Throwable) {
                // Transient — client retries.
            }
        }
        return ['item' => $this->shape($item->fresh())];
    }

    /** DELETE /api/account/studio/{id} */
    public function destroy(string $id)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return response()->json(['error' => 'Sign in first.'], 401);

        $item = StudioItem::where('customer_id', $customer->id)->findOrFail($id);
        foreach ([$item->image_url, $item->video_url] as $url) {
            Media::delete($url);
        }
        $item->delete();
        return ['ok' => true];
    }

    /**
     * POST /api/account/studio/proposal
     * { item_ids: [..], title?, client_name?, notes? } → branded PDF.
     */
    public function proposal(Request $request)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return response()->json(['error' => 'Sign in first.'], 401);

        $data = $request->validate([
            'item_ids'    => ['required', 'array', 'min:1', 'max:20'],
            'item_ids.*'  => ['string'],
            'title'       => ['nullable', 'string', 'max:160'],
            'client_name' => ['nullable', 'string', 'max:160'],
            'notes'       => ['nullable', 'string', 'max:2000'],
        ]);

        $items = StudioItem::where('customer_id', $customer->id)
            ->whereIn('id', $data['item_ids'])
            ->get()
            ->sortBy(fn ($i) => array_search($i->id, $data['item_ids']))
            ->values();
        if ($items->isEmpty()) {
            return response()->json(['error' => 'No studio items selected.'], 422);
        }

        $pdf = Pdf::loadView('pdf.studio-proposal', [
            'title'      => $data['title'] ?? 'Corporate Wear Proposal',
            'clientName' => $data['client_name'] ?? null,
            'notes'      => $data['notes'] ?? null,
            'preparedBy' => trim(($customer->first_name ?? '') . ' ' . ($customer->last_name ?? '')) ?: $customer->email,
            'date'       => now()->format('j F Y'),
            'items'      => $items,
        ])->setPaper('a4');

        // Rendered in memory and sent to the media disk — nothing is written
        // next to the code, where a deploy would erase it.
        return ['url' => Media::put('ai/studio/proposals', 'pdf', $pdf->output())];
    }

    // ─── Prompts ────────────────────────────────────────────────────────

    private function describeSubject(array $data, ?CustomerProduct $product): string
    {
        $garment = $product
            ? trim(($product->category ? $product->category . ' — ' : '') . ($product->name ?? 'product'))
            : ($data['garment'] ?? 'garment');
        $s = "the customer's logo (first reference image) "
            . ($data['application'] ?? 'embroidered') . ' on '
            . ($data['placement'] ? "the {$data['placement']} of " : '')
            . $garment;
        if (! empty($data['audience'])) {
            $s .= ' worn by ' . match ($data['audience']) {
                'men'    => 'a professional male model',
                'women'  => 'a professional female model',
                'family' => 'a happy family — parents with two kids — all in matching branded wear',
            };
        }
        return $s;
    }

    private function renderPrompt(array $data, ?CustomerProduct $product): string
    {
        $subject = $this->describeSubject($data, $product);
        $faithful = 'Reproduce the logo exactly as designed — its shapes, colours and text must match the first reference image faithfully. '
            . ($product ? 'Stay faithful to the product shown in the second reference image. ' : '');
        $applied = ($data['application'] ?? 'embroidered') === 'embroidered'
            ? 'The logo application must look like real embroidery: visible stitch texture, slight thread sheen, clean satin-stitch edges. '
            : 'The logo application must look like a crisp professional print, flat and precisely registered. ';

        $body = match ($data['kind']) {
            'mockup' => "Create a premium e-commerce product mockup of {$subject}. Clean catalogue presentation, "
                . 'soft even studio lighting, plain light-neutral background with a subtle shadow, no people.',
            'worn'   => "Create a professional corporate-wear photograph of {$subject}. Editorial-quality lifestyle photography, "
                . 'a bright modern office or elegant outdoor setting, natural confident poses, the branded garment clearly visible and in sharp focus.',
            'angles' => "Create a presentation sheet showing {$subject} from three angles side by side: front view, side view and back view "
                . 'of the SAME garment, consistent colours and details across all three, evenly spaced on a plain white background like a product design board.',
            'advert' => "Create an eye-catching advertising campaign visual featuring {$subject}. Bold, premium art direction, "
                . 'striking composition with space for a headline, magazine-cover energy.',
        };

        $p = $body . ' ' . $faithful . $applied;
        if (! empty($data['prompt'])) $p .= " Additional direction: {$data['prompt']}.";
        return $p . ' Output exactly one image.';
    }

    private function animatePrompt(array $data, ?CustomerProduct $product): string
    {
        $subject = $this->describeSubject($data, $product);
        $motion = match ($data['kind']) {
            'worn', 'advert' => 'The people move naturally — confident walking, subtle smiles, fabric responding to movement — while the camera slowly tracks and pushes in, cinematic commercial style.',
            default          => 'The camera orbits smoothly around the garment, studio turntable style, showing it from multiple angles.',
        };
        $p = "Animate this photograph into a short professional promotional clip of {$subject}. {$motion} "
            . 'Keep the logo, garment and setting exactly as shown.';
        if (! empty($data['prompt'])) $p .= " Additional direction: {$data['prompt']}.";
        return $p;
    }

    // ─── Omni bookkeeping (same flow as Generations) ───────────────────

    private function applyInteraction(StudioItem $item, array $interaction): void
    {
        $meta = array_merge($item->meta ?? [], array_filter(['interaction_id' => $interaction['id'] ?? null]));
        $status = strtolower((string) ($interaction['status'] ?? ''));

        if (in_array($status, ['completed', 'succeeded'], true)) {
            $video = $this->gemini->extractVideoPart($interaction);
            $bytes = null;
            $mime  = $video['mime'] ?? 'video/mp4';
            if (! empty($video['data'])) {
                $bytes = base64_decode($video['data']);
            } elseif (! empty($video['uri'])) {
                $file  = $this->gemini->downloadFile($video['uri']);
                $bytes = $file['bytes'] ?? null;
                $mime  = $file['mime'] ?? $mime;
            }
            if ($bytes) {
                $item->update([
                    'video_url' => $this->saveFile($bytes, $mime),
                    'status'    => 'ready',
                    'meta'      => $meta,
                ]);
            } else {
                $item->update(['status' => 'failed', 'meta' => array_merge($meta, ['error' => 'Completed but no video payload.'])]);
            }
        } elseif ($status === 'failed') {
            $item->update(['status' => 'failed', 'meta' => array_merge($meta, ['error' => $interaction['error']['message'] ?? 'Video generation failed.'])]);
        } else {
            $item->update(['meta' => $meta]);
        }
    }

    // ─── File plumbing ─────────────────────────────────────────────────

    private function saveFile(string $bytes, string $mime): string
    {
        $ext = match (true) {
            str_contains($mime, 'mp4')  => 'mp4',
            str_contains($mime, 'webm') => 'webm',
            str_contains($mime, 'webp') => 'webp',
            str_contains($mime, 'jpeg') => 'jpg',
            default                     => 'png',
        };

        return Media::put('ai/studio', $ext, $bytes);
    }

    private function refFromPublicUrl(?string $url): ?array
    {
        return Media::asReference($url);
    }

    private function shape(StudioItem $i): array
    {
        return [
            'id'          => $i->id,
            'kind'        => $i->kind,
            'status'      => $i->status,
            'logo_id'     => $i->logo_id,
            'customer_product_id' => $i->customer_product_id,
            'garment'     => $i->garment,
            'audience'    => $i->audience,
            'placement'   => $i->placement,
            'application' => $i->application,
            'prompt'      => $i->prompt,
            'script'      => $i->script,
            'label'       => $i->meta['label'] ?? null,
            'image_url'   => $i->image_url,
            'video_url'   => $i->video_url,
            'error'       => $i->status === 'failed' ? ($i->meta['error'] ?? null) : null,
            'created_at'  => $i->created_at?->toIso8601String(),
        ];
    }
}
