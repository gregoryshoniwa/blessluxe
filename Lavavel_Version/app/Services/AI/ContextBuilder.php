<?php

namespace App\Services\AI;

use App\Models\Customer;
use App\Models\Order;
use Illuminate\Support\Facades\DB;

/**
 * Assembles the LUXE system prompt for a given customer + session.
 *
 * Always starts with the canonical LUXE_BASE_PROMPT, then layers:
 *   - CUSTOMER PROFILE (name, email, sizes, last orders) when signed in
 *   - RECENT INTERACTIONS (last 5 searches / views)
 *   - RECALLED MEMORIES (top FULLTEXT matches for the user's current turn)
 */
class ContextBuilder
{
    public function build(AgentContext $context, string $userTurn): string
    {
        $chunks = [AiConfig::LUXE_BASE_PROMPT];

        $customer = $context->customer;
        if ($customer) {
            $chunks[] = $this->customerProfileBlock($customer);
        } else {
            $chunks[] = "## GUEST\nDo not claim to know their name, email, or account unless they said it in this chat.";
        }

        $recent = $this->recentInteractions($context);
        if ($recent) $chunks[] = $recent;

        if ($customer && trim($userTurn) !== '') {
            $memories = $this->recallMemories($customer->id, $userTurn);
            if ($memories) $chunks[] = $memories;
        }

        return implode("\n\n", $chunks);
    }

    private function customerProfileBlock(Customer $c): string
    {
        $firstName = $c->first_name ?: explode(' ', (string) $c->email)[0];
        $lastName  = $c->last_name ?: '';
        $orders = Order::query()
            ->where('customer_id', $c->id)
            ->orderByDesc('created_at')
            ->limit(5)
            ->get(['order_number', 'total', 'status', 'created_at']);

        $orderSummary = $orders->count()
            ? $orders->map(fn ($o) => "  - {$o->order_number} · {$o->status} · $" . number_format($o->total / 100, 2) . " · " . optional($o->created_at)->format('Y-m-d'))->implode("\n")
            : '  - (no orders yet)';

        $prefs = DB::table('ai_customer_preferences')->where('customer_id', $c->id)->first();
        $prefLines = [];
        if ($prefs) {
            if ($prefs->favorite_colors) $prefLines[] = 'Favorite colours: '.implode(', ', json_decode($prefs->favorite_colors, true) ?? []);
            if ($prefs->favorite_styles) $prefLines[] = 'Styles: '.implode(', ', json_decode($prefs->favorite_styles, true) ?? []);
            if ($prefs->top_size || $prefs->bottom_size || $prefs->dress_size) {
                $prefLines[] = 'Sizes: '.implode(' / ', array_filter([
                    $prefs->top_size ? "top {$prefs->top_size}" : null,
                    $prefs->bottom_size ? "bottom {$prefs->bottom_size}" : null,
                    $prefs->dress_size ? "dress {$prefs->dress_size}" : null,
                ]));
            }
            if ($prefs->budget_max) $prefLines[] = 'Budget: up to $' . number_format($prefs->budget_max / 100, 2);
        }
        $prefBlock = $prefLines ? "\nPreferences:\n  - ".implode("\n  - ", $prefLines) : '';

        return "## CUSTOMER PROFILE (BLESSLUXE account)\n" .
            "firstName: {$firstName}\n" .
            ($lastName ? "lastName: {$lastName}\n" : '') .
            "email: {$c->email}\n" .
            "loyalty_tier: {$c->loyalty_tier}\n" .
            "loyalty_points: " . (int) $c->loyalty_points . "\n" .
            "Recent orders:\n{$orderSummary}" .
            $prefBlock;
    }

    private function recentInteractions(AgentContext $context): ?string
    {
        $rows = DB::table('ai_customer_interactions')
            ->when($context->customer, fn ($q) => $q->where('customer_id', $context->customer->id))
            ->when(! $context->customer, fn ($q) => $q->where('session_id', $context->sessionId))
            ->orderByDesc('created_at')
            ->limit(8)
            ->get();
        if ($rows->isEmpty()) return null;
        $lines = $rows->map(function ($r) {
            $detail = $r->search_query ?: $r->product_id ?: $r->category;
            return "  - {$r->interaction_type}: ".trim((string) $detail);
        })->implode("\n");
        return "## RECENT ACTIVITY (this session)\n{$lines}";
    }

    private function recallMemories(string $customerId, string $userTurn): ?string
    {
        $kw = $this->keywordsFor($userTurn);
        if ($kw === '') return null;
        try {
            $rows = DB::select(
                'SELECT content, created_at FROM ai_customer_memories WHERE customer_id = ? AND MATCH(content) AGAINST (? IN NATURAL LANGUAGE MODE) ORDER BY created_at DESC LIMIT ?',
                [$customerId, $kw, AiConfig::MEMORY_RECALL_LIMIT],
            );
        } catch (\Throwable) {
            $rows = DB::table('ai_customer_memories')
                ->where('customer_id', $customerId)
                ->where('content', 'like', '%'.substr($kw, 0, 40).'%')
                ->orderByDesc('created_at')
                ->limit(AiConfig::MEMORY_RECALL_LIMIT)
                ->get(['content', 'created_at'])->all();
        }
        if (! $rows) return null;
        $lines = collect($rows)->map(fn ($r) => '  - '.trim((string) $r->content))->implode("\n");
        return "## REMEMBERED FROM EARLIER CONVERSATIONS\n{$lines}";
    }

    private function keywordsFor(string $text): string
    {
        $text = strtolower($text);
        $text = preg_replace('/[^a-z0-9\s\-]+/', ' ', $text);
        $words = array_filter(explode(' ', $text), fn ($w) => strlen($w) > 2);
        return implode(' ', array_slice($words, 0, 8));
    }
}
