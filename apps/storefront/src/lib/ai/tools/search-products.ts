import { BaseTool } from './base-tool';
import { fetchMedusaProductsForAgent } from '@/lib/medusa-agent-catalog';
import type { ToolDefinition, ToolResult, AgentContext, ProductSummary } from '../types';

export class SearchProductsTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'search_products',
    description:
      'Search the live BLESSLUXE / Medusa catalog. Supports all storefront departments: use category handles women, men, children, or sale for top-level navigation; also dresses, tops, bottoms, sets, accessories, or other Medusa category handles. Never assume the store is women-only — filter by category and use results.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords or natural language query' },
        category: {
          type: 'string',
          description:
            'Medusa category handle. Department roots: women, men, children, sale. Garment filters: dresses, tops, bottoms, sets, accessories. Use men/children/sale when the customer asks for those departments.',
        },
        colors: { type: 'array', items: { type: 'string' }, description: 'Filter by colors' },
        sizes: { type: 'array', items: { type: 'string' }, description: 'Filter by available sizes' },
        price_min: { type: 'number', description: 'Minimum price in dollars' },
        price_max: { type: 'number', description: 'Maximum price in dollars' },
        styles: { type: 'array', items: { type: 'string' }, description: 'Style tags like casual, formal, bohemian' },
        occasions: { type: 'array', items: { type: 'string' }, description: 'Occasion tags like date-night, work, wedding' },
        sort_by: {
          type: 'string',
          enum: ['relevance', 'price_low', 'price_high', 'newest', 'popular'],
          description: 'Sort order',
        },
        limit: { type: 'number', description: 'Number of results (default 8)' },
      },
    },
  };

  async execute(params: Record<string, unknown>, _context: AgentContext): Promise<ToolResult> {
    const limit = (params.limit as number) || 8;
    const query = (params.query as string) || '';
    const category = params.category as string | undefined;
    const priceMin = params.price_min as number | undefined;
    const priceMax = params.price_max as number | undefined;
    const sortBy = params.sort_by as string | undefined;

    let results: ProductSummary[] = await fetchMedusaProductsForAgent({
      query: query || undefined,
      category,
      price_min: priceMin,
      price_max: priceMax,
      limit,
    });

    if (results.length === 0) {
      return {
        success: true,
        data: {
          products: [],
          totalCount: 0,
          appliedFilters: params,
          hint: 'No products matched. Try a broader search or confirm Medusa is running and products are published.',
        },
      };
    }

    if (sortBy === 'price_low') results = [...results].sort((a, b) => a.price - b.price);
    else if (sortBy === 'price_high') results = [...results].sort((a, b) => b.price - a.price);

    return {
      success: true,
      data: { products: results, totalCount: results.length, appliedFilters: params },
      uiAction: { type: 'show_products', payload: { products: results, source: 'agent_search' } },
    };
  }
}
