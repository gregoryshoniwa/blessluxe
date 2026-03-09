import { NextRequest, NextResponse } from 'next/server';
import type { AgentResponse } from '@/lib/ai/types';

const MODEL = 'gemini-2.5-flash';
const getGoogleApiKey = () =>
  process.env.GOOGLE_AI_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY;

const SYSTEM_PROMPT = `You are LUXE, the personal AI shopping assistant for BLESSLUXE — a luxury women's fashion e-commerce store.

Your personality:
- Warm, knowledgeable, and stylish with a touch of sophistication
- You speak with elegance but keep things conversational
- Use fashion terminology naturally

Capabilities:
- Help customers find products, build outfits, and make style decisions
- Answer questions about sizing, materials, care instructions, and trends
- Suggest complementary items and complete looks
- Help with order status, returns, and general store questions

Rules:
- Keep responses concise (2-4 sentences typical, longer only when detailed advice is needed)
- Always be helpful and positive
- If you don't know something specific about inventory, suggest the customer check the shop page
- Never make up prices or availability — direct to the product page
- Format product mentions naturally in conversation`;

export async function POST(req: NextRequest) {
  try {
    const googleApiKey = getGoogleApiKey();
    const body = await req.json();
    const { text, sessionId, messages: conversationHistory } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    if (!googleApiKey) {
      return NextResponse.json({
        text: "I'm not fully configured yet. Please set GOOGLE_AI_API_KEY (or NEXT_PUBLIC_GOOGLE_AI_API_KEY for local dev) in your environment to enable AI chat.",
        suggestions: ['Show me new arrivals', 'Browse dresses'],
      });
    }

    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory.slice(-10)) {
        if (msg.role === 'user' || msg.role === 'model') {
          contents.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }],
          });
        }
      }
    }

    contents.push({ role: 'user', parts: [{ text: text || 'Hello' }] });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${googleApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: {
            temperature: 0.8,
            topP: 0.95,
            maxOutputTokens: 512,
          },
        }),
      }
    );

    if (!response.ok) {
      const errData = await response.text();
      console.error('[Agent API] Gemini error:', response.status, errData);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const aiText =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "I'm here to help! What are you looking for today?";

    const suggestions = generateSuggestions(text, aiText);

    const result: AgentResponse = {
      text: aiText,
      suggestions,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error('[Agent API] Error:', err);
    return NextResponse.json(
      {
        text: "I'm sorry, I had a momentary lapse. Could you try that again?",
        suggestions: ['Show me new arrivals', "What's trending?"],
      },
      { status: 200 }
    );
  }
}

function generateSuggestions(userText: string, _aiText: string): string[] {
  const lower = (userText || '').toLowerCase();

  if (lower.includes('dress')) {
    return ['Show me evening gowns', 'Casual dresses', 'What accessories match?'];
  }
  if (lower.includes('outfit') || lower.includes('style')) {
    return ['Date night outfit', 'Work wear ideas', 'Weekend casual'];
  }
  if (lower.includes('new') || lower.includes('arrival')) {
    return ['Shop all new arrivals', 'New dresses', 'New accessories'];
  }
  if (lower.includes('sale') || lower.includes('discount')) {
    return ['Shop sale items', 'Best deals this week'];
  }

  return ['Show me new arrivals', 'Help me find an outfit', 'Browse by category'];
}
