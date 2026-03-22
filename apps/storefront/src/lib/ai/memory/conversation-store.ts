import type { ChatMessage, Conversation, MessageRole } from '../types';
import { execute, query, queryOne } from '@/lib/db';

interface StoredConversation extends Conversation {
  messages: ChatMessage[];
}

export class ConversationStore {
  async getOrCreate(sessionId: string, customerId?: string): Promise<StoredConversation> {
    const existing = await queryOne<{
      id: string;
      session_id: string;
      customer_id: string | null;
      summary: string | null;
      sentiment: string | null;
      topics: string[];
      products_discussed: string[];
      started_at: string;
      ended_at: string | null;
    }>(
      `SELECT * FROM ai_conversations WHERE session_id = $1`,
      [sessionId]
    );

    if (existing) {
      if (customerId && !existing.customer_id) {
        await execute(`UPDATE ai_conversations SET customer_id = $1 WHERE id = $2`, [customerId, existing.id]);
        existing.customer_id = customerId;
      }
      const messages = await this.loadMessages(existing.id);
      return {
        id: existing.id,
        customerId: existing.customer_id ?? undefined,
        sessionId: existing.session_id,
        startedAt: existing.started_at,
        endedAt: existing.ended_at ?? undefined,
        summary: existing.summary ?? undefined,
        sentiment: (existing.sentiment as Conversation['sentiment']) ?? undefined,
        topics: existing.topics ?? [],
        productsDiscussed: existing.products_discussed ?? [],
        messages,
      };
    }

    const row = await queryOne<{ id: string; started_at: string }>(
      `INSERT INTO ai_conversations (session_id, customer_id)
       VALUES ($1, $2)
       RETURNING id, started_at`,
      [sessionId, customerId ?? null]
    );

    return {
      id: row!.id,
      customerId,
      sessionId,
      startedAt: row!.started_at,
      topics: [],
      productsDiscussed: [],
      messages: [],
    };
  }

  async addMessage(
    sessionId: string,
    role: MessageRole,
    content: string,
    extra?: Partial<Pick<ChatMessage, 'toolCalls' | 'toolResults' | 'products' | 'suggestions' | 'uiUpdates'>>,
    customerId?: string
  ): Promise<ChatMessage> {
    const convo = await this.getOrCreate(sessionId, customerId);

    const row = await queryOne<{ id: string; created_at: string }>(
      `INSERT INTO ai_messages (conversation_id, role, content, tool_calls, tool_results, products, suggestions, ui_updates)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, created_at`,
      [
        convo.id,
        role,
        content,
        extra?.toolCalls ? JSON.stringify(extra.toolCalls) : null,
        extra?.toolResults ? JSON.stringify(extra.toolResults) : null,
        extra?.products ? JSON.stringify(extra.products) : null,
        extra?.suggestions ?? null,
        extra?.uiUpdates ? JSON.stringify(extra.uiUpdates) : null,
      ]
    );

    return {
      id: row!.id,
      role,
      content,
      ...extra,
      createdAt: new Date(row!.created_at),
    };
  }

  async getRecentMessages(sessionId: string, limit = 20): Promise<ChatMessage[]> {
    const convo = await queryOne<{ id: string }>(
      `SELECT id FROM ai_conversations WHERE session_id = $1`,
      [sessionId]
    );
    if (!convo) return [];
    return this.loadMessages(convo.id, limit);
  }

  async updateSummary(
    sessionId: string,
    summary: string,
    sentiment?: 'positive' | 'neutral' | 'negative',
    topics?: string[]
  ): Promise<void> {
    await query(
      `UPDATE ai_conversations
       SET summary = $2,
           sentiment = COALESCE($3, sentiment),
           topics = COALESCE($4, topics),
           ended_at = now()
       WHERE session_id = $1`,
      [sessionId, summary, sentiment ?? null, topics ?? null]
    );
  }

  async getConversationsByCustomer(customerId: string, limit = 10): Promise<Conversation[]> {
    const rows = await query<{
      id: string;
      session_id: string;
      customer_id: string;
      summary: string | null;
      sentiment: string | null;
      topics: string[];
      products_discussed: string[];
      started_at: string;
      ended_at: string | null;
    }>(
      `SELECT id, session_id, customer_id, summary, sentiment, topics, products_discussed, started_at, ended_at
       FROM ai_conversations WHERE customer_id = $1
       ORDER BY started_at DESC LIMIT $2`,
      [customerId, limit]
    );

    return rows.map((r) => ({
      id: r.id,
      customerId: r.customer_id,
      sessionId: r.session_id,
      startedAt: r.started_at,
      endedAt: r.ended_at ?? undefined,
      summary: r.summary ?? undefined,
      sentiment: (r.sentiment as Conversation['sentiment']) ?? undefined,
      topics: r.topics ?? [],
      productsDiscussed: r.products_discussed ?? [],
    }));
  }

  async clear(sessionId: string): Promise<void> {
    await query(`DELETE FROM ai_conversations WHERE session_id = $1`, [sessionId]);
  }

  private async loadMessages(conversationId: string, limit?: number): Promise<ChatMessage[]> {
    const sql = limit
      ? `SELECT * FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT $2`
      : `SELECT * FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at ASC`;

    const rows = await query<{
      id: string;
      role: string;
      content: string;
      tool_calls: unknown;
      tool_results: unknown;
      products: unknown;
      suggestions: string[] | null;
      ui_updates: unknown;
      created_at: string;
    }>(sql, limit ? [conversationId, limit] : [conversationId]);

    const messages = rows.map((r) => ({
      id: r.id,
      role: r.role as MessageRole,
      content: r.content,
      toolCalls: r.tool_calls as ChatMessage['toolCalls'],
      toolResults: r.tool_results as ChatMessage['toolResults'],
      products: r.products as ChatMessage['products'],
      suggestions: r.suggestions ?? undefined,
      uiUpdates: r.ui_updates as ChatMessage['uiUpdates'],
      createdAt: new Date(r.created_at),
    }));

    if (limit) messages.reverse();
    return messages;
  }
}
