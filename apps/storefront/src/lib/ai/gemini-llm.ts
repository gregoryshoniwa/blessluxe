import type { ToolCall, ToolDefinition, ToolParameterSchema, ToolResult } from "./types";

const getApiKey = () =>
  process.env.GOOGLE_AI_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY;

export function resolveGeminiModel(): string {
  const env = process.env.GEMINI_MODEL || process.env.NEXT_PUBLIC_AI_AGENT_MODEL || "";
  return /^gemini/i.test(env) ? env : "gemini-2.5-flash";
}

function toGeminiPropertySchema(schema: ToolParameterSchema): Record<string, unknown> {
  const out: Record<string, unknown> = { type: schema.type };
  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = schema.enum;
  if (schema.type === "array" && schema.items) {
    out.items = toGeminiPropertySchema(schema.items);
  }
  if (schema.type === "object" && schema.properties) {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      props[k] = toGeminiPropertySchema(v);
    }
    out.properties = props;
    if (schema.required?.length) out.required = schema.required;
  }
  return out;
}

export function toolDefinitionsToGeminiFunctions(defs: ToolDefinition[]) {
  return defs.map((def) => {
    const properties: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(def.parameters.properties)) {
      properties[k] = toGeminiPropertySchema(v);
    }
    return {
      name: def.name,
      description: def.description,
      parameters: {
        type: "object",
        properties,
        required: def.parameters.required ?? [],
      },
    };
  });
}

export interface GeminiLLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: { toolCallId: string; name: string; result: ToolResult }[];
}

/** Large product payloads break Gemini follow-up turns (empty / truncated responses). Slim only for API round-trip. */
function trimToolResultForGemini(result: ToolResult, toolName: string): ToolResult {
  if (!result.success || result.data === undefined) return result;
  const data = result.data as Record<string, unknown>;

  const slimProduct = (p: Record<string, unknown>) => ({
    id: p.id,
    handle: p.handle,
    title: p.title,
    price: p.price,
    inStock: p.inStock,
    thumbnail:
      typeof p.thumbnail === "string" ? p.thumbnail.slice(0, 240) : p.thumbnail,
    variants: Array.isArray(p.variants)
      ? (p.variants as Array<Record<string, unknown>>).slice(0, 6).map((v) => ({
          id: v.id,
          title: v.title,
          price: v.price,
        }))
      : undefined,
  });

  if (toolName === "search_products" || toolName === "get_recommendations") {
    const key = Array.isArray(data.products) ? "products" : "recommendations";
    const arr = (data[key] as Array<Record<string, unknown>> | undefined) || [];
    const slim = arr.slice(0, 12).map(slimProduct);
    return {
      ...result,
      data: {
        ...data,
        [key]: slim,
        _agent_note: `Showing ${slim.length} of ${arr.length} items in tool response (truncated for the model).`,
      },
    };
  }

  if (toolName === "view_product" && data.product && typeof data.product === "object") {
    return {
      ...result,
      data: {
        ...data,
        product: slimProduct(data.product as Record<string, unknown>),
        variants: Array.isArray(data.variants)
          ? (data.variants as unknown[]).slice(0, 8)
          : data.variants,
      },
    };
  }

  return result;
}

function toolResultToResponsePayload(result: ToolResult, toolName: string): Record<string, unknown> {
  const trimmed = trimToolResultForGemini(result, toolName);
  return {
    success: trimmed.success,
    ...(trimmed.data !== undefined ? { data: trimmed.data as unknown } : {}),
    ...(trimmed.error ? { error: trimmed.error } : {}),
  };
}

function buildGeminiPayload(
  messages: GeminiLLMMessage[],
  functionDeclarations: ReturnType<typeof toolDefinitionsToGeminiFunctions>
) {
  const systemChunks: string[] = [];
  const contents: Array<{
    role: string;
    parts: Array<Record<string, unknown>>;
  }> = [];

  for (const m of messages) {
    if (m.role === "system") {
      systemChunks.push(m.content);
      continue;
    }
    if (m.role === "user") {
      contents.push({ role: "user", parts: [{ text: m.content }] });
      continue;
    }
    if (m.role === "assistant") {
      const parts: Array<Record<string, unknown>> = [];
      if (m.content?.trim()) parts.push({ text: m.content });
      if (m.toolCalls?.length) {
        for (const tc of m.toolCalls) {
          parts.push({
            functionCall: {
              name: tc.name,
              args: tc.arguments ?? {},
            },
          });
        }
      }
      if (parts.length) contents.push({ role: "model", parts });
      continue;
    }
    if (m.role === "tool" && m.toolResults?.length) {
      const parts = m.toolResults.map((tr) => ({
        functionResponse: {
          name: tr.name,
          response: toolResultToResponsePayload(tr.result, tr.name),
        },
      }));
      contents.push({ role: "user", parts });
    }
  }

  const base: Record<string, unknown> = {
    system_instruction: { parts: [{ text: systemChunks.join("\n\n") }] },
    contents,
    generationConfig: {
      temperature: 0.75,
      topP: 0.95,
      maxOutputTokens: 8192,
    },
  };
  if (functionDeclarations.length > 0) {
    base.tools = [{ functionDeclarations }];
    base.toolConfig = {
      functionCallingConfig: {
        mode: "AUTO",
      },
    };
  }
  return base;
}

export async function callGeminiWithTools(
  messages: GeminiLLMMessage[],
  toolDefinitions: ToolDefinition[]
): Promise<{ content: string; toolCalls?: ToolCall[] }> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Missing GOOGLE_AI_API_KEY");
  }

  const model = resolveGeminiModel();
  const functionDeclarations = toolDefinitionsToGeminiFunctions(toolDefinitions);
  const body = buildGeminiPayload(messages, functionDeclarations);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  if (!response.ok) {
    console.error("[Gemini LLM] HTTP error:", response.status, raw.slice(0, 500));
    throw new Error(`Gemini API error: ${response.status}`);
  }

  let data: {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }> };
      finishReason?: string;
    }>;
    error?: { message?: string };
  };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    throw new Error("Gemini returned invalid JSON");
  }

  if (data.error?.message) {
    throw new Error(data.error.message);
  }

  const candidate = data.candidates?.[0];
  const finishReason = candidate?.finishReason;
  if (finishReason && finishReason !== "STOP" && finishReason !== "FINISH_REASON_UNSPECIFIED") {
    console.warn("[Gemini LLM] finishReason:", finishReason);
  }
  if (!candidate?.content?.parts?.length) {
    return { content: "I'm here to help — what would you like to explore at BLESSLUXE?" };
  }

  let text = "";
  const toolCalls: ToolCall[] = [];
  for (const part of candidate.content.parts) {
    if (part.text) text += part.text;
    if (part.functionCall?.name) {
      toolCalls.push({
        id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        name: part.functionCall.name,
        arguments: (part.functionCall.args as Record<string, unknown>) ?? {},
      });
    }
  }

  return {
    content: text.trim(),
    toolCalls: toolCalls.length ? toolCalls : undefined,
  };
}
