import { NextRequest, NextResponse } from 'next/server';
import { ConversationStore } from '@/lib/ai/memory/conversation-store';

const conversationStore = new ConversationStore();

/**
 * GET /api/agent/conversations?customerId=X&limit=10
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customerId');
    const limit = parseInt(searchParams.get('limit') ?? '10', 10);

    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
    }

    const conversations = await conversationStore.getConversationsByCustomer(customerId, limit);
    return NextResponse.json({ conversations });
  } catch (err) {
    console.error('[API /agent/conversations] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
