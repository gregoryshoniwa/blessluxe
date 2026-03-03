import { BaseTool } from './base-tool';
import type { ToolDefinition, ToolResult, AgentContext, ProductSummary } from '../types';

const RECOMMENDATION_POOL: ProductSummary[] = [
  { id: 'rec_1', handle: 'velvet-evening-gown', title: 'Velvet Evening Gown', description: 'Stunning velvet evening gown', thumbnail: '/images/products/velvet-gown.jpg', price: 340.00, currency: 'USD', category: 'dresses', tags: ['formal', 'evening', 'velvet'], inStock: true },
  { id: 'rec_2', handle: 'silk-scarf', title: 'Silk Scarf — Floral', description: 'Hand-painted floral silk scarf', thumbnail: '/images/products/silk-scarf.jpg', price: 65.00, currency: 'USD', category: 'accessories', tags: ['silk', 'scarf', 'floral'], inStock: true },
  { id: 'rec_3', handle: 'tailored-trousers', title: 'Tailored Wide-Leg Trousers', description: 'High-waisted wide-leg trousers in cream', thumbnail: '/images/products/trousers.jpg', price: 155.00, currency: 'USD', category: 'bottoms', tags: ['work', 'tailored', 'wide-leg'], inStock: true },
  { id: 'rec_4', handle: 'gold-chain-necklace', title: 'Gold Chain Necklace', description: '18k gold-plated chain necklace', thumbnail: '/images/products/gold-necklace.jpg', price: 120.00, currency: 'USD', category: 'accessories', tags: ['jewelry', 'gold', 'necklace'], inStock: true },
  { id: 'rec_5', handle: 'cotton-sundress', title: 'Cotton Sundress', description: 'Breezy cotton sundress with tie straps', thumbnail: '/images/products/sundress.jpg', price: 98.00, currency: 'USD', category: 'dresses', tags: ['casual', 'summer', 'cotton'], inStock: true },
  { id: 'rec_6', handle: 'leather-tote', title: 'Leather Tote Bag', description: 'Genuine leather tote in cognac', thumbnail: '/images/products/leather-tote.jpg', price: 275.00, currency: 'USD', category: 'accessories', tags: ['bags', 'leather', 'work'], inStock: true },
];

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
    description: 'Get personalized product recommendations based on customer preferences, history, and context.',
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

    let recs = [...RECOMMENDATION_POOL];
    if (budget) recs = recs.filter((p) => p.price <= budget);
    recs = recs.slice(0, limit);

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
