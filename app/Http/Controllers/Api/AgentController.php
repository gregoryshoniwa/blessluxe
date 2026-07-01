<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cart;
use App\Services\AI\AgentContext;
use App\Services\AI\AiConfig;
use App\Services\AI\GeminiService;
use App\Services\AI\MemoryManager;
use App\Services\AI\ShoppingAgent;
use App\Services\AI\Tools\ToolRegistry;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Storefront-facing LUXE agent endpoints.
 *
 *   POST /api/agent              — full chat turn (user text + history → answer)
 *   POST /api/agent/opening      — one-shot greeting
 *   GET  /api/agent/history      — recent messages for the session
 *   POST /api/agent/execute-tool — server-side tool proxy (voice client)
 *   POST /api/agent/interactions — telemetry write
 *   POST /api/agent/memory       — persist a memory
 *   GET  /api/agent/memory       — recall memories
 *   POST /api/agent/preferences  — upsert preferences
 *   GET  /api/agent/preferences  — read preferences
 *   GET  /api/agent/conversations — list past conversations
 *   GET  /api/agent/config       — public config payload (model, voice model, key flag)
 */
class AgentController extends Controller
{
    public function __construct(
        private ShoppingAgent $agent,
        private GeminiService $gemini,
        private ToolRegistry $tools,
        private MemoryManager $memory,
    ) {}

    public function send(Request $request)
    {
        $data = $request->validate([
            'text'      => ['required', 'string', 'max:4000'],
            'session_id'=> ['nullable', 'string', 'max:80'],
            'history'   => ['nullable', 'array'],
        ]);
        if (! $this->gemini->isConfigured()) {
            return response()->json(['error' => 'AI is not configured. Set GOOGLE_AI_API_KEY.'], 503);
        }
        $context = $this->buildContext($request, $data['session_id'] ?? null);
        $resp = $this->agent->processInput($data['text'], $context, $data['history'] ?? []);
        return $resp;
    }

    public function opening(Request $request)
    {
        $data = $request->validate(['session_id' => ['nullable', 'string', 'max:80']]);
        if (! $this->gemini->isConfigured()) {
            return ['text' => 'Welcome to BLESSLUXE. ✨ What are you in the mood for today?'];
        }
        $context = $this->buildContext($request, $data['session_id'] ?? null);
        return $this->agent->processOpeningTurn($context);
    }

    public function history(Request $request)
    {
        $sessionId = $request->query('session_id');
        if (! $sessionId) return ['messages' => []];
        $conv = DB::table('ai_conversations')->where('session_id', $sessionId)->first();
        if (! $conv) return ['messages' => []];
        return ['conversation_id' => $conv->id, 'messages' => $this->memory->recentMessages($conv->id, 60)];
    }

    /**
     * Voice client calls this when Gemini Live emits a functionCall — the
     * browser forwards it here so the same PHP ToolRegistry runs (no JS
     * duplication, no client-side DB credentials). Each tool's own
     * `execute()` enforces auth (e.g. wishlist writes require sign-in).
     */
    public function executeTool(Request $request)
    {
        $data = $request->validate([
            'name'       => ['required', 'string'],
            'arguments'  => ['array'],
            'session_id' => ['nullable', 'string', 'max:80'],
        ]);
        $context = $this->buildContext($request, $data['session_id'] ?? null);
        return $this->tools->execute($data['name'], $data['arguments'] ?? [], $context);
    }

    public function interactions(Request $request)
    {
        $data = $request->validate([
            'type'         => ['required', 'string', 'max:32'],
            'session_id'   => ['nullable', 'string', 'max:80'],
            'product_id'   => ['nullable', 'string'],
            'category'     => ['nullable', 'string'],
            'search_query' => ['nullable', 'string'],
            'metadata'     => ['nullable', 'array'],
        ]);
        $context = $this->buildContext($request, $data['session_id'] ?? null);
        $this->memory->trackInteraction($context, $data['type'], [
            'product_id'   => $data['product_id'] ?? null,
            'category'     => $data['category'] ?? null,
            'search_query' => $data['search_query'] ?? null,
            'metadata'     => $data['metadata'] ?? null,
        ]);
        return ['ok' => true];
    }

    public function storeMemory(Request $request)
    {
        if (! Auth::guard('customer')->check()) abort(response()->json(['error' => 'Sign in required.'], 401));
        $data = $request->validate([
            'content' => ['required', 'string', 'max:2000'],
            'type'    => ['nullable', 'string', 'max:32'],
        ]);
        $this->memory->storeMemory(Auth::guard('customer')->id(), $data['content'], $data['type'] ?? 'fact');
        return ['ok' => true];
    }

    public function recallMemory(Request $request)
    {
        if (! Auth::guard('customer')->check()) return ['memories' => []];
        $q = (string) $request->query('q', '');
        $customerId = Auth::guard('customer')->id();
        $query = DB::table('ai_customer_memories')->where('customer_id', $customerId);
        if ($q !== '') $query->where('content', 'like', '%'.$q.'%');
        $rows = $query->orderByDesc('created_at')->limit(20)->get(['id', 'content', 'content_type', 'created_at']);
        return ['memories' => $rows];
    }

    public function preferences(Request $request)
    {
        if (! Auth::guard('customer')->check()) return ['preferences' => null];
        $row = DB::table('ai_customer_preferences')->where('customer_id', Auth::guard('customer')->id())->first();
        return ['preferences' => $row];
    }

    public function setPreferences(Request $request)
    {
        if (! Auth::guard('customer')->check()) abort(response()->json(['error' => 'Sign in required.'], 401));
        $data = $request->validate([
            'favorite_colors'  => ['nullable', 'array'],
            'favorite_styles'  => ['nullable', 'array'],
            'preferred_fits'   => ['nullable', 'array'],
            'avoided_styles'   => ['nullable', 'array'],
            'top_size'         => ['nullable', 'string', 'max:16'],
            'bottom_size'      => ['nullable', 'string', 'max:16'],
            'dress_size'       => ['nullable', 'string', 'max:16'],
            'shoe_size'        => ['nullable', 'string', 'max:16'],
            'budget_min'       => ['nullable', 'integer'],
            'budget_max'       => ['nullable', 'integer'],
            'style_profile'    => ['nullable', 'string', 'max:2000'],
        ]);
        $row = collect($data)->map(fn ($v) => is_array($v) ? json_encode($v) : $v)->all();
        $row['customer_id'] = Auth::guard('customer')->id();
        $row['updated_at'] = now();
        DB::table('ai_customer_preferences')->updateOrInsert(['customer_id' => $row['customer_id']], $row);
        return ['ok' => true];
    }

    /**
     * POST /api/store/agent/reset
     *
     * Ends the current conversation (marks the row ended_at, keeps history
     * for later recall) and returns a fresh session id the client should
     * use going forward.
     */
    public function reset(Request $request)
    {
        $sessionId = $request->input('session_id');
        if ($sessionId) {
            DB::table('ai_conversations')
                ->where('session_id', $sessionId)
                ->whereNull('ended_at')
                ->update(['ended_at' => now(), 'updated_at' => now()]);
        }
        return ['session_id' => 'sess_' . Str::random(20)];
    }

    public function conversations(Request $request)
    {
        if (! Auth::guard('customer')->check()) return ['conversations' => []];
        $rows = DB::table('ai_conversations')
            ->where('customer_id', Auth::guard('customer')->id())
            ->orderByDesc('started_at')
            ->limit(20)
            ->get(['id', 'session_id', 'summary', 'sentiment', 'started_at', 'ended_at']);
        return ['conversations' => $rows];
    }

    /**
     * Public config the SPA needs to bootstrap the chat widget. Includes
     * the Gemini Live model name and the API key (because Live's WebSocket
     * auth is in the URL — caller still must respect Google's billing
     * quotas).
     */
    public function config()
    {
        return [
            'enabled'    => $this->gemini->isConfigured(),
            'model'      => AiConfig::model(),
            'live_model' => AiConfig::liveModel(),
            'api_key'    => AiConfig::apiKey(), // accepted client-side exposure per project decision
        ];
    }

    /**
     * Returns the voice-mode system instruction (LUXE_GEMINI_LIVE_CORE +
     * customer profile prelude when signed in) plus the tool list.
     * The voice client uses this in its setup message.
     */
    public function liveSetup(Request $request)
    {
        $customer = Auth::guard('customer')->user();
        $prelude = $customer
            ? "## CUSTOMER PROFILE (BLESSLUXE account — same rules as text chat)\n"
                . "Name: " . trim(($customer->first_name ?? '') . ' ' . ($customer->last_name ?? '')) . "\n"
                . "Email: {$customer->email}\n"
                . "You may greet by first name and answer \"what's my name?\" using the first name above. "
                . "Do not refuse as \"privacy\" for data listed here — it is their session account context.\n\n"
            : "## GUEST\nDo not claim to know their name, email, or account unless they said it in this chat.\n\n";
        return [
            'system_instruction' => $prelude . AiConfig::LUXE_GEMINI_LIVE_CORE,
            'tools'              => $this->tools->definitions(),
        ];
    }

    private function buildContext(Request $request, ?string $sessionId): AgentContext
    {
        $sessionId = $sessionId ?: ('sess_' . Str::random(20));
        $customer = Auth::guard('customer')->user();
        // Carts live on the session, not on the customer row — same lookup
        // the storefront CartController uses so the agent operates on the
        // same bag the customer sees.
        $cartId = $request->session()->get('cart_id');
        $cart = $cartId ? Cart::find($cartId) : null;
        return new AgentContext(
            sessionId: $sessionId,
            customer:  $customer,
            cart:      $cart,
        );
    }
}
