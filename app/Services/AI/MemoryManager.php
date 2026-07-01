<?php

namespace App\Services\AI;

use App\Models\AiConversation;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Reads + writes the AI conversation/message/memory tables. Pure storage —
 * no model calls live here; the agent core orchestrates everything.
 */
class MemoryManager
{
    /** Find or create the row for this session and return it. */
    public function ensureConversation(AgentContext $context): AiConversation
    {
        $conv = AiConversation::query()->where('session_id', $context->sessionId)->first();
        if ($conv) return $conv;
        return AiConversation::create([
            'id'          => 'conv_' . Str::random(20),
            'session_id'  => $context->sessionId,
            'customer_id' => $context->customer?->id,
            'started_at'  => now(),
        ]);
    }

    public function addMessage(
        string $conversationId,
        string $role,
        string $content,
        ?array $tool_calls = null,
        ?array $tool_results = null,
        ?array $products = null,
        ?array $suggestions = null,
        ?array $ui_updates = null,
        ?array $metadata = null,
    ): void {
        DB::table('ai_messages')->insert([
            'id'              => 'msg_' . Str::random(20),
            'conversation_id' => $conversationId,
            'role'            => $role,
            'content'         => $content,
            'tool_calls'      => $tool_calls   ? json_encode($tool_calls)   : null,
            'tool_results'    => $tool_results ? json_encode($tool_results) : null,
            'products'        => $products     ? json_encode($products)     : null,
            'suggestions'     => $suggestions  ? json_encode($suggestions)  : null,
            'ui_updates'      => $ui_updates   ? json_encode($ui_updates)   : null,
            'metadata'        => $metadata     ? json_encode($metadata)     : null,
            'created_at'      => now(),
        ]);
    }

    public function recentMessages(string $conversationId, int $limit = 30): array
    {
        return DB::table('ai_messages')
            ->where('conversation_id', $conversationId)
            ->orderBy('created_at')
            ->orderBy('id')
            ->limit($limit)
            ->get(['id', 'role', 'content', 'tool_calls', 'tool_results', 'products', 'suggestions', 'ui_updates', 'created_at'])
            ->map(fn ($r) => [
                'id'           => $r->id,
                'role'         => $r->role,
                'content'      => $r->content,
                'tool_calls'   => $r->tool_calls   ? json_decode($r->tool_calls,   true) : null,
                'tool_results' => $r->tool_results ? json_decode($r->tool_results, true) : null,
                'products'     => $r->products     ? json_decode($r->products,     true) : null,
                'suggestions'  => $r->suggestions  ? json_decode($r->suggestions,  true) : null,
                'ui_updates'   => $r->ui_updates   ? json_decode($r->ui_updates,   true) : null,
                'created_at'   => $r->created_at,
            ])
            ->all();
    }

    public function storeMemory(string $customerId, string $content, string $type = 'fact', ?array $metadata = null): void
    {
        DB::table('ai_customer_memories')->insert([
            'id'           => 'mem_' . Str::random(20),
            'customer_id'  => $customerId,
            'content'      => $content,
            'content_type' => $type,
            'metadata'     => $metadata ? json_encode($metadata) : null,
            'created_at'   => now(),
        ]);
    }

    public function trackInteraction(AgentContext $context, string $type, array $payload = []): void
    {
        DB::table('ai_customer_interactions')->insert([
            'id'              => 'int_' . Str::random(20),
            'customer_id'     => $context->customer?->id,
            'session_id'      => $context->sessionId,
            'interaction_type'=> $type,
            'product_id'      => $payload['product_id'] ?? null,
            'category'        => $payload['category'] ?? null,
            'search_query'    => $payload['search_query'] ?? null,
            'metadata'        => ! empty($payload) ? json_encode($payload) : null,
            'created_at'      => now(),
        ]);
    }
}
