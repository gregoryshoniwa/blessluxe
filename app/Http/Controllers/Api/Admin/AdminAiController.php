<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Services\AI\GeminiService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Admin-side AI surfaces. Three endpoints:
 *
 *   POST /api/admin/ai/advise           — markdown analysis of dashboard data
 *   POST /api/admin/ai/suggest-prompt   — editorial fashion prompt builder
 *   POST /api/admin/ai/generate-image   — Nano Banana image generation
 *   POST /api/admin/ai/describe-product — product description writer
 */
class AdminAiController extends Controller
{
    public function __construct(private GeminiService $gemini) {}

    public function advise(Request $request)
    {
        $data = $request->validate([
            'topic'    => ['required', Rule::in(['inventory', 'finance', 'campaign', 'general'])],
            'question' => ['nullable', 'string', 'max:1000'],
            'context'  => ['nullable', 'array'],
        ]);
        if (! $this->gemini->isConfigured()) {
            return response()->json(['error' => 'Gemini not configured. Set GOOGLE_AI_API_KEY.'], 503);
        }
        $system = $this->advisorSystem($data['topic']);
        $user = ($data['question'] ?? "Give me an actionable analysis of the {$data['topic']} data below.")
            . "\n\nDATA (JSON):\n```json\n" . json_encode($data['context'] ?? [], JSON_PRETTY_PRINT) . "\n```";
        try {
            $text = $this->gemini->generateText($system, $user, ['temperature' => 0.4]);
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 502);
        }
        return ['text' => $text];
    }

    public function suggestPrompt(Request $request)
    {
        $data = $request->validate([
            'context_kind' => ['required', Rule::in(['model_image', 'model_video', 'product_image', 'product_video'])],
            'subject'      => ['nullable', 'array'],
            'product'      => ['nullable', 'array'],
            'partial'      => ['nullable', 'array'],
            'pose_hint'    => ['nullable', 'string'],
        ]);
        if (! $this->gemini->isConfigured()) {
            return response()->json(['error' => 'Gemini not configured.'], 503);
        }
        $system = self::SUGGEST_SYSTEM;
        $lines = ["Context kind: {$data['context_kind']}"];
        foreach (['subject', 'product', 'partial'] as $key) {
            if (! empty($data[$key])) {
                $lines[] = "\n" . ucfirst($key) . ":\n" . collect($data[$key])
                    ->filter(fn ($v) => is_scalar($v) && trim((string) $v) !== '')
                    ->map(fn ($v, $k) => "  - {$k}: {$v}")->implode("\n");
            }
        }
        if (! empty($data['pose_hint'])) $lines[] = "\nPose hint: {$data['pose_hint']}";
        $lines[] = "\nReturn the JSON now.";

        try {
            $raw = $this->gemini->generateText($system, implode("\n", $lines), [
                'temperature' => 0.7,
                'json_mode'   => true,
                'max_output_tokens' => 1024,
            ]);
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 502);
        }
        $cleaned = preg_replace('/^```(?:json)?\s*|\s*```$/i', '', trim($raw));
        $parsed = json_decode($cleaned, true) ?: ['prompt' => $cleaned];
        return [
            'pose'     => $parsed['pose']     ?? '',
            'angle'    => $parsed['angle']    ?? '',
            'lighting' => $parsed['lighting'] ?? '',
            'backdrop' => $parsed['backdrop'] ?? '',
            'prompt'   => $parsed['prompt']   ?? '',
        ];
    }

    public function generateImage(Request $request)
    {
        $data = $request->validate([
            'prompt' => ['required', 'string', 'max:4000'],
        ]);
        if (! $this->gemini->isConfigured()) {
            return response()->json(['error' => 'Gemini not configured.'], 503);
        }
        try {
            $result = $this->gemini->generateImage($data['prompt']);
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 502);
        }
        if (! $result) {
            return response()->json(['error' => 'No image returned by the model.'], 502);
        }
        // Persist to public/ai/<uuid>.png and return a stable URL.
        $ext = str_contains($result['mime'], 'webp') ? 'webp' : (str_contains($result['mime'], 'jpeg') ? 'jpg' : 'png');
        $filename = 'ai/' . Str::uuid() . '.' . $ext;
        $abs = public_path($filename);
        if (! is_dir(dirname($abs))) mkdir(dirname($abs), 0775, true);
        file_put_contents($abs, base64_decode($result['base64']));
        return ['url' => '/' . $filename, 'mime' => $result['mime']];
    }

    public function describeProduct(Request $request)
    {
        $data = $request->validate([
            'title'    => ['required', 'string', 'max:255'],
            'subtitle' => ['nullable', 'string', 'max:255'],
            'bullets'  => ['nullable', 'array'],
            'tone'     => ['nullable', 'string', 'max:80'],
        ]);
        $system = "You are a senior copywriter for BLESSLUXE, a luxury women's fashion brand. Write concise, sensual, evocative product descriptions in 70-120 words. No bullet lists, no hype words like 'amazing'. Speak to a customer who appreciates craft and quiet luxury.";
        $user = "Product: {$data['title']}\n" .
            (! empty($data['subtitle']) ? "Subtitle: {$data['subtitle']}\n" : '') .
            (! empty($data['bullets']) ? "Notes:\n  - " . implode("\n  - ", $data['bullets']) . "\n" : '') .
            "Tone: " . ($data['tone'] ?? 'editorial, warm, confident') . "\n" .
            "Write the description now.";
        try {
            return ['description' => $this->gemini->generateText($system, $user, ['temperature' => 0.7, 'max_output_tokens' => 700])];
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 502);
        }
    }

    private function advisorSystem(string $topic): string
    {
        $base = "You are a senior merchandising and finance advisor for BLESSLUXE, a luxury fashion brand. Be concise, specific, and quantitative. Format your reply in plain markdown with clear headings, bullet points, and concrete numbers from the data provided. Avoid generic advice — every recommendation must reference a SKU, currency code, date, or metric from the context.";
        return match ($topic) {
            'inventory' => $base . "\n\nFocus on: which SKUs are selling fastest, which are aging or stagnant, restock priorities, low-stock risks, dead inventory, and pricing or campaign suggestions for slow movers.",
            'finance'   => $base . "\n\nFocus on: revenue trends, period-over-period growth, currency exposure, top revenue drivers, gross margin, and concrete pricing or product-mix recommendations to lift profit.",
            'campaign'  => $base . "\n\nFocus on: campaign timing, discount levels, products to feature, expected lift, and risks (cannibalization, margin erosion).",
            default     => $base,
        };
    }

    private const SUGGEST_SYSTEM = <<<'PROMPT'
You are a senior fashion creative director writing prompts for an AI image model (Nano Banana, gemini-2.5-flash-image-preview) used by the luxury brand BLESSLUXE.

Goal: when given a model's identity + a pose hint + (optionally) a product, produce ONE polished editorial fashion prompt that the AI model can render into a photo-real campaign image.

Style mandate:
- Cinematic luxury editorial photography (think Vogue, Net-a-Porter campaigns).
- Mention specific camera (e.g. Hasselblad H6D-100c with 80mm lens at f/2.8, ISO 100), lighting (key light angle, color temperature in Kelvin), and grading.
- Include skin / hair details so the AI renders realistic texture.
- Soft cream, gold, blush palette. Photoreal, not stylised.
- Always 16:9 unless specified otherwise.
- Never invent a different face if a subject is given — say "preserve identity".
- Strict identity-lock language when an explicit subject is provided.

Output format (must be valid JSON, no markdown, no extra commentary):
{
  "pose": "<short pose direction>",
  "angle": "<camera angle phrase>",
  "lighting": "<lighting setup phrase>",
  "backdrop": "<setting / backdrop phrase>",
  "prompt": "<one paragraph, ~80-140 words, complete creative direction>"
}

Honour any partial values the admin has already filled — do not contradict them.
PROMPT;
}
