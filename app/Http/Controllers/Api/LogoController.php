<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Logo;
use App\Services\AI\GeminiService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Show Room → Logos. A creation area for embroiderers and logo designers:
 * describe a mark (optionally with reference sketches / existing logos) and
 * Nano Banana renders it in a flat, limited-palette, embroidery-friendly
 * style. Edits re-render from the current logo so the composition holds.
 *
 * Like avatars, source references and the current render are kept on disk —
 * the future My Products / Studio surfaces reuse them.
 */
class LogoController extends Controller
{
    public function __construct(private GeminiService $gemini)
    {
        GeminiService::$usageContext = [
            'surface'     => 'logos',
            'customer_id' => Auth::guard('customer')->id(),
        ];
    }

    /** GET /api/account/logos */
    public function index()
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return ['logos' => null];

        return [
            'logos' => Logo::where('customer_id', $customer->id)
                ->latest()
                ->get()
                ->map(fn ($l) => $this->shape($l)),
        ];
    }

    /**
     * POST /api/account/logos — multipart:
     * { prompt (required brief), name?, text?, style?, colors?, images[]? (0-3 refs) }
     */
    public function store(Request $request)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return response()->json(['error' => 'Sign in to create logos.'], 401);

        $data = $request->validate([
            'name'     => ['nullable', 'string', 'max:120'],
            'prompt'   => ['required', 'string', 'max:2000'],
            'text'     => ['nullable', 'string', 'max:120'],
            'style'    => ['nullable', 'string', 'max:120'],
            'colors'   => ['nullable', 'string', 'max:160'],
            'images'   => ['nullable', 'array', 'max:3'],
            'images.*' => ['image', 'max:8192'],
        ]);
        if (! $this->gemini->isConfigured()) {
            return response()->json(['error' => 'The logo studio is not configured yet.'], 503);
        }

        $sources = [];
        $refs    = [];
        foreach ($request->file('images', []) as $file) {
            $sources[] = $file->store('logos/sources', 'public');
            $refs[]    = [
                'mime'   => $file->getMimeType() ?: 'image/jpeg',
                'base64' => base64_encode(file_get_contents($file->getRealPath())),
            ];
        }

        $settings = array_filter([
            'text'   => $data['text']   ?? null,
            'style'  => $data['style']  ?? null,
            'colors' => $data['colors'] ?? null,
        ]);

        try {
            $result = $this->gemini->generateImage($this->creationPrompt($data['prompt'], $settings, count($refs) > 0), $refs);
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 502);
        }
        if (! $result) {
            return response()->json(['error' => 'The model returned no image — try a simpler brief.'], 502);
        }

        $logo = Logo::create([
            'id'            => 'logo_' . Str::random(16),
            'customer_id'   => $customer->id,
            'name'          => $data['name'] ?? 'My logo',
            'prompt'        => $data['prompt'],
            'source_images' => $sources,
            'image_url'     => $this->saveRender($result),
            'settings'      => $settings,
            'status'        => 'ready',
        ]);

        return ['logo' => $this->shape($logo)];
    }

    /**
     * PUT /api/account/logos/{id}
     * { name?, attributes?: {colors?, style?, text?}, instruction? }
     * Any attribute or instruction re-renders from the current logo.
     */
    public function update(Request $request, string $id)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return response()->json(['error' => 'Sign in first.'], 401);

        $logo = Logo::where('customer_id', $customer->id)->findOrFail($id);
        $data = $request->validate([
            'name'               => ['sometimes', 'string', 'max:120'],
            'instruction'        => ['nullable', 'string', 'max:1000'],
            'attributes'         => ['nullable', 'array'],
            'attributes.colors'  => ['nullable', 'string', 'max:160'],
            'attributes.style'   => ['nullable', 'string', 'max:120'],
            'attributes.text'    => ['nullable', 'string', 'max:120'],
        ]);

        if (array_key_exists('name', $data)) {
            $logo->name = $data['name'];
        }

        $attrs = array_filter($data['attributes'] ?? [], fn ($v) => is_string($v) && trim($v) !== '');
        $instruction = trim((string) ($data['instruction'] ?? ''));

        if ($attrs || $instruction !== '') {
            if (! $this->gemini->isConfigured()) {
                return response()->json(['error' => 'The logo studio is not configured yet.'], 503);
            }
            $ref = $this->refFromPublicUrl($logo->image_url);
            if (! $ref) {
                return response()->json(['error' => 'Logo image is missing — create it again.'], 422);
            }
            try {
                $result = $this->gemini->generateImage($this->editPrompt($attrs, $instruction), [$ref]);
            } catch (\Throwable $e) {
                return response()->json(['error' => $e->getMessage()], 502);
            }
            if (! $result) {
                return response()->json(['error' => 'The model returned no image — try rewording the change.'], 502);
            }
            $this->deleteRender($logo->image_url);
            $logo->image_url = $this->saveRender($result);
            $logo->settings  = array_merge($logo->settings ?? [], $attrs);
        }

        $logo->save();
        return ['logo' => $this->shape($logo->fresh())];
    }

    /** DELETE /api/account/logos/{id} */
    public function destroy(string $id)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return response()->json(['error' => 'Sign in first.'], 401);

        $logo = Logo::where('customer_id', $customer->id)->findOrFail($id);
        $this->deleteRender($logo->image_url);
        foreach ($logo->source_images ?? [] as $path) {
            Storage::disk('public')->delete($path);
        }
        $logo->delete();
        return ['ok' => true];
    }

    // ─── Prompts ────────────────────────────────────────────────────────

    private function creationPrompt(string $brief, array $settings, bool $hasRefs): string
    {
        $p = "Design a professional logo. Brief: {$brief}.";
        if (! empty($settings['text']))   $p .= " The logo must feature the text \"{$settings['text']}\" rendered accurately.";
        if (! empty($settings['style']))  $p .= " Style: {$settings['style']}.";
        if (! empty($settings['colors'])) $p .= " Colour palette: {$settings['colors']}.";
        if ($hasRefs) $p .= ' Use the reference images as inspiration for shape and character, refined into a polished mark.';
        return $p . ' Flat vector-style graphic, crisp clean edges, solid colours with a limited palette (no gradients or photo textures), '
            . 'perfectly centered on a plain solid white background — suitable for embroidery and print reproduction. Output exactly one image.';
    }

    private function editPrompt(array $attrs, string $instruction): string
    {
        $changes = [];
        foreach ($attrs as $key => $value) {
            $changes[] = "{$key}: {$value}";
        }
        if ($instruction !== '') $changes[] = $instruction;

        return 'Edit the logo in the reference image. Apply ONLY these changes: '
            . implode('; ', $changes) . '. '
            . 'Keep the overall composition, proportions and everything not mentioned exactly the same. '
            . 'Keep it a flat vector-style mark with clean edges and solid colours on a plain white background. '
            . 'Output exactly one image.';
    }

    // ─── Image plumbing ────────────────────────────────────────────────

    private function saveRender(array $result): string
    {
        $ext = str_contains($result['mime'], 'webp') ? 'webp' : (str_contains($result['mime'], 'jpeg') ? 'jpg' : 'png');
        $filename = 'ai/logos/' . Str::uuid() . '.' . $ext;
        $abs = public_path($filename);
        if (! is_dir(dirname($abs))) mkdir(dirname($abs), 0775, true);
        file_put_contents($abs, base64_decode($result['base64']));
        return '/' . $filename;
    }

    private function deleteRender(?string $url): void
    {
        if ($url && str_starts_with($url, '/ai/logos/')) {
            @unlink(public_path(ltrim($url, '/')));
        }
    }

    private function refFromPublicUrl(?string $url): ?array
    {
        if (! $url) return null;
        $abs = public_path(ltrim($url, '/'));
        if (! is_file($abs)) return null;
        return [
            'mime'   => mime_content_type($abs) ?: 'image/png',
            'base64' => base64_encode(file_get_contents($abs)),
        ];
    }

    private function shape(Logo $l): array
    {
        return [
            'id'         => $l->id,
            'name'       => $l->name,
            'prompt'     => $l->prompt,
            'image_url'  => $l->image_url,
            'settings'   => $l->settings ?? (object) [],
            'status'     => $l->status,
            'created_at' => $l->created_at?->toIso8601String(),
        ];
    }
}
