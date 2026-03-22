import { BaseTool } from './base-tool';
import { fetchMedusaProductsForAgent } from '@/lib/medusa-agent-catalog';
import type { ToolDefinition, ToolResult, AgentContext, ProductSummary } from '../types';

const TITLES: Record<string, string> = {
  for_you: 'Picked For You',
  complete_outfit: 'Complete Your Outfit',
  similar_to: 'You Might Also Like',
  trending: 'Trending In Your Style',
  new_for_you: 'New Arrivals For You',
  occasion: 'Perfect For The Occasion',
  gift: 'Gift Ideas',
  restock: 'Time To Reorder?',
};

export class GetRecommendationsTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'get_recommendations',
    description:
      'Get personalized product recommendations from the live Medusa catalog (Women, Men, Children, Sale — same as the site). Uses recent storefront products when specific history is unavailable.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['for_you', 'complete_outfit', 'similar_to', 'trending', 'new_for_you', 'restock', 'occasion', 'gift'],
          description: 'Type of recommendations',
        },
        based_on_product: { type: 'string', description: 'Product ID to base recommendations on' },
        occasion: { type: 'string', description: 'Occasion for occasion-based recs' },
        budget: { type: 'number', description: 'Maximum budget' },
        limit: { type: 'number', description: 'Number of results (default 6)' },
      },
      required: ['type'],
    },
  };

  async execute(params: Record<string, unknown>, _context: AgentContext): Promise<ToolResult> {
    const recType = params.type as string;
    const budget = params.budget as number | undefined;
    const limit = (params.limit as number) || 6;

    let recs: ProductSummary[] = await fetchMedusaProductsForAgent({
      limit: Math.max(limit * 2, 12),
      price_max: budget,
    });

    if (budget) recs = recs.filter((p) => p.price <= budget);
    recs = recs.slice(0, limit);

    if (recs.length === 0) {
      return {
        success: true,
        data: {
          recommendations: [],
          type: recType,
          personalized: !!_context.customerId,
          hint: 'No catalog products returned. Check Medusa is running and products are published.',
        },
      };
    }

    return {
      success: true,
      data: { recommendations: recs, type: recType, personalized: !!_context.customerId },
      uiAction: {
        type: 'show_products',
        payload: { products: recs, source: 'recommendations', title: TITLES[recType] || 'Recommendations' },
      },
    };
  }
}
