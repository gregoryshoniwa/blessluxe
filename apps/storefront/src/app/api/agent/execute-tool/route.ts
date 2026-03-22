import { NextRequest, NextResponse } from 'next/server';
import { executeTool } from '@/lib/ai/tools';
import { buildAgentSessionId } from '@/lib/ai/agent-session';
import type { AgentContext } from '@/lib/ai/types';
import { getCurrentCustomer } from '@/lib/customer-account';

export const dynamic = 'force-dynamic';

/** Tools that must run on the server (voice / client proxy). Keep this list minimal. */
const PROXY_ALLOWED = new Set(['send_email']);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const toolName = String(body.toolName ?? '');
    const args =
      typeof body.arguments === 'object' && body.arguments !== null
        ? (body.arguments as Record<string, unknown>)
        : {};
    const sessionId = body.sessionId != null ? String(body.sessionId) : '';

    if (!toolName || !PROXY_ALLOWED.has(toolName)) {
      return NextResponse.json({ error: 'Tool not allowed' }, { status: 403 });
    }

    const sessionCustomer = await getCurrentCustomer();
    const resolvedCustomerId =
      sessionCustomer?.id != null && sessionCustomer.id !== '' ? String(sessionCustomer.id) : undefined;

    const effectiveSessionId = buildAgentSessionId(resolvedCustomerId, sessionId || 'voice');

    const context: AgentContext = {
      sessionId: effectiveSessionId,
      customerId: resolvedCustomerId,
      isAuthenticated: Boolean(resolvedCustomerId),
    };

    const result = await executeTool(toolName, args, context);
    return NextResponse.json({ result });
  } catch (err) {
    console.error('[agent/execute-tool]', err);
    return NextResponse.json({ error: 'Tool execution failed' }, { status: 500 });
  }
}
