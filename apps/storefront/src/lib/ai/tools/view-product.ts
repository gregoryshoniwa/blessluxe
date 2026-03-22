import { BaseTool } from './base-tool';
import { fetchMedusaProductSummaryByHandleOrId } from '@/lib/medusa-agent-catalog';
import type { ToolDefinition, ToolResult, AgentContext } from '../types';

export class ViewProductTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'view_product',
    description:
      'Get detailed information about a specific product including variants, sizing, and availability. Uses live Medusa catalog data.',
    parameters: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'Medusa product id' },
        handle: { type: 'string', description: 'Product handle/slug from the shop URL' },
        include: {
          type: 'array',
          items: { type: 'string', enum: ['variants', 'reviews', 'sizing', 'related'] },
          description: 'Additional info to include',
        },
      },
    },
  };

  async execute(params: Record<string, unknown>, _context: AgentContext): Promise<ToolResult> {
    const productId = params.product_id as string | undefined;
    const handle = params.handle as string | undefined;

    if (!productId && !handle) {
      return { success: false, error: 'Either product_id or handle is required' };
    }

    const summary = await fetchMedusaProductSummaryByHandleOrId({
      product_id: productId,
      handle,
    });

    if (!summary) {
      return {
        success: false,
        error: 'Product not found in the catalog. Check the handle or id, or try search_products.',
      };
    }

    const path = `/shop/${summary.handle}`;

    return {
      success: true,
      data: {
        product: summary,
        variants: summary.variants ?? [],
        link: path,
      },
    };
  }
}
