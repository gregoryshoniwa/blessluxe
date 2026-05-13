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

// ─── Prompt suggestion for image / video generation ─────────────────────
// Returns a curated, editorial-grade prompt + structured field hints the
// admin UI can drop into its Generate Image form. Designed to spare admins
// from writing detailed prose every time — they pick a pose + click "Auto-
// fill" and the model fills in everything missing.

interface SuggestBody {
  context_kind: "model_image" | "model_video" | "product_image" | "product_video";
  /** Hint for the subject. Strongest when present. */
  subject?: {
    gender?: string;
    age_range?: string;
    ethnicity?: string;
    description?: string;
    prompt_template?: string;
    name?: string;
  };
  product?: {
    title?: string;
    description?: string;
  };
  /** What the admin has already filled out. Treated as soft locks. */
  partial?: {
    pose?: string;
    angle?: string;
    lighting?: string;
    backdrop?: string;
    scene?: string;
    prompt?: string;
  };
  /** Quick-pick pose keyword (front-three-quarter, walking, …). */
  pose_hint?: string;
}

const SUGGEST_SYSTEM = `You are a senior fashion creative director writing prompts for an AI image model (Nano Banana, gemini-2.5-flash-image-preview) used by the luxury brand BLESSLUXE.

Goal: when given a model's identity + a pose hint + (optionally) a product, produce ONE polished editorial fashion prompt that the AI model can render into a photo-real campaign image.

Style mandate:
- Cinematic luxury editorial photography (think Vogue, Net-a-Porter campaigns).
- Mention specific camera (e.g. Hasselblad H6D-100c with 80mm lens at f/2.8, ISO 100), lighting (key light angle, color temperature in Kelvin), and grading.
- Include skin / hair details so the AI renders realistic texture.
- Soft cream, gold, blush palette. Photoreal, not stylised.
- Always 16:9 unless specified otherwise.
- Never invent a different face if a subject is given — say "preserve identity".
- Strict identity-lock language when an explicit subject is provided.

Output format (must be valid JSON, no markdown, no extra commentary):
{
  "pose": "<short pose direction>",
  "angle": "<camera angle phrase>",
  "lighting": "<lighting setup phrase>",
  "backdrop": "<setting / backdrop phrase>",
  "prompt": "<one paragraph, ~80-140 words, complete creative direction>"
}

Honour any partial values the admin has already filled — do not contradict them.
`;

adminAiRouter.post("/ai/suggest-prompt", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(503).json({ error: "GOOGLE_AI_API_KEY is not set" });
    }
    const b = req.body as SuggestBody;
    if (!b?.context_kind) return res.status(400).json({ error: "context_kind required" });

    const subjectLines: string[] = [];
    if (b.subject) {
      if (b.subject.name) subjectLines.push(`Name: ${b.subject.name}`);
      if (b.subject.gender) subjectLines.push(`Gender: ${b.subject.gender}`);
      if (b.subject.age_range) subjectLines.push(`Age range: ${b.subject.age_range}`);
      if (b.subject.ethnicity) subjectLines.push(`Ethnicity: ${b.subject.ethnicity}`);
      if (b.subject.description) subjectLines.push(`Notes: ${b.subject.description}`);
      if (b.subject.prompt_template) subjectLines.push(`Existing identity prompt: ${b.subject.prompt_template}`);
    }
    const productLines: string[] = [];
    if (b.product) {
      if (b.product.title) productLines.push(`Product: ${b.product.title}`);
      if (b.product.description) productLines.push(`Description: ${b.product.description}`);
    }
    const partialLines: string[] = [];
    if (b.partial) {
      for (const [k, v] of Object.entries(b.partial)) {
        if (typeof v === "string" && v.trim()) partialLines.push(`${k}: ${v.trim()}`);
      }
    }

    const userText = [
      `Context kind: ${b.context_kind}`,
      subjectLines.length ? `\nSubject:\n${subjectLines.join("\n")}` : "",
      productLines.length ? `\nProduct:\n${productLines.join("\n")}` : "",
      b.pose_hint ? `\nPose hint: ${b.pose_hint}` : "",
      partialLines.length ? `\nAlready provided (must honour):\n${partialLines.join("\n")}` : "",
      "\nReturn the JSON now.",
    ]
      .filter(Boolean)
      .join("\n");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
      systemInstruction: { parts: [{ text: SUGGEST_SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
      },
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
      return res
        .status(r.status)
        .json({ error: data.error?.message || `Gemini returned ${r.status}` });
    }
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim() || "{}";
    // Strip code fences if Gemini added them despite the JSON mime hint.
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    let parsed: Record<string, string> = {};
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Fallback: treat the entire response as the prompt field
      parsed = { prompt: cleaned };
    }
    res.json({
      pose: parsed.pose || "",
      angle: parsed.angle || "",
      lighting: parsed.lighting || "",
      backdrop: parsed.backdrop || "",
      prompt: parsed.prompt || "",
      model: GEMINI_MODEL,
    });
  } catch (err) {
    console.error("[ai suggest-prompt]", err);
    res.status(500).json({ error: "Failed" });
  }
});
