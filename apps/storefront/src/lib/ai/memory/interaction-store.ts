import type { CustomerInteraction } from '../types';
import { query, queryOne } from '@/lib/db';

export class InteractionStore {
  async track(
    customerId: string,
    type: string,
    data: {
      productId?: string;
      category?: string;
      searchQuery?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<CustomerInteraction> {
    const row = await queryOne<{
      id: string;
      customer_id: string;
      interaction_type: string;
      product_id: string | null;
      category: string | null;
      search_query: string | null;
      metadata: Record<string, unknown>;
      created_at: string;
    }>(
      `INSERT INTO ai_customer_interactions
         (customer_id, interaction_type, product_id, category, search_query, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        customerId,
        type,
        data.productId ?? null,
        data.category ?? null,
        data.searchQuery ?? null,
        JSON.stringify(data.metadata ?? {}),
      ]
    );

    return mapRow(row!);
  }

  async getByCustomer(
    customerId: string,
    options?: { type?: string; limit?: number; since?: Date }
  ): Promise<CustomerInteraction[]> {
    const conditions = ['customer_id = $1'];
    const params: unknown[] = [customerId];
    let idx = 2;

    if (options?.type) {
      conditions.push(`interaction_type = $${idx++}`);
      params.push(options.type);
    }
    if (options?.since) {
      conditions.push(`created_at >= $${idx++}`);
      params.push(options.since.toISOString());
    }

    const limit = options?.limit ?? 50;
    params.push(limit);

    const rows = await query<{
      id: string;
      customer_id: string;
      interaction_type: string;
      product_id: string | null;
      category: string | null;
      search_query: string | null;
      metadata: Record<string, unknown>;
      created_at: string;
    }>(
      `SELECT * FROM ai_customer_interactions
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${idx}`,
      params
    );

    return rows.map(mapRow);
  }

  async getRecentSearches(customerId: string, limit = 10): Promise<string[]> {
    const interactions = await this.getByCustomer(customerId, { type: 'search', limit });
    return interactions.map((i) => i.searchQuery).filter(Boolean) as string[];
  }

  async getViewedProducts(customerId: string, limit = 20): Promise<string[]> {
    const interactions = await this.getByCustomer(customerId, { type: 'view', limit });
    return interactions.map((i) => i.productId).filter(Boolean) as string[];
  }

  async getStats(customerId: string): Promise<{
    totalViews: number;
    totalSearches: number;
    totalCartAdds: number;
    totalPurchases: number;
  }> {
    const row = await queryOne<{
      views: string;
      searches: string;
      cart_adds: string;
      purchases: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE interaction_type = 'view') AS views,
         COUNT(*) FILTER (WHERE interaction_type = 'search') AS searches,
         COUNT(*) FILTER (WHERE interaction_type = 'add_to_cart') AS cart_adds,
         COUNT(*) FILTER (WHERE interaction_type = 'purchase') AS purchases
       FROM ai_customer_interactions
       WHERE customer_id = $1`,
      [customerId]
    );

    return {
      totalViews: parseInt(row?.views ?? '0', 10),
      totalSearches: parseInt(row?.searches ?? '0', 10),
      totalCartAdds: parseInt(row?.cart_adds ?? '0', 10),
      totalPurchases: parseInt(row?.purchases ?? '0', 10),
    };
  }
}

function mapRow(r: {
  id: string;
  customer_id: string;
  interaction_type: string;
  product_id: string | null;
  category: string | null;
  search_query: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}): CustomerInteraction {
  return {
    id: r.id,
    customerId: r.customer_id,
    interactionType: r.interaction_type,
    productId: r.product_id ?? undefined,
    category: r.category ?? undefined,
    searchQuery: r.search_query ?? undefined,
    metadata: r.metadata,
    createdAt: r.created_at,
  };
}
