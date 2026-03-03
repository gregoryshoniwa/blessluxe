import { BaseTool } from './base-tool';
import { BrowseWebsiteTool } from './browse-website';
import { SearchProductsTool } from './search-products';
import { ViewProductTool } from './view-product';
import { ManageCartTool } from './manage-cart';
import { CreateOrderTool } from './create-order';
import { CheckOrderStatusTool } from './check-order-status';
import { SendEmailTool } from './send-email';
import { SetReminderTool } from './set-reminder';
import { GetRecommendationsTool } from './get-recommendations';
import { CheckInventoryTool } from './check-inventory';
import { ApplyDiscountTool } from './apply-discount';
import { ManageWishlistTool } from './manage-wishlist';
import type { ToolDefinition, ToolResult, AgentContext } from '../types';

const ALL_TOOLS: BaseTool[] = [
  new BrowseWebsiteTool(),
  new SearchProductsTool(),
  new ViewProductTool(),
  new ManageCartTool(),
  new CreateOrderTool(),
  new CheckOrderStatusTool(),
  new SendEmailTool(),
  new SetReminderTool(),
  new GetRecommendationsTool(),
  new CheckInventoryTool(),
  new ApplyDiscountTool(),
  new ManageWishlistTool(),
];

const toolMap = new Map<string, BaseTool>();
for (const tool of ALL_TOOLS) {
  toolMap.set(tool.name, tool);
}

export function getToolDefinitions(): ToolDefinition[] {
  return ALL_TOOLS.map((t) => t.definition);
}

export function getTool(name: string): BaseTool | undefined {
  return toolMap.get(name);
}

export async function executeTool(
  name: string,
  params: Record<string, unknown>,
  context: AgentContext
): Promise<ToolResult> {
  const tool = toolMap.get(name);
  if (!tool) {
    return { success: false, error: `Unknown tool: ${name}` };
  }
  try {
    return await tool.execute(params, context);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Tool execution failed' };
  }
}

export { BaseTool } from './base-tool';
export type { ToolDefinition, ToolResult };
