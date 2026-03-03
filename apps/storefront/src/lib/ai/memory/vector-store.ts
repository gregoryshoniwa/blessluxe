import type { Memory } from '../types';
import { query } from '@/lib/db';
import { embed, toSqlVector } from './embeddings';

export class VectorStore {
  async store(
    customerId: string,
    content: string,
    contentType: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const embedding = await embed(content);
    const embeddingParam = embedding ? toSqlVector(embedding) : null;

    await query(
      `INSERT INTO ai_customer_memories (customer_id, content, content_type, metadata, embedding)
       VALUES ($1, $2, $3, $4, $5::vector)`,
      [customerId, content, contentType, JSON.stringify(metadata ?? {}), embeddingParam]
    );
  }

  /**
   * RAG search: if embeddings are available, uses cosine similarity via pgvector.
   * Falls back to keyword overlap scoring when no embedding API is configured.
   */
  async search(customerId: string, queryText: string, limit = 5): Promise<Memory[]> {
    const queryEmbedding = await embed(queryText);

    if (queryEmbedding) {
      const rows = await query<{
        content: string;
        content_type: string;
        created_at: string;
        similarity: number;
      }>(
        `SELECT content, content_type, created_at,
                1 - (embedding <=> $2::vector) AS similarity
         FROM ai_customer_memories
         WHERE customer_id = $1 AND embedding IS NOT NULL
         ORDER BY embedding <=> $2::vector
         LIMIT $3`,
        [customerId, toSqlVector(queryEmbedding), limit]
      );

      return rows.map((r) => ({
        content: r.content,
        relevance: Number(r.similarity),
        type: r.content_type,
        timestamp: r.created_at,
      }));
    }

    return this.keywordSearch(customerId, queryText, limit);
  }

  private async keywordSearch(
    customerId: string,
    queryText: string,
    limit: number
  ): Promise<Memory[]> {
    const tokens = queryText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 2);

    if (tokens.length === 0) return [];

    const tsQuery = tokens.join(' | ');
    const rows = await query<{
      content: string;
      content_type: string;
      created_at: string;
      rank: number;
    }>(
      `SELECT content, content_type, created_at,
              ts_rank_cd(to_tsvector('english', content), to_tsquery('english', $2)) AS rank
       FROM ai_customer_memories
       WHERE customer_id = $1
         AND to_tsvector('english', content) @@ to_tsquery('english', $2)
       ORDER BY rank DESC
       LIMIT $3`,
      [customerId, tsQuery, limit]
    );

    const maxRank = rows.length > 0 ? Math.max(...rows.map((r) => Number(r.rank)), 0.001) : 1;
    return rows.map((r) => ({
      content: r.content,
      relevance: Number(r.rank) / maxRank,
      type: r.content_type,
      timestamp: r.created_at,
    }));
  }

  async getByCustomer(
    customerId: string,
    contentType?: string
  ): Promise<{ id: string; customerId: string; content: string; contentType: string; metadata: Record<string, unknown>; createdAt: string }[]> {
    const rows = await query<{
      id: string;
      customer_id: string;
      content: string;
      content_type: string;
      metadata: Record<string, unknown>;
      created_at: string;
    }>(
      contentType
        ? `SELECT id, customer_id, content, content_type, metadata, created_at
           FROM ai_customer_memories WHERE customer_id = $1 AND content_type = $2
           ORDER BY created_at DESC`
        : `SELECT id, customer_id, content, content_type, metadata, created_at
           FROM ai_customer_memories WHERE customer_id = $1
           ORDER BY created_at DESC`,
      contentType ? [customerId, contentType] : [customerId]
    );

    return rows.map((r) => ({
      id: r.id,
      customerId: r.customer_id,
      content: r.content,
      contentType: r.content_type,
      metadata: r.metadata,
      createdAt: r.created_at,
    }));
  }
}
