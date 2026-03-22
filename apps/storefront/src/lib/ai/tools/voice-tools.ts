/**
 * Tool registry for Gemini Live (browser). `send_email` is declared here but
 * executed via POST /api/agent/execute-tool so nodemailer stays server-only.
 */
import { BaseTool } from './base-tool';
import { BrowseWebsiteTool } from './browse-website';
import { SearchProductsTool } from './search-products';
import { ViewProductTool } from './view-product';
import { ManageCartTool } from './manage-cart';
import { CreateOrderTool } from './create-order';
import { CheckOrderStatusTool } from './check-order-status';
import { SetReminderTool } from './set-reminder';
import { GetRecommendationsTool } from './get-recommendations';
import { CheckInventoryTool } from './check-inventory';
import { ApplyDiscountTool } from './apply-discount';
import { ManageWishlistTool } from './manage-wishlist';
import { SEND_EMAIL_TOOL_DEFINITION } from './send-email.definition';
import type { ToolDefinition, ToolResult, AgentContext } from '../types';

export const VOICE_TOOLS: BaseTool[] = [
  new BrowseWebsiteTool(),
  new SearchProductsTool(),
  new ViewProductTool(),
  new ManageCartTool(),
  new CreateOrderTool(),
  new CheckOrderStatusTool(),
  new SetReminderTool(),
  new GetRecommendationsTool(),
  new CheckInventoryTool(),
  new ApplyDiscountTool(),
  new ManageWishlistTool(),
];

const voiceToolMap = new Map<string, BaseTool>();
for (const tool of VOICE_TOOLS) {
  voiceToolMap.set(tool.name, tool);
}

export function getVoiceToolDefinitions(): ToolDefinition[] {
  return [...VOICE_TOOLS.map((t) => t.definition), SEND_EMAIL_TOOL_DEFINITION];
}

const SERVER_PROXY_TOOLS = new Set(['send_email']);

async function executeServerProxyTool(
  name: string,
  params: Record<string, unknown>,
  context: AgentContext
): Promise<ToolResult> {
  try {
    const res = await fetch('/api/agent/execute-tool', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolName: name,
        arguments: params,
        sessionId: context.sessionId,
      }),
    });
    const json = (await res.json()) as { result?: ToolResult; error?: string };
    if (!res.ok) {
      return {
        success: false,
        error: typeof json.error === 'string' ? json.error : 'Email request failed',
      };
    }
    if (json.result && typeof json.result === 'object' && 'success' in json.result) {
      return json.result;
    }
    return { success: false, error: 'Invalid response from server' };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

export async function executeVoiceTool(
  name: string,
  params: Record<string, unknown>,
  context: AgentContext
): Promise<ToolResult> {
  if (SERVER_PROXY_TOOLS.has(name)) {
    return executeServerProxyTool(name, params, context);
  }
  const tool = voiceToolMap.get(name);
  if (!tool) {
    return { success: false, error: `Unknown tool: ${name}` };
  }
  try {
    return await tool.execute(params, context);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Tool execution failed' };
  }
}
