"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  MEDUSA_BACKEND_URL,
  getStoreMedusaFetchHeaders,
} from "@/lib/medusa";

// ─── Types ──────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  title: string;
  handle: string;
  description: string | null;
  thumbnail: string | null;
  images: { url: string }[];
  variants: {
    id: string;
    title: string;
    sku: string | null;
    prices: { amount: number; currency_code: string }[];
  }[];
  collection?: {
    id: string;
    title: string;
    handle: string;
  };
  tags?: { value: string }[];
}

export interface Category {
  id: string;
  name: string;
  handle: string;
  description: string | null;
  parent_category_id: string | null;
}

export interface MedusaRegionRef {
  id: string;
}

// ─── Direct fetch helpers ───────────────────────────────────────────────
// We bypass @medusajs/js-sdk here to make network failures visible (the SDK
// swallowed errors silently in dev) and to give us a single, predictable
// URL-encoding path regardless of query shape.

function buildStoreUrl(path: string, params: Record<string, unknown>): string {
  const url = new URL(path, MEDUSA_BACKEND_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item != null) url.searchParams.append(k, String(item));
      }
    } else {
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function fetchStore<T>(
  path: string,
  params: Record<string, unknown>,
  errorContext: string
): Promise<T | null> {
  try {
    const url = buildStoreUrl(path, params);
    const res = await fetch(url, {
      headers: getStoreMedusaFetchHeaders(),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[${errorContext}] ${res.status}`, await res.text().catch(() => ""));
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error(`[${errorContext}] fetch failed`, err);
    return null;
  }
}

// ─── Hooks ──────────────────────────────────────────────────────────────

export function useRegions(): UseQueryResult<MedusaRegionRef[], Error> {
  return useQuery({
    queryKey: ["regions"],
    queryFn: async (): Promise<MedusaRegionRef[]> => {
      const data = await fetchStore<{ regions: { id: string }[] }>(
        "/store/regions",
        {},
        "regions"
      );
      return (data?.regions ?? []).map((r) => ({ id: String(r.id) }));
    },
    staleTime: 1000 * 60 * 30,
  });
}

export function useProducts(options?: {
  limit?: number;
  offset?: number;
  collection_id?: string[];
  category_id?: string[];
  q?: string | null;
}) {
  const { data: regions } = useRegions();
  const regionId = regions?.[0]?.id;

  return useQuery({
    queryKey: ["products", options, regionId],
    queryFn: async () => {
      const params: Record<string, unknown> = {
        limit: options?.limit ?? 12,
        offset: options?.offset ?? 0,
        collection_id: options?.collection_id,
        category_id: options?.category_id,
        region_id: regionId,
      };
      if (options?.q && options.q.trim()) params.q = options.q.trim();
      const data = await fetchStore<{ products: Product[] }>(
        "/store/products",
        params,
        "products"
      );
      return data?.products ?? [];
    },
  });
}

export function useProduct(handle: string) {
  const { data: regions } = useRegions();
  const regionId = regions?.[0]?.id;

  return useQuery({
    queryKey: ["product", handle, regionId],
    queryFn: async () => {
      const data = await fetchStore<{ products: Product[] }>(
        "/store/products",
        { handle, limit: 1, region_id: regionId },
        "product"
      );
      return data?.products?.[0];
    },
    enabled: !!handle,
  });
}

export function useFeaturedProducts(limit: number = 8) {
  const { data: regions } = useRegions();
  const regionId = regions?.[0]?.id;

  return useQuery({
    queryKey: ["featured-products", limit, regionId],
    queryFn: async () => {
      const data = await fetchStore<{ products: Product[] }>(
        "/store/products",
        { limit, region_id: regionId },
        "featured-products"
      );
      return data?.products ?? [];
    },
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/catalog/categories", {
          cache: "no-store",
        });
        if (!response.ok) return [];
        const payload = (await response.json()) as { categories?: Category[] };
        return payload.categories ?? [];
      } catch {
        return [];
      }
    },
  });
}

// ─── Hierarchy: headings → catalogues ────────────────────────────────────

export interface Catalogue {
  id: string;
  heading_id: string;
  heading_handle?: string;
  heading_name?: string;
  name: string;
  handle: string;
  description: string | null;
  thumbnail: string | null;
  rank: number;
  is_active: boolean;
  product_count?: number;
}

export interface Heading {
  id: string;
  name: string;
  handle: string;
  description: string | null;
  rank: number;
  is_active: boolean;
  is_sale: boolean;
  catalogues: Catalogue[];
}

export function useHeadings(): UseQueryResult<Heading[], Error> {
  return useQuery({
    queryKey: ["headings"],
    queryFn: async (): Promise<Heading[]> => {
      const data = await fetchStore<{ headings: Heading[] }>(
        "/store/headings",
        {},
        "headings"
      );
      return data?.headings ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });
}
