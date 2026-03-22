import { NextRequest } from 'next/server';
import { ShoppingAgent } from '@/lib/ai/agent/agent-core';
import type { AgentContext } from '@/lib/ai/types';
import { getCurrentCustomer } from '@/lib/customer-account';

const agent = new ShoppingAgent();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      text,
      sessionId,
      currentPage,
      cart,
      recentlyViewed,
    } = body;

    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'sessionId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const sessionCustomer = await getCurrentCustomer();
    const resolvedCustomerId =
      sessionCustomer?.id != null && sessionCustomer.id !== ''
        ? String(sessionCustomer.id)
        : undefined;

    const context: AgentContext = {
      customerId: resolvedCustomerId,
      sessionId,
      isAuthenticated: Boolean(resolvedCustomerId),
      currentPage: currentPage || undefined,
      cartItems: cart || [],
      recentlyViewed: recentlyViewed || [],
    };

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'token', data: '' })}\n\n`)
          );

          const response = await agent.processInput({ text, context });

          // Simulate streaming by sending tokens
          const words = response.text.split(' ');
          for (const word of words) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'token', data: word + ' ' })}\n\n`)
            );
          }

          // Send complete event
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'complete', data: response })}\n\n`)
          );

          controller.close();
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'error', data: err instanceof Error ? err.message : 'Unknown error' })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    console.error('[Agent Stream API] Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
