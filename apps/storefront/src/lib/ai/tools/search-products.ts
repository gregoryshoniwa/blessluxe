import { BaseTool } from './base-tool';
import type { ToolDefinition, ToolResult, AgentContext, ProductSummary } from '../types';

const MOCK_PRODUCTS: ProductSummary[] = [
  { id: 'prod_1', handle: 'silk-wrap-dress', title: 'Silk Wrap Dress', description: 'Elegant silk wrap dress perfect for any occasion', thumbnail: '/images/products/silk-wrap.jpg', price: 189.99, currency: 'USD', category: 'dresses', tags: ['formal', 'silk', 'wrap'], inStock: true },
  { id: 'prod_2', handle: 'cashmere-cardigan', title: 'Cashmere Cardigan', description: 'Luxuriously soft cashmere cardigan', thumbnail: '/images/products/cashmere-cardigan.jpg', price: 245.00, currency: 'USD', category: 'tops', tags: ['casual', 'cashmere', 'knitwear'], inStock: true },
  { id: 'prod_3', handle: 'pleated-midi-skirt', title: 'Pleated Midi Skirt', description: 'Flowing pleated midi skirt in blush', thumbnail: '/images/products/midi-skirt.jpg', price: 125.00, currency: 'USD', category: 'bottoms', tags: ['casual', 'midi', 'pleated'], inStock: true },
  { id: 'prod_4', handle: 'pearl-earrings', title: 'Pearl Drop Earrings', description: 'Freshwater pearl drop earrings with gold setting', thumbnail: '/images/products/pearl-earrings.jpg', price: 89.99, currency: 'USD', category: 'accessories', tags: ['jewelry', 'pearls', 'gold'], inStock: true },
  { id: 'prod_5', handle: 'linen-blazer', title: 'Linen Blazer', description: 'Tailored linen blazer for effortless style', thumbnail: '/images/products/linen-blazer.jpg', price: 199.00, currency: 'USD', category: 'tops', tags: ['formal', 'linen', 'blazer', 'work'], inStock: true },
  { id: 'prod_6', handle: 'satin-camisole', title: 'Satin Camisole', description: 'Delicate satin camisole with lace trim', thumbnail: '/images/products/satin-cami.jpg', price: 79.00, currency: 'USD', category: 'tops', tags: ['casual', 'satin', 'date-night'], inStock: false },
];

export class SearchProductsTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'search_products',
    description: 'Search for products in the BLESSLUXE catalog by keywords, category, color, price range, and other attributes.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords or natural language query' },
        category: { type: 'string', enum: ['dresses', 'tops', 'bottoms', 'sets', 'accessories', 'sale'], description: 'Filter by category' },
        colors: { type: 'array', items: { type: 'string' }, description: 'Filter by colors' },
        sizes: { type: 'array', items: { type: 'string' }, description: 'Filter by available sizes' },
        price_min: { type: 'number', description: 'Minimum price in dollars' },
        price_max: { type: 'number', description: 'Maximum price in dollars' },
        styles: { type: 'array', items: { type: 'string' }, description: 'Style tags like casual, formal, bohemian' },
        occasions: { type: 'array', items: { type: 'string' }, description: 'Occasion tags like date-night, work, wedding' },
        sort_by: { type: 'string', enum: ['relevance', 'price_low', 'price_high', 'newest', 'popular'], description: 'Sort order' },
        limit: { type: 'number', description: 'Number of results (default 8)' },
      },
    },
  };

  async execute(params: Record<string, unknown>, _context: AgentContext): Promise<ToolResult> {
    let results = [...MOCK_PRODUCTS];
    const query = (params.query as string || '').toLowerCase();
    const category = params.category as string | undefined;
    const priceMin = params.price_min as number | undefined;
    const priceMax = params.price_max as number | undefined;
    const styles = params.styles as string[] | undefined;
    const occasions = params.occasions as string[] | undefined;
    const limit = (params.limit as number) || 8;

    if (query) {
      results = results.filter((p) =>
        p.title.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.tags?.some((t) => t.includes(query))
      );
    }
    if (category) results = results.filter((p) => p.category === category);
    if (priceMin != null) results = results.filter((p) => p.price >= priceMin);
    if (priceMax != null) results = results.filter((p) => p.price <= priceMax);
    if (styles?.length) results = results.filter((p) => p.tags?.some((t) => styles.includes(t)));
    if (occasions?.length) results = results.filter((p) => p.tags?.some((t) => occasions.includes(t)));

    const sortBy = params.sort_by as string | undefined;
    if (sortBy === 'price_low') results.sort((a, b) => a.price - b.price);
    else if (sortBy === 'price_high') results.sort((a, b) => b.price - a.price);

    results = results.slice(0, limit);

    return {
      success: true,
      data: { products: results, totalCount: results.length, appliedFilters: params },
      uiAction: { type: 'show_products', payload: { products: results, source: 'agent_search' } },
    };
  }
}
