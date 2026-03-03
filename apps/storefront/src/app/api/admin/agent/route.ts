import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/admin/agent — Dashboard overview of the AI agent system
 * Returns counts and recent activity across all tables.
 */
export async function GET() {
  try {
    const [conversations, messages, memories, interactions, preferences] = await Promise.all([
      query<{ count: string }>(`SELECT COUNT(*) AS count FROM ai_conversations`),
      query<{ count: string }>(`SELECT COUNT(*) AS count FROM ai_messages`),
      query<{ count: string }>(`SELECT COUNT(*) AS count FROM ai_customer_memories`),
      query<{ count: string }>(`SELECT COUNT(*) AS count FROM ai_customer_interactions`),
      query<{ count: string }>(`SELECT COUNT(*) AS count FROM ai_customer_preferences`),
    ]);

    const recentConversations = await query<{
      id: string;
      session_id: string;
      customer_id: string | null;
      summary: string | null;
      sentiment: string | null;
      started_at: string;
      message_count: string;
    }>(
      `SELECT c.id, c.session_id, c.customer_id, c.summary, c.sentiment, c.started_at,
              COUNT(m.id) AS message_count
       FROM ai_conversations c
       LEFT JOIN ai_messages m ON m.conversation_id = c.id
       GROUP BY c.id
       ORDER BY c.started_at DESC
       LIMIT 20`
    );

    const topCustomers = await query<{
      customer_id: string;
      conversation_count: string;
      memory_count: string;
      interaction_count: string;
    }>(
      `SELECT
         COALESCE(conv.customer_id, mem.customer_id, inter.customer_id) AS customer_id,
         COALESCE(conv.cnt, 0) AS conversation_count,
         COALESCE(mem.cnt, 0) AS memory_count,
         COALESCE(inter.cnt, 0) AS interaction_count
       FROM
         (SELECT customer_id, COUNT(*) AS cnt FROM ai_conversations WHERE customer_id IS NOT NULL GROUP BY customer_id) conv
       FULL OUTER JOIN
         (SELECT customer_id, COUNT(*) AS cnt FROM ai_customer_memories GROUP BY customer_id) mem
         ON conv.customer_id = mem.customer_id
       FULL OUTER JOIN
         (SELECT customer_id, COUNT(*) AS cnt FROM ai_customer_interactions GROUP BY customer_id) inter
         ON COALESCE(conv.customer_id, mem.customer_id) = inter.customer_id
       ORDER BY COALESCE(conv.cnt, 0) + COALESCE(inter.cnt, 0) DESC
       LIMIT 20`
    );

    const interactionBreakdown = await query<{
      interaction_type: string;
      count: string;
    }>(
      `SELECT interaction_type, COUNT(*) AS count
       FROM ai_customer_interactions
       GROUP BY interaction_type
       ORDER BY count DESC`
    );

    return NextResponse.json({
      counts: {
        conversations: parseInt(conversations[0]?.count ?? '0', 10),
        messages: parseInt(messages[0]?.count ?? '0', 10),
        memories: parseInt(memories[0]?.count ?? '0', 10),
        interactions: parseInt(interactions[0]?.count ?? '0', 10),
        customers: parseInt(preferences[0]?.count ?? '0', 10),
      },
      recentConversations: recentConversations.map((r) => ({
        ...r,
        messageCount: parseInt(r.message_count, 10),
      })),
      topCustomers: topCustomers.map((r) => ({
        customerId: r.customer_id,
        conversationCount: parseInt(r.conversation_count as string, 10),
        memoryCount: parseInt(r.memory_count as string, 10),
        interactionCount: parseInt(r.interaction_count as string, 10),
      })),
      interactionBreakdown: interactionBreakdown.map((r) => ({
        type: r.interaction_type,
        count: parseInt(r.count, 10),
      })),
    });
  } catch (err) {
    console.error('[API /admin/agent] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
