<?php

namespace App\Services\AI;

use App\Services\AI\Tools\ToolRegistry;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The LUXE shopping agent loop.
 *
 *   processInput($userText, $context, $history)
 *     1. Persist user turn → ai_messages
 *     2. Build system prompt (ContextBuilder)
 *     3. Loop:
 *        a. Call Gemini with [system, ...history, userTurn, ...toolTurns]
 *        b. If response has tool calls → execute via ToolRegistry, log results,
 *           feed back as a tool turn. Cap at AiConfig::MAX_TOOL_CALLS.
 *        c. Otherwise → final answer.
 *     4. Persist assistant turn (with tool_calls + products + ui_updates).
 *     5. Return text + tool calls + product cards + ui_updates for the client.
 */
class ShoppingAgent
{
    public function __construct(
        private GeminiService $gemini,
        private ToolRegistry $tools,
        private ContextBuilder $contextBuilder,
        private MemoryManager $memory,
        private PreferenceLearner $preferences,
    ) {}

    /**
     * @return array{
     *   text: string,
     *   tool_calls: array,
     *   tool_results: array,
     *   products: array,
     *   suggestions: array,
     *   ui_updates: array,
     *   conversation_id: string,
     * }
     */
    public function processInput(string $userText, AgentContext $context, array $clientHistory = []): array
    {
        $conversation = $this->memory->ensureConversation($context);

        // Persist the inbound turn first so a crash mid-tool-call still has it.
        $this->memory->addMessage($conversation->id, 'user', $userText);

        $systemPrompt = $this->contextBuilder->build($context, $userText);
        $history = $this->messagesFromHistory($clientHistory, $conversation->id);

        $messages = [
            ['role' => 'system', 'content' => $systemPrompt],
            ...$history,
            ['role' => 'user', 'content' => $userText],
        ];

        $toolDefs = $this->tools->definitions();
        $accumulatedToolCalls = [];
        $accumulatedToolResults = [];
        $productCards = [];
        $uiUpdates = [];
        $finalText = '';

        for ($iter = 0; $iter < AiConfig::MAX_TOOL_CALLS; $iter++) {
            $resp = $this->gemini->chatWithTools($messages, $toolDefs);

            if (! empty($resp['tool_calls'])) {
                // Append the assistant turn (with tool_calls) and the tool turn (with results).
                $messages[] = ['role' => 'assistant', 'content' => $resp['content'] ?? '', 'tool_calls' => $resp['tool_calls']];

                $toolResults = [];
                foreach ($resp['tool_calls'] as $tc) {
                    $result = $this->tools->execute($tc['name'], $tc['arguments'] ?? [], $context);
                    $accumulatedToolCalls[] = $tc;
                    $accumulatedToolResults[] = ['name' => $tc['name'], 'result' => $result];
                    $toolResults[] = ['name' => $tc['name'], 'result' => $result];

                    // Surface product cards from search-y tools.
                    foreach (['products', 'recommendations'] as $key) {
                        if (! empty($result['data'][$key])) {
                            foreach ($result['data'][$key] as $p) $productCards[] = $p;
                        }
                    }
                    if (! empty($result['data']['product'])) $productCards[] = $result['data']['product'];
                    if (! empty($result['ui_action'])) $uiUpdates[] = $result['ui_action'];
                }
                $messages[] = ['role' => 'tool', 'tool_results' => $toolResults];
                continue;
            }

            $finalText = $resp['content'] ?? '';
            break;
        }

        if ($finalText === '') {
            $finalText = "I'm here when you want to keep going — what would you like to look at next?";
        }

        // De-dupe product cards by id while preserving order.
        $productCards = $this->dedupeProducts($productCards);

        // Persist the assistant turn.
        $this->memory->addMessage(
            $conversation->id,
            'assistant',
            $finalText,
            tool_calls: $accumulatedToolCalls ?: null,
            tool_results: $accumulatedToolResults ?: null,
            products: $productCards ?: null,
            ui_updates: $uiUpdates ?: null,
        );

        // Side-effect: nudge the preference learner with the user's turn.
        if ($context->customer) {
            $this->preferences->learnFromTurn($context->customer->id, $userText);
        }

        return [
            'text'         => $finalText,
            'tool_calls'   => $accumulatedToolCalls,
            'tool_results' => $accumulatedToolResults,
            'products'     => $productCards,
            'suggestions'  => [],
            'ui_updates'   => $uiUpdates,
            'conversation_id' => $conversation->id,
        ];
    }

    /**
     * Stream-friendly opener used to seed empty chats with a warm greeting
     * (no tools, so it's cheap + safe to fire on widget open).
     */
    public function processOpeningTurn(AgentContext $context): array
    {
        $systemPrompt = $this->contextBuilder->build($context, '');
        $resp = $this->gemini->chatWithTools(
            [
                ['role' => 'system', 'content' => $systemPrompt],
                ['role' => 'user', 'content' => '[Session start — speak first. Give a brief warm welcome in 1–2 sentences as LUXE. Use first name from CUSTOMER PROFILE if present. Prose only, no tools.]'],
            ],
            [],
        );
        $text = trim($resp['content'] ?? '');
        if ($text === '') $text = 'Welcome to BLESSLUXE. ✨ What are you in the mood for today?';
        return ['text' => $text];
    }

    /** @return list<array{role: string, content?: string, tool_calls?: array, tool_results?: array}> */
    private function messagesFromHistory(array $clientHistory, string $conversationId): array
    {
        // Prefer client-supplied history when provided (handles voice/text
        // hybrid sessions); otherwise pull from DB.
        if (count($clientHistory) > 0) {
            return collect($clientHistory)
                ->slice(-AiConfig::MAX_HISTORY_TURNS)
                ->map(fn ($m) => [
                    'role'    => $m['role'] ?? 'user',
                    'content' => (string) ($m['content'] ?? ''),
                ])
                ->values()
                ->all();
        }
        $rows = DB::table('ai_messages')
            ->where('conversation_id', $conversationId)
            ->orderBy('created_at')
            ->orderBy('id')
            ->limit(AiConfig::MAX_HISTORY_TURNS)
            ->get(['role', 'content']);
        return $rows->map(fn ($r) => [
            'role'    => $r->role,
            'content' => $r->content,
        ])->all();
    }

    private function dedupeProducts(array $products): array
    {
        $out = [];
        $seen = [];
        foreach ($products as $p) {
            $id = $p['id'] ?? null;
            if ($id && isset($seen[$id])) continue;
            if ($id) $seen[$id] = true;
            $out[] = $p;
            if (count($out) >= 16) break;
        }
        return $out;
    }
}
