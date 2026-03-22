import { NextRequest, NextResponse } from 'next/server';
import { PreferenceStore } from '@/lib/ai/memory/preference-store';

export const dynamic = 'force-dynamic';

const preferenceStore = new PreferenceStore();

/**
 * GET /api/agent/preferences?customerId=X
 */
export async function GET(req: NextRequest) {
  try {
    const customerId = new URL(req.url).searchParams.get('customerId');
    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
    }

    const preferences = await preferenceStore.get(customerId);
    return NextResponse.json({ preferences });
  } catch (err) {
    console.error('[API /agent/preferences] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/agent/preferences — Upsert customer preferences
 * Body: { customerId, ...preferences }
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { customerId, ...updates } = body;

    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
    }

    const preferences = await preferenceStore.upsert(customerId, updates);
    return NextResponse.json({ preferences });
  } catch (err) {
    console.error('[API /agent/preferences] PUT error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
