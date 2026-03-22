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

function toolResultToResponsePayload(result: ToolResult): Record<string, unknown> {
  return {
    success: result.success,
    ...(result.data !== undefined ? { data: result.data as unknown } : {}),
    ...(result.error ? { error: result.error } : {}),
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
          response: toolResultToResponsePayload(tr.result),
        },
      }));
      contents.push({ role: "user", parts });
    }
  }

  return {
    system_instruction: { parts: [{ text: systemChunks.join("\n\n") }] },
    contents,
    tools: [{ functionDeclarations }],
    toolConfig: {
      functionCallingConfig: {
        mode: "AUTO",
      },
    },
    generationConfig: {
      temperature: 0.75,
      topP: 0.95,
      maxOutputTokens: 1024,
    },
  };
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
