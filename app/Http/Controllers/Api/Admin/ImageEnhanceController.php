<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\Scopes\ExclusivityScope;
use App\Services\AI\GeminiService;
use App\Services\ImageEnhance;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/** Product photo → a restored preview (paid, on request) → kept or thrown away. */
class ImageEnhanceController extends Controller
{
    /** GET /api/admin/products/{id}/enhance — the price per render, and what this product has spent so far. */
    public function quote(string $id)
    {
        $p = Product::withoutGlobalScope(ExclusivityScope::class)->findOrFail($id);

        return ['estimate' => ImageEnhance::estimate(), 'spent' => (float) ($p->metadata['ai_cost'] ?? 0), 'ready' => (new GeminiService())->isConfigured()];
    }

    /** POST /api/admin/products/{id}/images/{imageId}/enhance  { clean } */
    public function preview(Request $request, string $id, string $imageId)
    {
        if (! (new GeminiService())->isConfigured()) return response()->json(['error' => 'AI isn\'t set up on this server (GOOGLE_AI_API_KEY).'], 422);
        try {
            return ImageEnhance::preview($id, $imageId, $request->boolean('clean'));
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::warning('[image enhance] ' . $e->getMessage());
            // 429 = Google's quota: on the free tier the image model's allowance is 0.
            if (str_contains($e->getMessage(), '429')) {
                return response()->json(['error' => 'Google refused: this API key has no image allowance. Image AI needs billing switched on for the key\'s project at aistudio.google.com (the free tier allows 0 images). Nothing was charged.'], 422);
            }

            return response()->json(['error' => 'The AI couldn\'t improve that photo just now — try again in a moment.'], 422);
        }
    }

    /** POST /api/admin/products/{id}/images/{imageId}/enhance/keep  { url } */
    public function keep(Request $request, string $id, string $imageId)
    {
        $url = (string) $request->validate(['url' => ['required', 'string', 'max:500']])['url'];
        try {
            return ImageEnhance::keep($id, $imageId, $url);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }
    }

    /** POST /api/admin/products/{id}/enhance/discard  { url } */
    public function discard(Request $request, string $id)
    {
        ImageEnhance::discard($id, (string) $request->validate(['url' => ['required', 'string', 'max:500']])['url']);

        return ['ok' => true];
    }
}
