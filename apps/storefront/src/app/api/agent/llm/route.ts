import { NextRequest, NextResponse } from 'next/server';

/**
 * LLM proxy route. In production, this calls the actual AI provider API
 * (Anthropic, OpenAI, Google) with server-side API keys. For the prototype,
 * it returns a simple fallback response.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, tools } = body;

    // In production, route to the configured provider:
    // const provider = body.provider; // 'anthropic' | 'openai' | 'google'
    // const model = body.model;
    // return await callProvider(provider, model, messages, tools);

    const lastUser = [...(messages || [])].reverse().find((m: { role: string }) => m.role === 'user');
    const query = (lastUser?.content ?? '').toLowerCase();

    // Simple keyword-based routing to demonstrate tool calling
    if (query.includes('search') || query.includes('find') || query.includes('show me') || query.includes('looking for')) {
      const searchTerm = query
        .replace(/(?:can you |please |help me )?(?:search|find|show me|looking for)\s*/gi, '')
        .trim();

      return NextResponse.json({
        content: `Let me search for "${searchTerm}" for you! ✨`,
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            name: 'search_products',
            arguments: { query: searchTerm || 'popular' },
          },
        ],
      });
    }

    if (query.includes('recommend') || query.includes('suggest') || query.includes('pick')) {
      return NextResponse.json({
        content: "I'd love to find some pieces you'll adore! ✨",
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            name: 'get_recommendations',
            arguments: { type: 'for_you' },
          },
        ],
      });
    }

    if (query.includes('cart')) {
      return NextResponse.json({
        content: 'Let me check your cart! 🛍️',
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            name: 'manage_cart',
            arguments: { action: 'view' },
          },
        ],
      });
    }

    if (query.includes('order') || query.includes('track') || query.includes('shipping')) {
      return NextResponse.json({
        content: "I can help you track your order! Could you share the order number? It starts with 'BL-'.",
      });
    }

    if (query.includes('wishlist') || query.includes('saved') || query.includes('favorites')) {
      return NextResponse.json({
        content: 'Let me pull up your wishlist! 💫',
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            name: 'manage_wishlist',
            arguments: { action: 'view' },
          },
        ],
      });
    }

    if (query.includes('sale') || query.includes('discount') || query.includes('promo')) {
      return NextResponse.json({
        content: "Let me check what's on sale right now! 🏷️",
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            name: 'search_products',
            arguments: { category: 'sale', sort_by: 'popular' },
          },
        ],
      });
    }

    if (query.includes('hello') || query.includes('hi') || query.includes('hey')) {
      return NextResponse.json({
        content: "Hello! ✨ Welcome to BLESSLUXE! I'm LUXE, your personal shopping assistant. I can help you find the perfect outfit, track orders, manage your wishlist, and so much more. What would you like to explore today?",
      });
    }

    // Default helpful response
    const hasTools = tools && tools.length > 0;
    return NextResponse.json({
      content: hasTools
        ? "I'd be happy to help! ✨ I can search for products, check on orders, manage your cart or wishlist, and give personalized recommendations. What would you like to do?"
        : "Welcome to BLESSLUXE! ✨ I'm LUXE, your personal shopping assistant. How can I help you today?",
    });
  } catch (err) {
    console.error('[LLM Proxy] Error:', err);
    return NextResponse.json(
      { content: "I'm sorry, I encountered an issue. Could you try again?", error: true },
      { status: 500 }
    );
  }
}
