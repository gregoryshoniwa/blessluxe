import type {
  AgentContext,
  AgentInput,
  AgentResponse,
  ChatMessage,
  CustomerProfile,
  Memory,
  ProductSummary,
  ToolCall,
  ToolDefinition,
  UIUpdate,
} from '../types';
import { AI_CONFIG } from '../config';
import { ContextBuilder } from './context-builder';
import { ActionExecutor } from './action-executor';
import { PreferenceLearner } from './preference-learner';
import { ConversationStore } from '../memory/conversation-store';
import { VectorStore } from '../memory/vector-store';
import { executeTool, getToolDefinitions } from '../tools';
import { callGeminiWithTools, type GeminiLLMMessage } from '../gemini-llm';
import {
  loadCustomerProfileForAgent,
  loadMinimalCustomerProfileForAgent,
} from './customer-intelligence';

type LLMMessage = GeminiLLMMessage;

export class ShoppingAgent {
  private contextBuilder = new ContextBuilder();
  private actionExecutor = new ActionExecutor();
  private preferenceLearner = new PreferenceLearner();
  private conversationStore = new ConversationStore();
  private vectorStore = new VectorStore();

  async processInput(input: AgentInput): Promise<AgentResponse> {
    if (input.opening) {
      return this.processOpeningTurn(input);
    }

    const userMessage = input.text ?? '';
    if (!userMessage.trim()) {
      return { text: "Hello! ✨ I'm LUXE, your personal shopping assistant at BLESSLUXE. How can I help you today?" };
    }

    let profile: CustomerProfile | null = null;
    if (input.context.customerId) {
      try {
        profile = await loadCustomerProfileForAgent(input.context.customerId);
      } catch (err) {
        console.warn('[ShoppingAgent] profile load skipped:', err);
      }
      if (!profile) {
        try {
          profile = await loadMinimalCustomerProfileForAgent(input.context.customerId);
        } catch (err) {
          console.warn('[ShoppingAgent] minimal profile load skipped:', err);
        }
      }
    }

    const systemPrompt = this.contextBuilder.buildSystemPrompt(profile, input.context);

    let relevantMemories: Memory[] = [];
    if (input.context.customerId) {
      try {
        relevantMemories = await this.vectorStore.search(input.context.customerId, userMessage, 5);
      } catch (err) {
        console.warn('[ShoppingAgent] vector memory search skipped:', err);
      }
    }

    // Prefer client-supplied history: it matches the UI and includes voice turns (never persisted here).
    // DB-only would drop voice context and can throw if Postgres is down — both caused generic API errors.
    let recentMessages: ChatMessage[] = [];
    if (input.clientMessageHistory?.length) {
      recentMessages = input.clientMessageHistory.map((m, i) => ({
        id: `client_${i}`,
        role: m.role,
        content: m.content,
        createdAt: new Date(),
      })) as ChatMessage[];
    } else {
      try {
        recentMessages = await this.conversationStore.getRecentMessages(input.context.sessionId, 50);
      } catch (err) {
        console.warn('[ShoppingAgent] getRecentMessages failed (using empty history):', err);
      }
    }

    const messages = this.buildMessages(systemPrompt, relevantMemories, recentMessages, userMessage);

    const response = await this.executeWithTools(messages, input.context, userMessage);

    await this.saveToMemory(input.context, userMessage, response);

    if (input.context.customerId) {
      try {
        await this.preferenceLearner.learn(input.context.customerId, userMessage, response);
      } catch (err) {
        console.warn('[ShoppingAgent] preference learn skipped:', err);
      }
    }

    return response;
  }

  /** LUXE opens the thread — no customer message, no tool calls. */
  private async processOpeningTurn(input: AgentInput): Promise<AgentResponse> {
    let profile: CustomerProfile | null = null;
    if (input.context.customerId) {
      try {
        profile = await loadCustomerProfileForAgent(input.context.customerId);
      } catch (err) {
        console.warn('[ShoppingAgent] profile load skipped (opening):', err);
      }
      if (!profile) {
        try {
          profile = await loadMinimalCustomerProfileForAgent(input.context.customerId);
        } catch (err) {
          console.warn('[ShoppingAgent] minimal profile load skipped (opening):', err);
        }
      }
    }

    const systemPrompt = this.contextBuilder.buildSystemPrompt(profile, input.context);

    let recentMessages: ChatMessage[] = [];
    if (input.clientMessageHistory?.length) {
      recentMessages = input.clientMessageHistory.map((m, i) => ({
        id: `client_${i}`,
        role: m.role,
        content: m.content,
        createdAt: new Date(),
      })) as ChatMessage[];
    } else {
      try {
        recentMessages = await this.conversationStore.getRecentMessages(input.context.sessionId, 50);
      } catch (err) {
        console.warn('[ShoppingAgent] getRecentMessages failed (opening):', err);
      }
    }

    const openingUserTurn =
      'The customer just opened the LUXE chat panel. You speak first. Reply with a warm greeting in 1–3 sentences only. ' +
      'Use their first name from CUSTOMER PROFILE when it is present. Do not call tools in this turn — prose only.';

    const messages = this.buildMessages(systemPrompt, [], recentMessages, openingUserTurn);

    const tools: ToolDefinition[] = [];
    let llmResponse = await this.callLLM(messages, tools);
    if (llmResponse.toolCalls?.length) {
      llmResponse = { content: llmResponse.content || '', toolCalls: undefined };
    }

    let text = (llmResponse.content || '').trim();
    if (!text) {
      text =
        profile?.firstName && profile.firstName !== 'there'
          ? `Welcome back, ${profile.firstName}! ✨ I'm LUXE — what can I help you find today?`
          : "Welcome to BLESSLUXE! ✨ I'm LUXE — tell me what you're shopping for, or ask what's new.";
    }

    const response: AgentResponse = {
      text,
      suggestions: this.generateSuggestions(text),
    };

    await this.saveToMemory(input.context, '', response, { persistUserTurn: false });

    return response;
  }

  private shouldAutoAddAfterSearch(
    lastUserText: string,
    calls: ToolCall[],
    products: ProductSummary[]
  ): boolean {
    const t = lastUserText.toLowerCase();
    if (!/\badd\b/.test(t) || !/\bcart\b/.test(t)) return false;
    if (!calls.some((c) => c.name === 'search_products')) return false;
    return products.length > 0;
  }

  private userIntentNeedsTools(text: string): boolean {
    const t = text.toLowerCase();
    return (
      /\badd\s+.*\s+(to\s+)?(my\s+)?cart\b/.test(t) ||
      /\b(search|find|show|looking\s+for)\b/.test(t) ||
      /\b(send|email)\b/.test(t) ||
      /\b(stock|inventory|in\s+stock)\b/.test(t) ||
      /\b(recommend|suggest)\b/.test(t)
    );
  }

  private async executeWithTools(
    messages: LLMMessage[],
    context: AgentContext,
    lastUserText: string
  ): Promise<AgentResponse> {
    const tools = getToolDefinitions();
    const currentMessages = [...messages];
    let iterations = 0;
    const allProducts: ProductSummary[] = [];
    const allUiUpdates: UIUpdate[] = [];

    while (iterations < AI_CONFIG.maxToolCalls) {
      let llmResponse = await this.callLLM(currentMessages, tools);

      if (
        !llmResponse.toolCalls?.length &&
        this.userIntentNeedsTools(lastUserText) &&
        iterations === 0
      ) {
        const nudge: LLMMessage[] = [
          ...currentMessages,
          {
            role: 'system',
            content:
              'The customer request requires calling tools (search_products, manage_cart, send_email, check_inventory, etc.). Do not reply with only prose — emit the matching function call(s) in this turn.',
          },
        ];
        llmResponse = await this.callLLM(nudge, tools);
      }

      if (!llmResponse.toolCalls?.length && this.userIntentNeedsTools(lastUserText) && iterations === 0) {
        llmResponse = this.getFallbackResponse(messages);
      }

      if (!llmResponse.toolCalls?.length) {
        let text = (llmResponse.content || '').trim();
        if (!text && allProducts.length > 0) {
          text = `Here ${allProducts.length === 1 ? 'is' : 'are'} ${allProducts.length} option(s) from our catalog — tap a card to open the product page.`;
        }
        if (!text && allUiUpdates.some((u) => u.type === 'add_to_cart')) {
          text = "That's been added to your cart — you can review it in the bag icon.";
        }
        if (!text) {
          text =
            llmResponse.content ||
            "I'm here to help — tell me what you'd like to shop for or ask me to search the catalog.";
        }
        return {
          text,
          products: allProducts.length > 0 ? allProducts : undefined,
          uiUpdates: allUiUpdates.length > 0 ? allUiUpdates : undefined,
          suggestions: this.generateSuggestions(text),
        };
      }

      let { results, uiUpdates } = await this.actionExecutor.executeToolCalls(
        llmResponse.toolCalls,
        context
      );
      const products = this.actionExecutor.extractProducts(results);
      allProducts.push(...products);
      allUiUpdates.push(...uiUpdates);

      const modelCalledCart = llmResponse.toolCalls.some((c) => c.name === 'manage_cart');
      if (
        !modelCalledCart &&
        this.shouldAutoAddAfterSearch(lastUserText, llmResponse.toolCalls, products)
      ) {
        const first = products[0];
        const vid = first?.variants?.[0]?.id;
        if (first?.id && vid) {
          const addRes = await executeTool(
            'manage_cart',
            {
              action: 'add',
              variant_id: vid,
              product_id: first.id,
              quantity: 1,
            },
            context
          );
          results = [
            ...results,
            {
              toolCallId: 'auto_add_cart',
              name: 'manage_cart',
              result: addRes,
            },
          ];
          if (addRes.uiAction) {
            allUiUpdates.push(addRes.uiAction);
          }
        }
      }

      currentMessages.push({
        role: 'assistant',
        content: llmResponse.content,
        toolCalls: llmResponse.toolCalls,
      });

      currentMessages.push({
        role: 'tool',
        content: JSON.stringify(results.map((r) => ({ id: r.toolCallId, name: r.name, result: r.result }))),
        toolResults: results.map((r) => ({ toolCallId: r.toolCallId, name: r.name, result: r.result })),
      });

      iterations++;
    }

    return {
      text:
        allProducts.length > 0
          ? `I found ${allProducts.length} product(s) — scroll the cards above. If something looks stuck, try your request again in one sentence.`
          : "I apologize, but I'm having trouble completing this request. Could you try rephrasing or simplifying what you need?",
      products: allProducts.length > 0 ? allProducts : undefined,
      uiUpdates: allUiUpdates.length > 0 ? allUiUpdates : undefined,
    };
  }

  /**
   * Gemini + function calling when `GOOGLE_AI_API_KEY` is set; otherwise keyword fallback.
   */
  private async callLLM(
    messages: LLMMessage[],
    tools: ToolDefinition[]
  ): Promise<{ content: string; toolCalls?: ToolCall[] }> {
    const hasKey = !!(process.env.GOOGLE_AI_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY);
    if (hasKey) {
      try {
        return await callGeminiWithTools(messages, tools);
      } catch (err) {
        console.error('[ShoppingAgent] Gemini call failed:', err);
      }
    }
    return this.getFallbackResponse(messages);
  }

  private getFallbackResponse(
    messages: LLMMessage[]
  ): { content: string; toolCalls?: ToolCall[] } {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const query = lastUser?.content?.toLowerCase() ?? '';

    if (query.includes('search') || query.includes('find') || query.includes('looking for') || query.includes('show me')) {
      const searchTerm = query.replace(/(?:search|find|looking for|show me)\s*/i, '').trim();
      return {
        content: `Let me search for "${searchTerm}" for you! ✨`,
        toolCalls: [{
          id: `call_${Date.now()}`,
          name: 'search_products',
          arguments: { query: searchTerm },
        }],
      };
    }

    if (query.includes('recommend') || query.includes('suggest') || query.includes('pick for me')) {
      return {
        content: "I'd love to find some pieces you'll adore! Let me pull up some recommendations ✨",
        toolCalls: [{
          id: `call_${Date.now()}`,
          name: 'get_recommendations',
          arguments: { type: 'for_you' },
        }],
      };
    }

    if (/\badd\b/.test(query) && /\bcart\b/.test(query)) {
      const quoted = query.match(/['"]([^'"]+)['"]/);
      const extracted =
        quoted?.[1]?.trim() ||
        query
          .replace(/.*\badd\b/i, '')
          .replace(/\bto\s+(my\s+)?cart\b.*$/i, '')
          .trim();
      const searchQuery = extracted.length >= 2 ? extracted : query;
      return {
        content: '',
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            name: 'search_products',
            arguments: { query: searchQuery, limit: 8 },
          },
        ],
      };
    }

    if (query.includes('cart')) {
      return {
        content: "Let me check your cart for you! 🛍️",
        toolCalls: [{
          id: `call_${Date.now()}`,
          name: 'manage_cart',
          arguments: { action: 'view' },
        }],
      };
    }

    if (query.includes('order') || query.includes('track')) {
      return {
        content: "I can help you track your order! Could you share the order number?",
      };
    }

    if (
      /\b(send|email)\b/.test(query) &&
      (query.includes('trend') ||
        /\b(product|recommend|catalog|arrival|pick|piece)s?\b/.test(query))
    ) {
      return {
        content: '',
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            name: 'get_recommendations',
            arguments: { type: 'trending', limit: 10 },
          },
        ],
      };
    }

    return {
      content: "Welcome to BLESSLUXE! ✨ I'm LUXE, your personal shopping assistant. I can help you find the perfect pieces, check on orders, manage your wishlist, and more. What can I do for you today?",
    };
  }

  private buildMessages(
    systemPrompt: string,
    memories: Memory[],
    recentMessages: ChatMessage[],
    userMessage: string
  ): LLMMessage[] {
    const msgs: LLMMessage[] = [{ role: 'system', content: systemPrompt }];

    if (memories.length > 0) {
      msgs.push({
        role: 'system',
        content: `## RELEVANT MEMORIES\n${memories.map((m) => `- [${m.type}] ${m.content}`).join('\n')}`,
      });
    }

    for (const msg of recentMessages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        msgs.push({ role: msg.role, content: msg.content });
      }
    }

    msgs.push({ role: 'user', content: userMessage });
    return msgs;
  }

  private async saveToMemory(
    context: AgentContext,
    userMessage: string,
    response: AgentResponse,
    opts?: { persistUserTurn?: boolean }
  ): Promise<void> {
    const persistUser = opts?.persistUserTurn !== false;

    try {
      if (persistUser && userMessage.trim().length > 0) {
        await this.conversationStore.addMessage(context.sessionId, 'user', userMessage, undefined, context.customerId);
      }
      await this.conversationStore.addMessage(context.sessionId, 'assistant', response.text, {
        products: response.products,
        suggestions: response.suggestions,
        uiUpdates: response.uiUpdates,
      }, context.customerId);
    } catch (err) {
      console.warn('[ShoppingAgent] conversation persist skipped:', err);
    }

    if (context.customerId) {
      try {
        if (persistUser && userMessage.trim().length > 0) {
          await this.vectorStore.store(context.customerId, userMessage, 'conversation');
        }
        await this.vectorStore.store(context.customerId, response.text, 'conversation');
      } catch (err) {
        console.warn('[ShoppingAgent] vector store skipped:', err);
      }
    }
  }

  private generateSuggestions(responseText: string): string[] {
    const suggestions: string[] = [];
    const lower = responseText.toLowerCase();

    if (lower.includes('dress') || lower.includes('outfit')) {
      suggestions.push('Show me more dresses');
      suggestions.push('What accessories go with this?');
    }
    if (lower.includes('recommend') || lower.includes('suggest')) {
      suggestions.push('Show me something different');
      suggestions.push('Any items on sale?');
    }
    if (lower.includes('cart') || lower.includes('added')) {
      suggestions.push('View my cart');
      suggestions.push('Proceed to checkout');
    }

    if (suggestions.length === 0) {
      suggestions.push('Show me new arrivals');
      suggestions.push('What\'s trending?');
      suggestions.push('Help me find an outfit');
    }

    return suggestions.slice(0, 3);
  }
}
