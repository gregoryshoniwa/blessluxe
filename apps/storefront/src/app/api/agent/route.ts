import { NextRequest, NextResponse } from "next/server";
import type { AgentContext } from "@/lib/ai/types";
import { ShoppingAgent } from "@/lib/ai/agent/agent-core";

export const dynamic = "force-dynamic";

const shoppingAgent = new ShoppingAgent();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      text,
      sessionId,
      messages: conversationHistory,
      currentPage,
      customerId,
      cart,
      recentlyViewed,
    } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const hasKey = !!(process.env.GOOGLE_AI_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY);
    if (!hasKey) {
      return NextResponse.json({
        text: "I'm not fully configured yet. Please set GOOGLE_AI_API_KEY (or NEXT_PUBLIC_GOOGLE_AI_API_KEY for local dev) in your environment to enable AI chat.",
        suggestions: ["Show me new arrivals", "Browse dresses"],
      });
    }

    const clientMessageHistory = Array.isArray(conversationHistory)
      ? conversationHistory
          .filter(
            (m: { role?: string }) => m && (m.role === "user" || m.role === "model" || m.role === "assistant")
          )
          .map((m: { role: string; content?: string }) => ({
            role: m.role === "model" || m.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: String(m.content ?? ""),
          }))
          .filter((m: { content: string }) => m.content.trim().length > 0)
      : undefined;

    const context: AgentContext = {
      sessionId: String(sessionId),
      customerId: customerId ? String(customerId) : undefined,
      isAuthenticated: Boolean(customerId),
      currentPage: currentPage ? String(currentPage) : undefined,
      cartItems: Array.isArray(cart) ? cart : [],
      recentlyViewed: Array.isArray(recentlyViewed) ? recentlyViewed : [],
    };

    const result = await shoppingAgent.processInput({
      text: String(text ?? ""),
      context,
      clientMessageHistory,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[Agent API] Error:", err);
    return NextResponse.json(
      {
        text: "I'm sorry, I had a momentary lapse. Could you try that again?",
        suggestions: ["Show me new arrivals", "What's trending?"],
      },
      { status: 200 }
    );
  }
}
