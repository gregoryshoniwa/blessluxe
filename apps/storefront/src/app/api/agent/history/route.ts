import { NextResponse } from "next/server";
import { buildAgentSessionId } from "@/lib/ai/agent-session";
import { getCurrentCustomer } from "@/lib/customer-account";
import { ConversationStore } from "@/lib/ai/memory/conversation-store";

export const dynamic = "force-dynamic";

const store = new ConversationStore();

function serializeMessage(m: {
  id: string;
  role: string;
  content: string;
  products?: unknown;
  suggestions?: string[];
  uiUpdates?: unknown;
  createdAt: Date;
}) {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    products: m.products,
    suggestions: m.suggestions,
    uiUpdates: m.uiUpdates,
    createdAt: m.createdAt.toISOString(),
  };
}

/** Load persisted LUXE thread for the signed-in customer (stable session id). */
export async function GET() {
  const customer = await getCurrentCustomer();
  if (!customer?.id) {
    return NextResponse.json({ messages: [], sessionId: null });
  }

  const sessionId = buildAgentSessionId(String(customer.id), "");
  try {
    const messages = await store.getRecentMessages(sessionId, 80);
    return NextResponse.json({
      sessionId,
      messages: messages.map(serializeMessage),
    });
  } catch (err) {
    console.error("[agent/history] GET failed:", err);
    return NextResponse.json({ messages: [], sessionId, error: "load_failed" }, { status: 200 });
  }
}

/** Clear server-side thread (optional “new chat” for logged-in users). */
export async function DELETE() {
  const customer = await getCurrentCustomer();
  if (!customer?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const sessionId = buildAgentSessionId(String(customer.id), "");
  try {
    await store.clear(sessionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[agent/history] DELETE failed:", err);
    return NextResponse.json({ error: "Could not clear history." }, { status: 500 });
  }
}
