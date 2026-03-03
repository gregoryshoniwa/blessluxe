import { NextRequest, NextResponse } from 'next/server';
import { VectorStore } from '@/lib/ai/memory/vector-store';

const vectorStore = new VectorStore();

/**
 * POST /api/agent/memory — Store a new memory
 * Body: { customerId, content, contentType, metadata? }
 */
export async function POST(req: NextRequest) {
  try {
    const { customerId, content, contentType, metadata } = await req.json();

    if (!customerId || !content || !contentType) {
      return NextResponse.json(
        { error: 'customerId, content, and contentType are required' },
        { status: 400 }
      );
    }

    await vectorStore.store(customerId, content, contentType, metadata);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[API /agent/memory] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/agent/memory?customerId=X&query=Y&limit=5
 * Performs RAG search (vector + keyword fallback)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customerId');
    const queryText = searchParams.get('query');
    const limit = parseInt(searchParams.get('limit') ?? '5', 10);

    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
    }

    if (queryText) {
      const results = await vectorStore.search(customerId, queryText, limit);
      return NextResponse.json({ memories: results });
    }

    const results = await vectorStore.getByCustomer(customerId);
    return NextResponse.json({ memories: results });
  } catch (err) {
    console.error('[API /agent/memory] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
