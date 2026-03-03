import { BaseTool } from './base-tool';
import type { ToolDefinition, ToolResult, AgentContext } from '../types';

export class BrowseWebsiteTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'browse_website',
    description: 'Navigate to different pages on the BLESSLUXE website. Use to show customers specific pages, categories, or sections.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['navigate', 'scroll', 'click', 'back', 'forward'],
          description: 'The browsing action to perform',
        },
        target: {
          type: 'string',
          description: 'Target page/URL path/element. Examples: "/shop/dresses", "/product/silk-wrap-dress", "/cart"',
        },
        scroll_to: {
          type: 'string',
          description: 'Element or section to scroll to. Examples: "reviews", "size-guide", "related-products"',
        },
      },
      required: ['action'],
    },
  };

  async execute(params: Record<string, unknown>, _context: AgentContext): Promise<ToolResult> {
    const action = params.action as string;
    const target = params.target as string | undefined;
    const scrollTo = params.scroll_to as string | undefined;

    switch (action) {
      case 'navigate':
        return {
          success: true,
          data: { navigatedTo: target },
          uiAction: { type: 'navigate', payload: { path: target } },
        };
      case 'scroll':
        return {
          success: true,
          data: { scrolledTo: scrollTo },
          uiAction: { type: 'scroll', payload: { target: scrollTo } },
        };
      case 'click':
        return {
          success: true,
          data: { clicked: target },
          uiAction: { type: 'click', payload: { element: target } },
        };
      case 'back':
        return { success: true, uiAction: { type: 'back', payload: {} } };
      case 'forward':
        return { success: true, uiAction: { type: 'forward', payload: {} } };
      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  }
}
