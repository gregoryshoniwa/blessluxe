<?php

namespace App\Services\AI;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Thin wrapper over the Google AI Studio REST API.
 *
 * Two top-level methods cover the surface we use:
 *   - chatWithTools()         — agent turn (system + history + user → text + tool calls)
 *   - generateImage()         — Nano Banana (gemini-2.5-flash-image-preview)
 *   - generateText()          — plain non-tool text generation
 *
 * Tool definitions follow our internal AiTool::definition() shape and get
 * translated into Gemini functionDeclarations on the way out, and Gemini's
 * functionCall parts get translated back into ToolCall arrays for the
 * agent loop.
 */
class GeminiService
{
    private const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

    /**
     * Cost-ledger context. Feature controllers set this before calling so
     * every Google AI request lands in ai_usage_logs attributed to the right
     * surface + customer (the basis for charging customers later).
     * e.g. GeminiService::$usageContext = ['surface' => 'avatars', 'customer_id' => $c->id];
     */
    public static array $usageContext = [];

    public function __construct(private ?string $apiKey = null)
    {
        $this->apiKey = $this->apiKey ?: AiConfig::apiKey();
    }

    public function isConfigured(): bool
    {
        return ! empty($this->apiKey);
    }

    /**
     * @param array<int, array{role: string, content?: string, tool_calls?: array, tool_results?: array}> $messages
     * @param array<int, array> $toolDefs each shaped like the AiTool::definition()
     * @return array{content: string, tool_calls: array<int, array{id: string, name: string, arguments: array}>}
     */
    public function chatWithTools(array $messages, array $toolDefs = []): array
    {
        $this->requireKey();
        $functionDeclarations = $this->toolDefsToFunctionDeclarations($toolDefs);
        $payload = $this->buildPayload($messages, $functionDeclarations);

        $model = AiConfig::model();
        $res = Http::timeout(45)->post(
            self::API_BASE . "/models/{$model}:generateContent?key={$this->apiKey}",
            $payload,
        );
        if (! $res->ok()) {
            Log::warning('[gemini chat] '.$res->status().' '.Str::limit($res->body(), 500));
            throw new RuntimeException('Gemini API error: '.$res->status());
        }
        $this->logUsage('text', $model, 1, (float) env('AI_COST_TEXT_CALL', 0.002));
        $data = $res->json();

        if (! empty($data['error']['message'])) {
            throw new RuntimeException($data['error']['message']);
        }

        $candidate = $data['candidates'][0] ?? null;
        $parts = $candidate['content']['parts'] ?? [];

        $text = '';
        $toolCalls = [];
        foreach ($parts as $p) {
            if (! empty($p['text'])) $text .= $p['text'];
            if (! empty($p['functionCall']['name'])) {
                $toolCalls[] = [
                    'id'        => 'call_' . substr(bin2hex(random_bytes(6)), 0, 9),
                    'name'      => $p['functionCall']['name'],
                    'arguments' => $p['functionCall']['args'] ?? [],
                ];
            }
        }
        return [
            'content'    => trim($text),
            'tool_calls' => $toolCalls,
        ];
    }

    /** Plain text generation — used for advisor + product description gen. */
    public function generateText(string $systemPrompt, string $userText, array $opts = []): string
    {
        $this->requireKey();
        $model = $opts['model'] ?? AiConfig::model();
        $payload = [
            'system_instruction' => ['parts' => [['text' => $systemPrompt]]],
            'contents' => [[
                'role'  => 'user',
                'parts' => [['text' => $userText]],
            ]],
            'generationConfig' => [
                'temperature' => $opts['temperature'] ?? 0.6,
                'maxOutputTokens' => $opts['max_output_tokens'] ?? 2048,
            ],
        ];
        if (! empty($opts['json_mode'])) {
            $payload['generationConfig']['responseMimeType'] = 'application/json';
        }
        $res = Http::timeout(45)->post(
            self::API_BASE . "/models/{$model}:generateContent?key={$this->apiKey}",
            $payload,
        );
        if (! $res->ok()) {
            Log::warning('[gemini text] '.$res->status().' '.Str::limit($res->body(), 500));
            throw new RuntimeException('Gemini API error: '.$res->status());
        }
        $this->logUsage('text', $model, 1, (float) env('AI_COST_TEXT_CALL', 0.002));
        $data = $res->json();
        if (! empty($data['error']['message'])) throw new RuntimeException($data['error']['message']);
        $parts = $data['candidates'][0]['content']['parts'] ?? [];
        $text = '';
        foreach ($parts as $p) {
            if (! empty($p['text'])) $text .= $p['text'];
        }
        return trim($text);
    }

    /**
     * Nano Banana image generation. Returns base64 data + mime.
     * Returns null when the model produced no image (caller decides what to do).
     */
    public function generateImage(string $prompt, array $referenceImages = []): ?array
    {
        $this->requireKey();
        // Image renders with several reference photos routinely outlast PHP's
        // default 30s max_execution_time — give the request room to finish.
        set_time_limit(180);
        // Nano Banana 2 — supports up to 14 reference images with character
        // consistency (the 2.5 preview model is now marked legacy by Google).
        $model = env('GOOGLE_NANO_BANANA_MODEL', 'gemini-3.1-flash-image');
        $parts = [['text' => $prompt]];
        foreach ($referenceImages as $ref) {
            if (! empty($ref['base64']) && ! empty($ref['mime'])) {
                $parts[] = ['inlineData' => ['mimeType' => $ref['mime'], 'data' => $ref['base64']]];
            }
        }
        $payload = [
            'contents' => [['role' => 'user', 'parts' => $parts]],
            'generationConfig' => ['responseModalities' => ['TEXT', 'IMAGE']],
        ];
        $res = Http::timeout(120)->post(
            self::API_BASE . "/models/{$model}:generateContent?key={$this->apiKey}",
            $payload,
        );
        if (! $res->ok()) {
            Log::warning('[gemini image] '.$res->status().' '.Str::limit($res->body(), 500));
            throw new RuntimeException('Gemini image API error: '.$res->status());
        }
        $this->logUsage('image', $model, 1, (float) env('AI_COST_IMAGE', 0.067));
        $data = $res->json();
        $candidates = $data['candidates'] ?? [];
        foreach ($candidates as $c) {
            foreach ($c['content']['parts'] ?? [] as $p) {
                $inline = $p['inlineData'] ?? $p['inline_data'] ?? null;
                if (! empty($inline['data'])) {
                    return [
                        'base64' => $inline['data'],
                        'mime'   => $inline['mimeType'] ?? $inline['mime_type'] ?? 'image/png',
                    ];
                }
            }
        }
        return null;
    }

    /**
     * Start a Gemini Omni Flash image→video interaction. Returns the raw
     * interaction JSON ({id, status, steps, ...}). Omni is asynchronous:
     * the response may come back already `completed` with the video, or
     * `processing` — in which case poll getInteraction() until done.
     */
    public function startVideoInteraction(array $image, string $prompt, string $aspectRatio = '9:16'): array
    {
        $this->requireKey();
        set_time_limit(300);
        $model = env('GEMINI_OMNI_MODEL', 'gemini-omni-flash-preview');
        $payload = [
            'model' => $model,
            'input' => [
                ['type' => 'image', 'data' => $image['base64'], 'mime_type' => $image['mime']],
                ['type' => 'text',  'text' => $prompt],
            ],
            // uri delivery: videos routinely exceed the 4MB inline cap.
            'response_format'   => ['type' => 'video', 'aspect_ratio' => $aspectRatio, 'delivery' => 'uri'],
            'generation_config' => ['video_config' => ['task' => 'image_to_video']],
        ];
        $res = Http::timeout(300)->post(self::API_BASE . "/interactions?key={$this->apiKey}", $payload);
        if (! $res->ok()) {
            Log::warning('[gemini omni start] '.$res->status().' '.Str::limit($res->body(), 500));
            throw new RuntimeException('Gemini Omni API error: '.$res->status());
        }
        // Omni bills per output second; clips are currently ~10s.
        $seconds = (float) env('AI_VIDEO_EST_SECONDS', 10);
        $this->logUsage('video', $model, $seconds, $seconds * (float) env('AI_COST_VIDEO_PER_SEC', 0.10));
        return $res->json() ?? [];
    }

    /** Poll a previously started interaction. */
    public function getInteraction(string $id): array
    {
        $this->requireKey();
        $res = Http::timeout(30)->get(self::API_BASE . "/interactions/{$id}", ['key' => $this->apiKey]);
        if (! $res->ok()) {
            Log::warning('[gemini omni poll] '.$res->status().' '.Str::limit($res->body(), 500));
            throw new RuntimeException('Gemini Omni poll error: '.$res->status());
        }
        return $res->json() ?? [];
    }

    /**
     * Pull the video part out of an interaction response.
     * @return array{uri: ?string, data: ?string, mime: string}|null
     */
    public function extractVideoPart(array $interaction): ?array
    {
        foreach (($interaction['steps'] ?? []) as $step) {
            if (($step['type'] ?? '') !== 'model_output') continue;
            foreach (($step['content'] ?? []) as $c) {
                if (($c['type'] ?? '') === 'video') {
                    return [
                        'uri'  => $c['uri']  ?? null,
                        'data' => $c['data'] ?? null,
                        'mime' => $c['mime_type'] ?? 'video/mp4',
                    ];
                }
            }
        }
        if (! empty($interaction['output_video'])) {
            $v = $interaction['output_video'];
            return ['uri' => $v['uri'] ?? null, 'data' => $v['data'] ?? null, 'mime' => $v['mime_type'] ?? 'video/mp4'];
        }
        return null;
    }

    /** Download a Google-hosted file (Omni uri delivery). */
    public function downloadFile(string $uri): ?array
    {
        $this->requireKey();
        set_time_limit(180);
        $sep = str_contains($uri, '?') ? '&' : '?';
        $res = Http::timeout(150)->get($uri . $sep . 'key=' . $this->apiKey);
        if (! $res->ok()) {
            Log::warning('[gemini file download] '.$res->status().' '.Str::limit($res->body(), 300));
            return null;
        }
        return ['bytes' => $res->body(), 'mime' => $res->header('Content-Type') ?: 'video/mp4'];
    }

    /** Append a row to the ai_usage_logs cost ledger. Never blocks the call. */
    private function logUsage(string $kind, ?string $model, float $units, float $cost): void
    {
        try {
            \App\Models\AiUsageLog::create([
                'customer_id' => self::$usageContext['customer_id'] ?? null,
                'surface'     => self::$usageContext['surface'] ?? 'other',
                'kind'        => $kind,
                'model'       => $model,
                'units'       => $units,
                'cost'        => $cost,
            ]);
        } catch (\Throwable $e) {
            Log::warning('[ai usage log] '.$e->getMessage());
        }
    }

    private function requireKey(): void
    {
        if (empty($this->apiKey)) {
            throw new RuntimeException('GOOGLE_AI_API_KEY is not set.');
        }
    }

    /**
     * Convert our tool definitions (which use OpenAPI-ish `parameters` blocks)
     * into Gemini functionDeclarations.
     */
    private function toolDefsToFunctionDeclarations(array $toolDefs): array
    {
        return array_map(function (array $def) {
            return [
                'name'        => $def['name'],
                'description' => $def['description'] ?? '',
                'parameters'  => [
                    'type'       => 'object',
                    'properties' => $def['parameters']['properties'] ?? new \stdClass(),
                    'required'   => $def['parameters']['required'] ?? [],
                ],
            ];
        }, $toolDefs);
    }

    /**
     * Translate our internal message log into the contents[] format Gemini
     * expects. System messages get merged into system_instruction.
     */
    private function buildPayload(array $messages, array $functionDeclarations): array
    {
        $systemChunks = [];
        $contents = [];
        foreach ($messages as $m) {
            $role = $m['role'] ?? 'user';
            if ($role === 'system') {
                $systemChunks[] = $m['content'] ?? '';
                continue;
            }
            if ($role === 'user') {
                $contents[] = ['role' => 'user', 'parts' => [['text' => (string) ($m['content'] ?? '')]]];
                continue;
            }
            if ($role === 'assistant') {
                $parts = [];
                if (! empty($m['content'])) $parts[] = ['text' => $m['content']];
                foreach ($m['tool_calls'] ?? [] as $tc) {
                    $parts[] = ['functionCall' => [
                        'name' => $tc['name'],
                        'args' => $tc['arguments'] ?? new \stdClass(),
                    ]];
                }
                if (count($parts)) $contents[] = ['role' => 'model', 'parts' => $parts];
                continue;
            }
            if ($role === 'tool' && ! empty($m['tool_results'])) {
                $parts = [];
                foreach ($m['tool_results'] as $tr) {
                    $parts[] = ['functionResponse' => [
                        'name'     => $tr['name'],
                        'response' => $this->slimToolResult($tr['result'] ?? [], $tr['name'] ?? ''),
                    ]];
                }
                $contents[] = ['role' => 'user', 'parts' => $parts];
            }
        }

        $payload = [
            'system_instruction' => ['parts' => [['text' => implode("\n\n", array_filter($systemChunks))]]],
            'contents'           => $contents,
            'generationConfig'   => [
                'temperature'     => 0.75,
                'topP'            => 0.95,
                'maxOutputTokens' => 8192,
            ],
        ];
        if (count($functionDeclarations)) {
            $payload['tools'] = [['functionDeclarations' => $functionDeclarations]];
            $payload['toolConfig'] = ['functionCallingConfig' => ['mode' => 'AUTO']];
        }
        return $payload;
    }

    /**
     * Big product payloads break Gemini follow-up turns. Trim the tool
     * response payload to a small subset that keeps the model context
     * useful. Mirrors the Next.js trimToolResultForGemini().
     */
    private function slimToolResult(array $result, string $toolName): array
    {
        if (empty($result['success'])) return $result;
        $data = $result['data'] ?? [];
        $slim = function (array $p) {
            return [
                'id'        => $p['id'] ?? null,
                'handle'    => $p['handle'] ?? null,
                'title'     => $p['title'] ?? null,
                'price'     => $p['price'] ?? null,
                'price_label' => $p['price_label'] ?? null,
                'inStock'   => $p['inStock'] ?? null,
                'thumbnail' => isset($p['thumbnail']) ? substr((string) $p['thumbnail'], 0, 240) : null,
            ];
        };
        if (in_array($toolName, ['search_products', 'get_recommendations'], true)) {
            $key = array_key_exists('products', $data) ? 'products' : 'recommendations';
            $arr = $data[$key] ?? [];
            $slimArr = array_map($slim, array_slice($arr, 0, 12));
            $data[$key] = $slimArr;
            $data['_agent_note'] = "Showing ".count($slimArr).' of '.count($arr).' items (truncated for the model).';
            $result['data'] = $data;
        }
        if ($toolName === 'view_product' && ! empty($data['product'])) {
            $data['product'] = $slim($data['product']);
            $result['data'] = $data;
        }
        return $result;
    }
}
