<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Avatar;
use App\Models\Generation;
use App\Models\Product;
use App\Services\AI\GeminiService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Show Room → Generations. Customer picks one of their avatars, up to four
 * catalogue products and an environment, then:
 *
 *   image — Nano Banana composes the avatar wearing the products in the
 *           environment (synchronous, ~30-60s).
 *   video — same composition first, then Gemini Omni Flash animates it
 *           (asynchronous: row stays `pending`, the client polls show()
 *           which finalises the interaction when Google is done).
 *
 * Outputs land in public/ai/generations/ and are share/downloadable.
 */
class GenerationController extends Controller
{
    public function __construct(private GeminiService $gemini)
    {
        GeminiService::$usageContext = [
            'surface'     => 'generations',
            'customer_id' => Auth::guard('customer')->id(),
        ];
    }

    /** GET /api/account/generations */
    public function index()
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return ['generations' => null];

        return [
            'generations' => Generation::where('customer_id', $customer->id)
                ->latest()
                ->get()
                ->map(fn ($g) => $this->shape($g)),
        ];
    }

    /**
     * POST /api/account/generations
     * { avatar_id, kind: image|video, product_ids?: [..max 4], environment?, prompt? }
     */
    public function store(Request $request)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return response()->json(['error' => 'Sign in to create generations.'], 401);

        $data = $request->validate([
            'avatar_id'     => ['required', 'string'],
            'kind'          => ['required', Rule::in(['image', 'video'])],
            'product_ids'   => ['nullable', 'array', 'max:4'],
            'product_ids.*' => ['string', 'exists:products,id'],
            'environment'   => ['nullable', 'string', 'max:160'],
            'prompt'        => ['nullable', 'string', 'max:1000'],
        ]);
        if (! $this->gemini->isConfigured()) {
            return response()->json(['error' => 'The studio is not configured yet.'], 503);
        }

        $avatar = Avatar::where('customer_id', $customer->id)->find($data['avatar_id']);
        if (! $avatar) return response()->json(['error' => 'Avatar not found.'], 404);

        // ── Reference images: avatar render first (identity), then products.
        $refs = [];
        $avatarRef = $this->refFromLocalUrl($avatar->image_url);
        if (! $avatarRef) return response()->json(['error' => 'Avatar image is missing — re-create the avatar.'], 422);
        $refs[] = $avatarRef;

        $products = Product::with(['images' => fn ($q) => $q->orderBy('rank')->limit(1)])
            ->whereIn('id', $data['product_ids'] ?? [])
            ->get();
        foreach ($products as $p) {
            $url = $p->images->first()?->url ?: $p->thumbnail;
            if ($ref = $this->refFromLocalUrl($url)) $refs[] = $ref;
        }

        // ── Compose the still with Nano Banana.
        try {
            $result = $this->gemini->generateImage(
                $this->composePrompt($products, $data['environment'] ?? null, $data['prompt'] ?? null),
                $refs,
            );
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 502);
        }
        if (! $result) {
            return response()->json(['error' => 'The model returned no image — try fewer products or a simpler prompt.'], 502);
        }

        $generation = Generation::create([
            'id'          => 'gen_' . Str::random(16),
            'customer_id' => $customer->id,
            'avatar_id'   => $avatar->id,
            'kind'        => $data['kind'],
            'product_ids' => $products->pluck('id')->all(),
            'environment' => $data['environment'] ?? null,
            'prompt'      => $data['prompt'] ?? null,
            'image_url'   => $this->saveFile(base64_decode($result['base64']), $result['mime']),
            'status'      => $data['kind'] === 'image' ? 'ready' : 'pending',
            'meta'        => ['product_titles' => $products->pluck('title')->all()],
        ]);

        // ── Video: hand the composed still to Omni Flash.
        if ($data['kind'] === 'video') {
            try {
                $interaction = $this->gemini->startVideoInteraction(
                    ['base64' => $result['base64'], 'mime' => $result['mime']],
                    $this->animatePrompt($data['environment'] ?? null, $data['prompt'] ?? null),
                );
                $this->applyInteraction($generation, $interaction);
            } catch (\Throwable $e) {
                $generation->update(['status' => 'failed', 'meta' => array_merge($generation->meta ?? [], ['error' => $e->getMessage()])]);
            }
        }

        return ['generation' => $this->shape($generation->fresh())];
    }

    /**
     * GET /api/account/generations/{id}
     * Pending video rows poll the Omni interaction and finalise when done.
     */
    public function show(string $id)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return response()->json(['error' => 'Sign in first.'], 401);

        $g = Generation::where('customer_id', $customer->id)->findOrFail($id);

        if ($g->status === 'pending' && ! empty($g->meta['interaction_id'])) {
            try {
                $this->applyInteraction($g, $this->gemini->getInteraction($g->meta['interaction_id']));
            } catch (\Throwable $e) {
                // Transient poll errors keep the row pending; the client retries.
            }
        }

        return ['generation' => $this->shape($g->fresh())];
    }

    /** DELETE /api/account/generations/{id} */
    public function destroy(string $id)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return response()->json(['error' => 'Sign in first.'], 401);

        $g = Generation::where('customer_id', $customer->id)->findOrFail($id);
        foreach ([$g->image_url, $g->video_url] as $url) {
            if ($url && str_starts_with($url, '/ai/generations/')) {
                @unlink(public_path(ltrim($url, '/')));
            }
        }
        $g->delete();
        return ['ok' => true];
    }

    // ─── Omni bookkeeping ──────────────────────────────────────────────

    /** Fold an Omni interaction response into the row (video / pending / failed). */
    private function applyInteraction(Generation $g, array $interaction): void
    {
        $meta = array_merge($g->meta ?? [], array_filter(['interaction_id' => $interaction['id'] ?? null]));
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
                $g->update([
                    'video_url' => $this->saveFile($bytes, $mime),
                    'status'    => 'ready',
                    'meta'      => $meta,
                ]);
            } else {
                $g->update(['status' => 'failed', 'meta' => array_merge($meta, ['error' => 'Completed but no video payload.'])]);
            }
        } elseif ($status === 'failed') {
            $g->update(['status' => 'failed', 'meta' => array_merge($meta, ['error' => $interaction['error']['message'] ?? 'Video generation failed.'])]);
        } else {
            // processing / queued — keep polling.
            $g->update(['meta' => $meta]);
        }
    }

    // ─── Prompts ────────────────────────────────────────────────────────

    private function composePrompt($products, ?string $environment, ?string $userPrompt): string
    {
        $p = "Create a full-length editorial fashion photograph of the person shown in the first reference image. "
            . "Preserve their facial identity and look exactly.";
        if ($products->isNotEmpty()) {
            $p .= " They are wearing/using these products from the other reference images: "
                . $products->pluck('title')->implode(', ')
                . '. Render each product faithfully — colours, cut and details must match the references.';
        }
        $p .= $environment
            ? " Setting: {$environment}."
            : ' Setting: an elegant minimalist studio.';
        if ($userPrompt) $p .= " Additional direction: {$userPrompt}.";
        return $p . ' Portrait orientation, flattering natural light, luxury magazine quality. Output exactly one image.';
    }

    private function animatePrompt(?string $environment, ?string $userPrompt): string
    {
        $p = 'Animate this photograph into a short cinematic fashion film clip. '
            . 'The person moves naturally — subtle pose shifts, fabric and hair responding to a light breeze — '
            . 'while the camera slowly pushes in. Keep their identity, outfit and the setting exactly as shown.';
        if ($environment) $p .= " Ambience: {$environment}.";
        if ($userPrompt)  $p .= " Additional direction: {$userPrompt}.";
        return $p;
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
        $filename = 'ai/generations/' . Str::uuid() . '.' . $ext;
        $abs = public_path($filename);
        if (! is_dir(dirname($abs))) mkdir(dirname($abs), 0775, true);
        file_put_contents($abs, $bytes);
        return '/' . $filename;
    }

    /** base64 ref from a local public URL (/ai/..., /storage/..., /uploads/...). */
    private function refFromLocalUrl(?string $url): ?array
    {
        if (! $url) return null;
        if (Str::startsWith($url, ['http://', 'https://'])) {
            try {
                $res = Http::timeout(20)->get($url);
                if (! $res->ok()) return null;
                return ['mime' => $res->header('Content-Type') ?: 'image/jpeg', 'base64' => base64_encode($res->body())];
            } catch (\Throwable) {
                return null;
            }
        }
        $abs = public_path(ltrim($url, '/'));
        if (! is_file($abs)) return null;
        return [
            'mime'   => mime_content_type($abs) ?: 'image/jpeg',
            'base64' => base64_encode(file_get_contents($abs)),
        ];
    }

    private function shape(Generation $g): array
    {
        return [
            'id'             => $g->id,
            'kind'           => $g->kind,
            'status'         => $g->status,
            'avatar_id'      => $g->avatar_id,
            'image_url'      => $g->image_url,
            'video_url'      => $g->video_url,
            'environment'    => $g->environment,
            'prompt'         => $g->prompt,
            'product_titles' => $g->meta['product_titles'] ?? [],
            'error'          => $g->status === 'failed' ? ($g->meta['error'] ?? null) : null,
            'created_at'     => $g->created_at?->toIso8601String(),
        ];
    }
}
