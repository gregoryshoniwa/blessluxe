import { NextRequest, NextResponse } from 'next/server';
import { InteractionStore } from '@/lib/ai/memory/interaction-store';

const interactionStore = new InteractionStore();

/**
 * POST /api/agent/interactions — Track a customer interaction
 * Body: { customerId, type, productId?, category?, searchQuery?, metadata? }
 */
export async function POST(req: NextRequest) {
  try {
    const { customerId, type, productId, category, searchQuery, metadata } = await req.json();

    if (!customerId || !type) {
      return NextResponse.json(
        { error: 'customerId and type are required' },
        { status: 400 }
      );
    }

    const interaction = await interactionStore.track(customerId, type, {
      productId,
      category,
      searchQuery,
      metadata,
    });

    return NextResponse.json({ interaction });
  } catch (err) {
    console.error('[API /agent/interactions] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/agent/interactions?customerId=X&type=view&limit=50
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customerId');
    const type = searchParams.get('type') ?? undefined;
    const limit = parseInt(searchParams.get('limit') ?? '50', 10);

    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
    }

    const interactions = await interactionStore.getByCustomer(customerId, { type, limit });
    const stats = await interactionStore.getStats(customerId);

    return NextResponse.json({ interactions, stats });
  } catch (err) {
    console.error('[API /agent/interactions] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
