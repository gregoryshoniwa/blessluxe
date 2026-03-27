/**
 * Server-side Medusa Store API helpers for the AI agent (search / view / cart resolution).
 */
import { getStoreMedusaFetchHeaders } from '@/lib/medusa';
import { buildPdpVariantRows, type PdpVariantRow } from '@/lib/medusa-pdp';
import type { ProductSummary, VariantSummary } from '@/lib/ai/types';

export function getMedusaBaseCandidates(): string[] {
  const configured = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000').replace(
    /\/+$/,
    ''
  );
  return Array.from(
    new Set([configured, 'http://medusa:9000', 'http://host.docker.internal:9000', 'http://localhost:9000'])
  );
}

export function toPublicImageUrl(value: string): string {
  const input = String(value || '').trim();
  if (!input) return '';
  const publicBase = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000').replace(/\/+$/, '');
  if (input.startsWith('/')) return `${publicBase}${input}`;
  if (input.startsWith('http://medusa:9000')) return `${publicBase}${input.slice('http://medusa:9000'.length)}`;
  if (input.startsWith('https://medusa:9000')) return `${publicBase}${input.slice('https://medusa:9000'.length)}`;
  return input;
}

async function getDefaultRegionId(base: string): Promise<string> {
  try {
    const url = new URL('/store/regions', base);
    url.searchParams.set('limit', '1');
    const response = await fetch(url.toString(), {
      cache: 'no-store',
      headers: getStoreMedusaFetchHeaders(),
    });
    if (!response.ok) return '';
    const payload = (await response.json()) as { regions?: Array<Record<string, unknown>> };
    return String(payload.regions?.[0]?.id || '');
  } catch {
    return '';
  }
}

/** When calculated_price / options are missing, fall back to raw variant prices (cents → dollars). */
function fallbackPriceFromRawProduct(raw: Record<string, unknown>): number {
  const variants = Array.isArray(raw.variants) ? (raw.variants as Array<Record<string, unknown>>) : [];
  const v = variants[0];
  if (!v) return 0;
  const prices = (v.prices as Array<Record<string, unknown>> | undefined) || [];
  const cents = Number(prices[0]?.amount ?? v.amount ?? 0);
  return cents > 0 ? Math.round(cents) / 100 : 0;
}

function rowToVariantSummary(row: PdpVariantRow): VariantSummary {
  const inv =
    typeof row.inventoryQuantity === "number"
      ? row.inventoryQuantity
      : row.inStock
        ? 1
        : 0;
  return {
    id: row.id,
    title: `${row.color} / ${row.size}`,
    sku: row.sku ?? undefined,
    price: row.salePrice ?? row.price,
    inventoryQuantity: inv,
    options: { Color: row.color, Size: row.size },
  };
}

export function mapMedusaProductToProductSummary(raw: Record<string, unknown>): ProductSummary {
  const rows = buildPdpVariantRows(raw);
  const first = rows[0];
  const variants: VariantSummary[] = rows.map(rowToVariantSummary);
  const listPrice = first ? first.price : 0;
  const salePrice = first?.salePrice;
  let displayPrice = salePrice ?? listPrice;
  if (!displayPrice || displayPrice <= 0) {
    displayPrice = fallbackPriceFromRawProduct(raw);
  }

  const categories = Array.isArray(raw.categories) ? (raw.categories as Array<Record<string, unknown>>) : [];
  const firstCategory = categories[0];
  const category = String(firstCategory?.handle || firstCategory?.name || '');
  const tagSet = new Set<string>();
  for (const cat of categories) {
    const h = String(cat.handle || '')
      .trim()
      .toLowerCase();
    const n = String(cat.name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-');
    if (h) tagSet.add(h);
    if (n) tagSet.add(n);
  }

  const images = Array.isArray(raw.images) ? (raw.images as Array<Record<string, unknown>>) : [];
  const imageUrls = images.map((img) => toPublicImageUrl(String(img.url || ''))).filter(Boolean);
  const thumb = toPublicImageUrl(String(raw.thumbnail || ''));
  const thumbnail = thumb || imageUrls[0] || undefined;

  return {
    id: String(raw.id || ''),
    handle: String(raw.handle || ''),
    title: String(raw.title || 'Product'),
    description: String(raw.description || '').trim().slice(0, 2000) || undefined,
    thumbnail,
    price: displayPrice,
    compareAtPrice:
      first && salePrice != null && listPrice > salePrice ? listPrice : undefined,
    currency: 'USD',
    category: category || undefined,
    tags: tagSet.size > 0 ? [...tagSet] : [],
    variants: variants.length ? variants : undefined,
    inStock: rows.length === 0 ? true : rows.some((r) => r.inStock),
  };
}

/** Medusa v2: single product by id uses path param (list + id[] is unreliable in some setups). */
async function fetchStoreProductByIdPath(
  base: string,
  productId: string,
  regionId: string
): Promise<Record<string, unknown> | null> {
  const url = new URL(`/store/products/${encodeURIComponent(productId)}`, base);
  if (regionId) url.searchParams.set('region_id', regionId);
  const response = await fetch(url.toString(), {
    cache: 'no-store',
    headers: getStoreMedusaFetchHeaders(),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as Record<string, unknown>;
  const product =
    (payload.product as Record<string, unknown> | undefined) ||
    ((payload.data as Record<string, unknown> | undefined)?.product as Record<string, unknown> | undefined);
  return product ?? null;
}

export async function fetchMedusaStoreProductRaw(input: {
  handle?: string;
  id?: string;
}): Promise<Record<string, unknown> | null> {
  const handle = input.handle?.trim();
  const id = input.id?.trim();
  if (!handle && !id) return null;

  for (const base of getMedusaBaseCandidates()) {
    try {
      const regionId = await getDefaultRegionId(base);
      if (id && !handle) {
        const direct = await fetchStoreProductByIdPath(base, id, regionId);
        if (direct) return direct;
      }

      const url = new URL('/store/products', base);
      url.searchParams.set('limit', '1');
      if (regionId) url.searchParams.set('region_id', regionId);
      if (handle) url.searchParams.set('handle', handle);
      else if (id) {
        url.searchParams.append('id[]', id);
      }

      let response = await fetch(url.toString(), {
        cache: 'no-store',
        headers: getStoreMedusaFetchHeaders(),
      });
      if (response.ok) {
        const payload = (await response.json()) as { products?: Array<Record<string, unknown>> };
        const row = (payload.products || [])[0];
        if (row) return row;
      }

      if (id && !handle) {
        const url2 = new URL('/store/products', base);
        url2.searchParams.set('limit', '1');
        if (regionId) url2.searchParams.set('region_id', regionId);
        url2.searchParams.set('id', id);
        response = await fetch(url2.toString(), {
          cache: 'no-store',
          headers: getStoreMedusaFetchHeaders(),
        });
        if (response.ok) {
          const payload2 = (await response.json()) as { products?: Array<Record<string, unknown>> };
          const row2 = (payload2.products || [])[0];
          if (row2) return row2;
        }
      }
    } catch {
      // try next base
    }
  }
  return null;
}

export async function fetchMedusaProductSummaryByHandleOrId(input: {
  handle?: string;
  product_id?: string;
}): Promise<ProductSummary | null> {
  const raw = await fetchMedusaStoreProductRaw({
    handle: input.handle,
    id: input.product_id,
  });
  if (!raw) return null;
  return mapMedusaProductToProductSummary(raw);
}

/** Resolve Medusa product ids (in order, deduped) for agent emails — titles, handles, prices. */
export async function fetchProductSummariesForEmail(ids: string[]): Promise<ProductSummary[]> {
  const unique = [...new Set(ids.map((s) => String(s).trim()).filter(Boolean))];
  const out: ProductSummary[] = [];
  for (const id of unique) {
    const s = await fetchMedusaProductSummaryByHandleOrId({ product_id: id });
    if (s) out.push(s);
  }
  return out;
}

type StoreCategoryRow = { id: string; handle?: string; parent_category_id?: string | null };

/** Same as shop ProductGrid: category + direct children (via Store API — no DB/pg on client bundle). */
async function resolveCategoryIdsByHandle(handle: string, base: string): Promise<string[] | undefined> {
  const h = handle.trim().toLowerCase();
  if (!h) return undefined;
  try {
    const url = new URL('/store/product-categories', base);
    url.searchParams.set('limit', '200');
    const res = await fetch(url.toString(), {
      cache: 'no-store',
      headers: getStoreMedusaFetchHeaders(),
    });
    if (!res.ok) return undefined;
    const raw = (await res.json()) as Record<string, unknown>;
    const cats = (raw.product_categories as StoreCategoryRow[] | undefined) || [];
    const match = cats.find((c) => String(c.handle || '').toLowerCase() === h);
    if (!match?.id) return undefined;
    const ids = [match.id];
    for (const c of cats) {
      if (c.parent_category_id === match.id) ids.push(c.id);
    }
    return ids;
  } catch {
    return undefined;
  }
}

function combinedSearchText(p: ProductSummary): string {
  return `${p.title} ${p.handle} ${p.description || ''} ${p.category || ''} ${(p.tags || []).join(' ')}`.toLowerCase();
}

/** Match full phrase or every token (≥2 chars) — aligns with how users type product names. */
export function textMatchesProductQuery(p: ProductSummary, queryRaw: string): boolean {
  const query = queryRaw.trim().toLowerCase();
  if (!query) return true;
  const combined = combinedSearchText(p);
  if (combined.includes(query)) return true;
  const tokens = query.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return true;
  return tokens.every((t) => combined.includes(t));
}

/**
 * When the model passes category=dresses, the product title rarely contains the substring "dresses"
 * (e.g. "Velvet Cocktail Dress"). Match Medusa category handles/tags, or keyword roots.
 */
function matchesCategoryParam(p: ProductSummary, categoryParam: string): boolean {
  const c = categoryParam.toLowerCase().trim();
  if (!c) return true;
  const cat = (p.category || '').toLowerCase();
  if (cat.includes(c) || c.includes(cat)) return true;
  for (const t of p.tags || []) {
    const tl = t.toLowerCase();
    if (tl.includes(c) || c.includes(tl)) return true;
  }
  const roots: Record<string, RegExp> = {
    women: /\b(women|womens|womenswear|ladies|lady|female)\b/i,
    men: /\b(men|mens|menswear|gentleman|male|guys|suit|blazer)\b/i,
    children: /\b(child|children|kids|kid|boys|girls|toddler|youth|teen|baby)\b/i,
    sale: /\b(sale|clearance|discount)\b/i,
    dresses: /\b(dress|dresses|gown|gowns)\b/i,
    tops: /\b(top|tops|shirt|blouse|camisole|tank|tee|sweater|cardigan|blazer|coat)\b/i,
    bottoms: /\b(bottom|pant|pants|jean|jeans|skirt|shorts|trouser|legging)\b/i,
    sets: /\b(set|sets|co-ord|coordinates)\b/i,
    accessories: /\b(accessory|accessories|bag|belt|jewelry|earring|necklace|scarf|hat)\b/i,
  };
  const re = roots[c];
  if (re && re.test(p.title)) return true;
  if (re && re.test(combinedSearchText(p))) return true;
  return false;
}

export async function fetchMedusaProductsForAgent(params: {
  query?: string;
  category?: string;
  price_min?: number;
  price_max?: number;
  limit?: number;
}): Promise<ProductSummary[]> {
  const limit = Math.min(Math.max(params.limit ?? 12, 1), 48);
  const queryRaw = (params.query || '').trim();

  for (const base of getMedusaBaseCandidates()) {
    try {
      let categoryIds: string[] | undefined;
      if (params.category) {
        categoryIds = await resolveCategoryIdsByHandle(params.category, base);
      }

      const regionId = await getDefaultRegionId(base);
      const url = new URL('/store/products', base);
      url.searchParams.set('limit', categoryIds?.length ? '200' : '500');
      if (regionId) url.searchParams.set('region_id', regionId);
      if (categoryIds?.length) {
        for (const id of categoryIds) {
          url.searchParams.append('category_id[]', id);
        }
      }

      const response = await fetch(url.toString(), {
        cache: 'no-store',
        headers: getStoreMedusaFetchHeaders(),
      });
      if (!response.ok) continue;

      const payload = (await response.json()) as { products?: Array<Record<string, unknown>> };
      let list = (payload.products || []).map(mapMedusaProductToProductSummary);

      if (queryRaw) {
        list = list.filter((p) => textMatchesProductQuery(p, queryRaw));
      }

      const categoryFilter = params.category;
      if (categoryFilter) {
        if (!categoryIds?.length) {
          list = list.filter((p) => matchesCategoryParam(p, categoryFilter));
        }
      }

      const priceMin = params.price_min;
      const priceMax = params.price_max;
      if (priceMin != null) list = list.filter((p) => p.price >= priceMin);
      if (priceMax != null) list = list.filter((p) => p.price <= priceMax);

      return list.slice(0, limit);
    } catch {
      // next base
    }
  }

  return [];
}

/** First in-stock variant id for add-to-cart when the model omits variant_id. */
export async function resolveDefaultVariantIdForProduct(input: {
  product_id?: string;
  handle?: string;
}): Promise<string | null> {
  const raw = await fetchMedusaStoreProductRaw({
    id: input.product_id,
    handle: input.handle,
  });
  if (!raw) return null;
  const row = buildPdpVariantRows(raw).find((r) => r.inStock) ?? buildPdpVariantRows(raw)[0];
  return row?.id ?? null;
}
