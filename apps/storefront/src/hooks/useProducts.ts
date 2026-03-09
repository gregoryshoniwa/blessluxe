"use client";

import { useQuery } from "@tanstack/react-query";
import { medusa } from "@/lib/medusa";

// Placeholder product type until Medusa types are available
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

/**
 * Fetch regions to get default region_id for pricing
 */
export function useRegions() {
  return useQuery({
    queryKey: ["regions"],
    queryFn: async () => {
      try {
        const response = await medusa.store.region.list();
        return response.regions;
      } catch {
        return [];
      }
    },
    staleTime: 1000 * 60 * 30,
  });
}

/**
 * Fetch all products with optional filters
 */
export function useProducts(options?: {
  limit?: number;
  offset?: number;
  collection_id?: string[];
  category_id?: string[];
}) {
  const { data: regions } = useRegions();
  const regionId = regions?.[0]?.id;

  return useQuery({
    queryKey: ["products", options, regionId],
    queryFn: async () => {
      try {
        const params: Record<string, unknown> = {
          limit: options?.limit ?? 12,
          offset: options?.offset ?? 0,
          collection_id: options?.collection_id,
          category_id: options?.category_id,
        };
        if (regionId) {
          params.region_id = regionId;
        }
        const response = await medusa.store.product.list({
          ...params,
        });
        return response.products as unknown as Product[];
      } catch {
        return [];
      }
    },
  });
}

/**
 * Fetch a single product by handle
 */
export function useProduct(handle: string) {
  const { data: regions } = useRegions();
  const regionId = regions?.[0]?.id;

  return useQuery({
    queryKey: ["product", handle, regionId],
    queryFn: async () => {
      try {
        const params: Record<string, unknown> = {
          handle,
          limit: 1,
        };
        if (regionId) {
          params.region_id = regionId;
        }
        const response = await medusa.store.product.list({
          ...params,
        });
        return response.products[0] as unknown as Product | undefined;
      } catch {
        return undefined;
      }
    },
    enabled: !!handle,
  });
}

/**
 * Fetch featured products
 */
export function useFeaturedProducts(limit: number = 8) {
  const { data: regions } = useRegions();
  const regionId = regions?.[0]?.id;

  return useQuery({
    queryKey: ["featured-products", limit, regionId],
    queryFn: async () => {
      try {
        const params: Record<string, unknown> = { limit };
        if (regionId) {
          params.region_id = regionId;
        }
        const response = await medusa.store.product.list({
          ...params,
        });
        return response.products as unknown as Product[];
      } catch {
        return [];
      }
    },
  });
}

/**
 * Fetch product categories
 */
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
