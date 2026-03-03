import { NextRequest, NextResponse } from 'next/server';
import { VectorStore } from '@/lib/ai/memory/vector-store';

const vectorStore = new VectorStore();

/**
 * POST /api/agent/memory/search — Semantic RAG search
 * Body: { customerId, query, limit?, contentType? }
 */
export async function POST(req: NextRequest) {
  try {
    const { customerId, query: queryText, limit = 5 } = await req.json();

    if (!customerId || !queryText) {
      return NextResponse.json(
        { error: 'customerId and query are required' },
        { status: 400 }
      );
    }

    const results = await vectorStore.search(customerId, queryText, limit);
    return NextResponse.json({ results });
  } catch (err) {
    console.error('[API /agent/memory/search] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
