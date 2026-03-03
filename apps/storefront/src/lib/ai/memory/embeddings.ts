/**
 * Embedding utility for RAG pipeline.
 *
 * Supports two modes:
 * 1. Google Gemini embeddings (uses the same API key as the live voice)
 * 2. Keyword fallback (no external API needed — used when no embedding key is set)
 *
 * The keyword fallback still persists to the DB and uses PostgreSQL's
 * ts_vector full-text search as a secondary ranking signal.
 */

const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-004';
const DIMENSIONS = 768;

export type EmbeddingVector = number[];

export async function embed(text: string): Promise<EmbeddingVector | null> {
  if (!GOOGLE_API_KEY) return null;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
          outputDimensionality: DIMENSIONS,
        }),
      }
    );

    if (!res.ok) {
      console.warn('[embeddings] API error:', res.status, await res.text());
      return null;
    }

    const data = await res.json();
    return data.embedding?.values ?? null;
  } catch (err) {
    console.warn('[embeddings] Failed to generate embedding:', err);
    return null;
  }
}

export async function embedBatch(texts: string[]): Promise<(EmbeddingVector | null)[]> {
  return Promise.all(texts.map(embed));
}

export function toSqlVector(vec: EmbeddingVector): string {
  return `[${vec.join(',')}]`;
}

export { DIMENSIONS };
