import { NextRequest, NextResponse } from 'next/server';
import { ConversationStore } from '@/lib/ai/memory/conversation-store';

const conversationStore = new ConversationStore();

/**
 * GET /api/agent/conversations/:sessionId — Get conversation + messages
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { sessionId: string } }
): Promise<NextResponse> {
  try {
    const conversation = await conversationStore.getOrCreate(params.sessionId);
    const messages = await conversationStore.getRecentMessages(params.sessionId, 100);
    return NextResponse.json({ conversation, messages });
  } catch (err) {
    console.error('[API /agent/conversations/:id] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/agent/conversations/:sessionId — Clear a conversation
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { sessionId: string } }
): Promise<NextResponse> {
  try {
    await conversationStore.clear(params.sessionId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[API /agent/conversations/:id] DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
