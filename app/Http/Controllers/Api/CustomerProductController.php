<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CustomerProduct;
use App\Services\AI\GeminiService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Show Room → My Products. Customers photograph their own merch (caps,
 * t-shirts, totes...) and Nano Banana digitises it into a clean catalogue-
 * style product render. The digital version pairs with their logos in the
 * Studio tab (logo placement mockups), so source photos and the current
 * render are both kept on disk.
 */
class CustomerProductController extends Controller
{
    public function __construct(private GeminiService $gemini)
    {
        GeminiService::$usageContext = [
            'surface'     => 'my-products',
            'customer_id' => Auth::guard('customer')->id(),
        ];
    }

    /** GET /api/account/my-products */
    public function index()
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return ['products' => null];

        return [
            'products' => CustomerProduct::where('customer_id', $customer->id)
                ->latest()
                ->get()
                ->map(fn ($p) => $this->shape($p)),
        ];
    }

    /**
     * POST /api/account/my-products — multipart:
     * { images[] (1-5 photos of the item), name?, category?, prompt? }
     */
    public function store(Request $request)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return response()->json(['error' => 'Sign in to add your products.'], 401);

        $data = $request->validate([
            'name'     => ['nullable', 'string', 'max:120'],
            'category' => ['nullable', 'string', 'max:60'],
            'prompt'   => ['nullable', 'string', 'max:2000'],
            'images'   => ['required', 'array', 'min:1', 'max:5'],
            'images.*' => ['image', 'max:8192'],
        ]);
        if (! $this->gemini->isConfigured()) {
            return response()->json(['error' => 'The product studio is not configured yet.'], 503);
        }

        $sources = [];
        $refs    = [];
        foreach ($request->file('images') as $file) {
            $sources[] = $file->store('my-products/sources', 'public');
            $refs[]    = [
                'mime'   => $file->getMimeType() ?: 'image/jpeg',
                'base64' => base64_encode(file_get_contents($file->getRealPath())),
            ];
        }

        try {
            $result = $this->gemini->generateImage(
                $this->creationPrompt($data['category'] ?? null, $data['prompt'] ?? null),
                $refs,
            );
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 502);
        }
        if (! $result) {
            return response()->json(['error' => 'The model returned no image — try clearer photos of the item.'], 502);
        }

        $product = CustomerProduct::create([
            'id'            => 'cprod_' . Str::random(16),
            'customer_id'   => $customer->id,
            'name'          => $data['name'] ?? 'My product',
            'category'      => $data['category'] ?? null,
            'prompt'        => $data['prompt'] ?? null,
            'source_images' => $sources,
            'image_url'     => $this->saveRender($result),
            'settings'      => [],
            'status'        => 'ready',
        ]);

        return ['product' => $this->shape($product)];
    }

    /**
     * PUT /api/account/my-products/{id}
     * { name?, attributes?: {color?, material?, angle?}, instruction? }
     * Any attribute or instruction re-renders from the current digital version
     * (with a source photo as the fidelity anchor).
     */
    public function update(Request $request, string $id)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return response()->json(['error' => 'Sign in first.'], 401);

        $product = CustomerProduct::where('customer_id', $customer->id)->findOrFail($id);
        $data = $request->validate([
            'name'                 => ['sometimes', 'string', 'max:120'],
            'instruction'          => ['nullable', 'string', 'max:1000'],
            'attributes'           => ['nullable', 'array'],
            'attributes.color'     => ['nullable', 'string', 'max:60'],
            'attributes.material'  => ['nullable', 'string', 'max:60'],
            'attributes.angle'     => ['nullable', 'string', 'max:60'],
        ]);

        if (array_key_exists('name', $data)) {
            $product->name = $data['name'];
        }

        $attrs = array_filter($data['attributes'] ?? [], fn ($v) => is_string($v) && trim($v) !== '');
        $instruction = trim((string) ($data['instruction'] ?? ''));

        if ($attrs || $instruction !== '') {
            if (! $this->gemini->isConfigured()) {
                return response()->json(['error' => 'The product studio is not configured yet.'], 503);
            }
            $refs = array_filter([
                $this->refFromPublicUrl($product->image_url),
                $this->refFromDisk(($product->source_images ?? [])[0] ?? null),
            ]);
            if (! $refs) {
                return response()->json(['error' => 'Product image is missing — add it again.'], 422);
            }
            try {
                $result = $this->gemini->generateImage($this->editPrompt($attrs, $instruction), array_values($refs));
            } catch (\Throwable $e) {
                return response()->json(['error' => $e->getMessage()], 502);
            }
            if (! $result) {
                return response()->json(['error' => 'The model returned no image — try rewording the change.'], 502);
            }
            $this->deleteRender($product->image_url);
            $product->image_url = $this->saveRender($result);
            $product->settings  = array_merge($product->settings ?? [], $attrs);
        }

        $product->save();
        return ['product' => $this->shape($product->fresh())];
    }

    /** DELETE /api/account/my-products/{id} */
    public function destroy(string $id)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return response()->json(['error' => 'Sign in first.'], 401);

        $product = CustomerProduct::where('customer_id', $customer->id)->findOrFail($id);
        $this->deleteRender($product->image_url);
        foreach ($product->source_images ?? [] as $path) {
            Storage::disk('public')->delete($path);
        }
        $product->delete();
        return ['ok' => true];
    }

    // ─── Prompts ────────────────────────────────────────────────────────

    private function creationPrompt(?string $category, ?string $userPrompt): string
    {
        $item = $category ? "the {$category}" : 'the product';
        $p = "Create a clean digital catalogue render of {$item} shown in the reference photos. "
            . "Reproduce the product's exact shape, colours, fabric texture, stitching and any existing prints or details faithfully — "
            . 'this is a digitisation of a real item, not a redesign. '
            . 'Present it as professional e-commerce product photography: front view, neatly presented, soft even studio lighting, '
            . 'on a plain light-neutral background with a subtle soft shadow, no people, no props.';
        if ($userPrompt) $p .= " Additional direction: {$userPrompt}.";
        return $p . ' Output exactly one image.';
    }

    private function editPrompt(array $attrs, string $instruction): string
    {
        $changes = [];
        foreach ($attrs as $key => $value) {
            $changes[] = "{$key}: {$value}";
        }
        if ($instruction !== '') $changes[] = $instruction;

        return 'Edit the product render in the first reference image. Apply ONLY these changes: '
            . implode('; ', $changes) . '. '
            . 'Keep the product design, proportions, presentation and everything not mentioned exactly the same '
            . '(the second reference image, when present, shows the real item — stay faithful to it). '
            . 'Keep the clean catalogue style: plain light-neutral background, soft studio lighting, no people. '
            . 'Output exactly one image.';
    }

    // ─── Image plumbing ────────────────────────────────────────────────

    private function saveRender(array $result): string
    {
        $ext = str_contains($result['mime'], 'webp') ? 'webp' : (str_contains($result['mime'], 'jpeg') ? 'jpg' : 'png');
        $filename = 'ai/my-products/' . Str::uuid() . '.' . $ext;
        $abs = public_path($filename);
        if (! is_dir(dirname($abs))) mkdir(dirname($abs), 0775, true);
        file_put_contents($abs, base64_decode($result['base64']));
        return '/' . $filename;
    }

    private function deleteRender(?string $url): void
    {
        if ($url && str_starts_with($url, '/ai/my-products/')) {
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

    private function shape(CustomerProduct $p): array
    {
        return [
            'id'         => $p->id,
            'name'       => $p->name,
            'category'   => $p->category,
            'prompt'     => $p->prompt,
            'image_url'  => $p->image_url,
            'settings'   => $p->settings ?? (object) [],
            'status'     => $p->status,
            'created_at' => $p->created_at?->toIso8601String(),
        ];
    }
}
