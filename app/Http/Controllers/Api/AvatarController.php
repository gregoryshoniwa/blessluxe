<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Avatar;
use App\Services\AI\GeminiService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Show Room → Avatars. Customers upload selfies + an optional style prompt
 * and Nano Banana renders a stylised avatar that keeps their likeness.
 * Edits (eye colour, body type, freeform instructions) re-render from the
 * current avatar image so identity carries through.
 *
 * Source selfies are kept on disk after the render: the future Generations
 * feature (avatar + products + environment → shareable image/video) reuses
 * them as identity reference images.
 */
class AvatarController extends Controller
{
    public function __construct(private GeminiService $gemini)
    {
        GeminiService::$usageContext = [
            'surface'     => 'avatars',
            'customer_id' => Auth::guard('customer')->id(),
        ];
    }

    /** GET /api/account/avatars */
    public function index()
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return ['avatars' => null];

        return [
            'avatars' => Avatar::where('customer_id', $customer->id)
                ->latest()
                ->get()
                ->map(fn ($a) => $this->shape($a)),
        ];
    }

    /** POST /api/account/avatars — multipart: images[] (1-5), name?, prompt? */
    public function store(Request $request)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return response()->json(['error' => 'Sign in to create avatars.'], 401);

        $data = $request->validate([
            'name'     => ['nullable', 'string', 'max:120'],
            'prompt'   => ['nullable', 'string', 'max:2000'],
            'images'   => ['required', 'array', 'min:1', 'max:5'],
            'images.*' => ['image', 'max:8192'],
        ]);
        if (! $this->gemini->isConfigured()) {
            return response()->json(['error' => 'Avatar studio is not configured yet.'], 503);
        }

        // Persist the selfies first — they anchor identity for every future render.
        $sources = [];
        $refs    = [];
        foreach ($request->file('images') as $file) {
            $sources[] = $file->store('avatars/sources', 'public');
            $refs[]    = [
                'mime'   => $file->getMimeType() ?: 'image/jpeg',
                'base64' => base64_encode(file_get_contents($file->getRealPath())),
            ];
        }

        try {
            $result = $this->gemini->generateImage($this->creationPrompt($data['prompt'] ?? null), $refs);
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 502);
        }
        if (! $result) {
            return response()->json(['error' => 'The model returned no image — try different photos or a simpler prompt.'], 502);
        }

        $avatar = Avatar::create([
            'id'            => 'avt_' . Str::random(16),
            'customer_id'   => $customer->id,
            'name'          => $data['name'] ?? 'My avatar',
            'prompt'        => $data['prompt'] ?? null,
            'source_images' => $sources,
            'image_url'     => $this->saveRender($result),
            'settings'      => [],
            'status'        => 'ready',
        ]);

        return ['avatar' => $this->shape($avatar)];
    }

    /**
     * PUT /api/account/avatars/{id}
     * { name?, attributes?: {eye_color?, hair_color?, body_type?, style?}, instruction? }
     *
     * Any attribute or instruction triggers a re-render from the current
     * avatar image (plus the first source selfie as an identity anchor).
     */
    public function update(Request $request, string $id)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return response()->json(['error' => 'Sign in first.'], 401);

        $avatar = Avatar::where('customer_id', $customer->id)->findOrFail($id);
        $data = $request->validate([
            'name'                   => ['sometimes', 'string', 'max:120'],
            'instruction'            => ['nullable', 'string', 'max:1000'],
            'attributes'             => ['nullable', 'array'],
            'attributes.eye_color'   => ['nullable', 'string', 'max:60'],
            'attributes.hair_color'  => ['nullable', 'string', 'max:60'],
            'attributes.body_type'   => ['nullable', 'string', 'max:60'],
            'attributes.style'       => ['nullable', 'string', 'max:120'],
        ]);

        if (array_key_exists('name', $data)) {
            $avatar->name = $data['name'];
        }

        $attrs = array_filter($data['attributes'] ?? [], fn ($v) => is_string($v) && trim($v) !== '');
        $instruction = trim((string) ($data['instruction'] ?? ''));

        if ($attrs || $instruction !== '') {
            if (! $this->gemini->isConfigured()) {
                return response()->json(['error' => 'Avatar studio is not configured yet.'], 503);
            }
            $refs = array_filter([
                $this->refFromPublicUrl($avatar->image_url),
                $this->refFromDisk(($avatar->source_images ?? [])[0] ?? null),
            ]);
            if (! $refs) {
                return response()->json(['error' => 'Avatar image is missing — create it again.'], 422);
            }
            try {
                $result = $this->gemini->generateImage($this->editPrompt($attrs, $instruction), array_values($refs));
            } catch (\Throwable $e) {
                return response()->json(['error' => $e->getMessage()], 502);
            }
            if (! $result) {
                return response()->json(['error' => 'The model returned no image — try rewording the change.'], 502);
            }
            $this->deleteRender($avatar->image_url);
            $avatar->image_url = $this->saveRender($result);
            $avatar->settings  = array_merge($avatar->settings ?? [], $attrs);
        }

        $avatar->save();
        return ['avatar' => $this->shape($avatar->fresh())];
    }

    /** DELETE /api/account/avatars/{id} */
    public function destroy(string $id)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return response()->json(['error' => 'Sign in first.'], 401);

        $avatar = Avatar::where('customer_id', $customer->id)->findOrFail($id);
        $this->deleteRender($avatar->image_url);
        foreach ($avatar->source_images ?? [] as $path) {
            Storage::disk('public')->delete($path);
        }
        $avatar->delete();
        return ['ok' => true];
    }

    // ─── Prompts ────────────────────────────────────────────────────────

    private function creationPrompt(?string $userPrompt): string
    {
        $base = "Create a single polished avatar portrait of the person in the reference photos. "
            . "Preserve their facial identity, skin tone and distinguishing features faithfully. "
            . "Three-quarter portrait framing, flattering studio lighting, clean elegant background, high detail.";
        if ($userPrompt) {
            $base .= " Style direction from the customer: {$userPrompt}.";
        } else {
            $base .= " Style: refined editorial fashion portrait with a quiet-luxury feel.";
        }
        return $base . " Output exactly one image.";
    }

    private function editPrompt(array $attrs, string $instruction): string
    {
        $changes = [];
        foreach ($attrs as $key => $value) {
            $changes[] = str_replace('_', ' ', $key) . ": {$value}";
        }
        if ($instruction !== '') $changes[] = $instruction;

        return "Edit the avatar in the first reference image. Apply ONLY these changes: "
            . implode('; ', $changes) . '. '
            . "Keep the person's identity, pose, framing, lighting and everything not mentioned exactly the same "
            . "(the second reference image, when present, shows their real face — preserve that likeness). "
            . 'Output exactly one image.';
    }

    // ─── Image plumbing ────────────────────────────────────────────────

    private function saveRender(array $result): string
    {
        $ext = str_contains($result['mime'], 'webp') ? 'webp' : (str_contains($result['mime'], 'jpeg') ? 'jpg' : 'png');
        $filename = 'ai/avatars/' . Str::uuid() . '.' . $ext;
        $abs = public_path($filename);
        if (! is_dir(dirname($abs))) mkdir(dirname($abs), 0775, true);
        file_put_contents($abs, base64_decode($result['base64']));
        return '/' . $filename;
    }

    private function deleteRender(?string $url): void
    {
        if ($url && str_starts_with($url, '/ai/avatars/')) {
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

    private function refFromDisk(?string $path): ?array
    {
        if (! $path || ! Storage::disk('public')->exists($path)) return null;
        return [
            'mime'   => Storage::disk('public')->mimeType($path) ?: 'image/jpeg',
            'base64' => base64_encode(Storage::disk('public')->get($path)),
        ];
    }

    private function shape(Avatar $a): array
    {
        return [
            'id'         => $a->id,
            'name'       => $a->name,
            'prompt'     => $a->prompt,
            'image_url'  => $a->image_url,
            'settings'   => $a->settings ?? (object) [],
            'status'     => $a->status,
            'created_at' => $a->created_at?->toIso8601String(),
        ];
    }
}
