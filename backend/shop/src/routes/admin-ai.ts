import { Router } from "express";

export const adminAiRouter = Router();

const GEMINI_API_KEY =
  process.env.GOOGLE_AI_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY ||
  "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

interface AdviseBody {
  topic: "inventory" | "finance" | "campaign" | "general";
  question?: string;
  context: Record<string, unknown>;
}

const systemPromptFor = (topic: AdviseBody["topic"]) => {
  const base = `You are a senior merchandising and finance advisor for BLESSLUXE, a luxury fashion brand. Be concise, specific, and quantitative. Format your reply in plain markdown with clear headings, bullet points, and concrete numbers from the data provided. Avoid generic advice — every recommendation must reference a SKU, currency code, date, or metric from the context.`;
  if (topic === "inventory") {
    return `${base}\n\nFocus on: which SKUs are selling fastest, which are aging or stagnant, restock priorities, low-stock risks, dead inventory, and pricing or campaign suggestions for slow movers.`;
  }
  if (topic === "finance") {
    return `${base}\n\nFocus on: revenue trends, period-over-period growth, currency exposure, top revenue drivers, gross margin, and concrete pricing or product-mix recommendations to lift profit.`;
  }
  if (topic === "campaign") {
    return `${base}\n\nFocus on: campaign timing, discount levels, products to feature, expected lift, and risks (cannibalization, margin erosion).`;
  }
  return base;
};

adminAiRouter.post("/ai/advise", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(503).json({
        error: "Gemini not configured",
        hint: "Set GOOGLE_AI_API_KEY in backend/shop/.env",
      });
    }
    const body = req.body as AdviseBody;
    if (!body || !body.topic) return res.status(400).json({ error: "topic required" });

    const userText = `${body.question || `Give me an actionable analysis of the ${body.topic} data below.`}\n\nDATA (JSON):\n\`\`\`json\n${JSON.stringify(
      body.context || {},
      null,
      2
    )}\n\`\`\``;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
      systemInstruction: { parts: [{ text: systemPromptFor(body.topic) }] },
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await r.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };
    if (!r.ok) {
      return res.status(r.status).json({
        error: data.error?.message || `Gemini request failed (${r.status})`,
      });
    }
    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim() || "";
    res.json({ text, model: GEMINI_MODEL });
  } catch (err) {
    console.error("[ai advise]", err);
    res.status(500).json({ error: "Failed" });
  }
});
