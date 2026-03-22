/**
 * Tool registry for Gemini Live (browser). Excludes server-only tools such as
 * `send_email` (nodemailer / DB) so the client bundle does not pull Node APIs.
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
  return VOICE_TOOLS.map((t) => t.definition);
}

export async function executeVoiceTool(
  name: string,
  params: Record<string, unknown>,
  context: AgentContext
): Promise<ToolResult> {
  if (name === 'send_email') {
    return {
      success: false,
      error:
        'Sending email from voice is not available. Ask the customer to use the text chat to send account emails.',
    };
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
