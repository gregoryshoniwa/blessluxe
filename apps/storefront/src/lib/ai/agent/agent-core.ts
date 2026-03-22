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
import { getToolDefinitions } from '../tools';
import { callGeminiWithTools, type GeminiLLMMessage } from '../gemini-llm';
import { loadCustomerProfileForAgent } from './customer-intelligence';

type LLMMessage = GeminiLLMMessage;

export class ShoppingAgent {
  private contextBuilder = new ContextBuilder();
  private actionExecutor = new ActionExecutor();
  private preferenceLearner = new PreferenceLearner();
  private conversationStore = new ConversationStore();
  private vectorStore = new VectorStore();

  async processInput(input: AgentInput): Promise<AgentResponse> {
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
        recentMessages = await this.conversationStore.getRecentMessages(input.context.sessionId, 20);
      } catch (err) {
        console.warn('[ShoppingAgent] getRecentMessages failed (using empty history):', err);
      }
    }

    const messages = this.buildMessages(systemPrompt, relevantMemories, recentMessages, userMessage);

    const response = await this.executeWithTools(messages, input.context);

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

  private async executeWithTools(
    messages: LLMMessage[],
    context: AgentContext
  ): Promise<AgentResponse> {
    const tools = getToolDefinitions();
    const currentMessages = [...messages];
    let iterations = 0;
    const allProducts: ProductSummary[] = [];
    const allUiUpdates: UIUpdate[] = [];

    while (iterations < AI_CONFIG.maxToolCalls) {
      const llmResponse = await this.callLLM(currentMessages, tools);

      if (!llmResponse.toolCalls?.length) {
        return {
          text: llmResponse.content,
          products: allProducts.length > 0 ? allProducts : undefined,
          uiUpdates: allUiUpdates.length > 0 ? allUiUpdates : undefined,
          suggestions: this.generateSuggestions(llmResponse.content),
        };
      }

      const { results, uiUpdates } = await this.actionExecutor.executeToolCalls(
        llmResponse.toolCalls,
        context
      );
      const products = this.actionExecutor.extractProducts(results);
      allProducts.push(...products);
      allUiUpdates.push(...uiUpdates);

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
      text: "I apologize, but I'm having trouble completing this request. Could you try rephrasing or simplifying what you need?",
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
    if (hasKey && tools.length > 0) {
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
    response: AgentResponse
  ): Promise<void> {
    try {
      await this.conversationStore.addMessage(context.sessionId, 'user', userMessage);
      await this.conversationStore.addMessage(context.sessionId, 'assistant', response.text, {
        products: response.products,
        suggestions: response.suggestions,
        uiUpdates: response.uiUpdates,
      });
    } catch (err) {
      console.warn('[ShoppingAgent] conversation persist skipped:', err);
    }

    if (context.customerId) {
      try {
        await this.vectorStore.store(context.customerId, userMessage, 'conversation');
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
