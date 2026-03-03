import { NextRequest, NextResponse } from 'next/server';
import { ConversationStore } from '@/lib/ai/memory/conversation-store';
import { InteractionStore } from '@/lib/ai/memory/interaction-store';
import { PreferenceStore } from '@/lib/ai/memory/preference-store';
import { VectorStore } from '@/lib/ai/memory/vector-store';

const conversationStore = new ConversationStore();
const interactionStore = new InteractionStore();
const preferenceStore = new PreferenceStore();
const vectorStore = new VectorStore();

/**
 * GET /api/admin/agent/customers/:customerId — Full customer AI profile
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { customerId: string } }
) {
  try {
    const { customerId } = params;

    const [preferences, conversations, interactions, stats, memories] = await Promise.all([
      preferenceStore.get(customerId),
      conversationStore.getConversationsByCustomer(customerId, 20),
      interactionStore.getByCustomer(customerId, { limit: 50 }),
      interactionStore.getStats(customerId),
      vectorStore.getByCustomer(customerId),
    ]);

    return NextResponse.json({
      customerId,
      preferences,
      conversations,
      interactions,
      stats,
      memoryCount: memories.length,
      recentMemories: memories.slice(0, 20),
    });
  } catch (err) {
    console.error('[API /admin/agent/customers/:id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/agent/customers/:customerId — Purge all AI data for a customer
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { customerId: string } }
) {
  try {
    const { customerId } = params;
    const { query: dbQuery } = await import('@/lib/db');

    await Promise.all([
      dbQuery(`DELETE FROM ai_customer_memories WHERE customer_id = $1`, [customerId]),
      dbQuery(`DELETE FROM ai_customer_interactions WHERE customer_id = $1`, [customerId]),
      dbQuery(`DELETE FROM ai_customer_preferences WHERE customer_id = $1`, [customerId]),
      dbQuery(`DELETE FROM ai_event_subscriptions WHERE customer_id = $1`, [customerId]),
      dbQuery(`DELETE FROM ai_reminders WHERE customer_id = $1`, [customerId]),
      dbQuery(
        `DELETE FROM ai_messages WHERE conversation_id IN
           (SELECT id FROM ai_conversations WHERE customer_id = $1)`,
        [customerId]
      ),
      dbQuery(`DELETE FROM ai_conversations WHERE customer_id = $1`, [customerId]),
    ]);

    return NextResponse.json({ success: true, message: `All AI data purged for customer ${customerId}` });
  } catch (err) {
    console.error('[API /admin/agent/customers/:id] DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
