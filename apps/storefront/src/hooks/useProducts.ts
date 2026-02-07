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
 * Fetch all products with optional filters
 */
export function useProducts(options?: {
  limit?: number;
  offset?: number;
  collection_id?: string[];
  category_id?: string[];
}) {
  return useQuery({
    queryKey: ["products", options],
    queryFn: async () => {
      try {
        const response = await medusa.store.product.list({
          limit: options?.limit ?? 12,
          offset: options?.offset ?? 0,
          collection_id: options?.collection_id,
          category_id: options?.category_id,
        });
        return response.products as Product[];
      } catch {
        // Return mock data if backend unavailable
        return getMockProducts();
      }
    },
  });
}

/**
 * Fetch a single product by handle
 */
export function useProduct(handle: string) {
  return useQuery({
    queryKey: ["product", handle],
    queryFn: async () => {
      try {
        const response = await medusa.store.product.list({
          handle,
          limit: 1,
        });
        return response.products[0] as Product | undefined;
      } catch {
        return getMockProducts().find((p) => p.handle === handle);
      }
    },
    enabled: !!handle,
  });
}

/**
 * Fetch featured products
 */
export function useFeaturedProducts(limit: number = 8) {
  return useQuery({
    queryKey: ["featured-products", limit],
    queryFn: async () => {
      try {
        const response = await medusa.store.product.list({
          limit,
          // Add tag filter for featured products if supported
        });
        return response.products as Product[];
      } catch {
        return getMockProducts().slice(0, limit);
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
        const response = await medusa.store.category.list({
          include_descendants_tree: true,
        });
        return response.product_categories as Category[];
      } catch {
        return getMockCategories();
      }
    },
  });
}

// Mock data for development/fallback
function getMockProducts(): Product[] {
  return [
    {
      id: "prod_01",
      title: "Silk Wrap Dress",
      handle: "silk-wrap-dress",
      description: "Elegant silk wrap dress perfect for any occasion",
      thumbnail: null,
      images: [],
      variants: [
        {
          id: "variant_01",
          title: "S / Navy",
          sku: "SWD-S-NAV",
          prices: [{ amount: 18900, currency_code: "USD" }],
        },
      ],
    },
    {
      id: "prod_02",
      title: "Satin Blouse",
      handle: "satin-blouse",
      description: "Luxurious satin blouse with a relaxed fit",
      thumbnail: null,
      images: [],
      variants: [
        {
          id: "variant_02",
          title: "M / Cream",
          sku: "SB-M-CRM",
          prices: [{ amount: 8900, currency_code: "USD" }],
        },
      ],
    },
    {
      id: "prod_03",
      title: "Cashmere Cardigan",
      handle: "cashmere-cardigan",
      description: "Soft cashmere cardigan for everyday luxury",
      thumbnail: null,
      images: [],
      variants: [
        {
          id: "variant_03",
          title: "M / Blush",
          sku: "CC-M-BLU",
          prices: [{ amount: 24900, currency_code: "USD" }],
        },
      ],
    },
    {
      id: "prod_04",
      title: "Pleated Midi Skirt",
      handle: "pleated-midi-skirt",
      description: "Flowing pleated midi skirt in rich gold",
      thumbnail: null,
      images: [],
      variants: [
        {
          id: "variant_04",
          title: "S / Gold",
          sku: "PMS-S-GLD",
          prices: [{ amount: 12900, currency_code: "USD" }],
        },
      ],
    },
  ];
}

function getMockCategories(): Category[] {
  return [
    { id: "cat_01", name: "Dresses", handle: "dresses", description: null, parent_category_id: null },
    { id: "cat_02", name: "Tops", handle: "tops", description: null, parent_category_id: null },
    { id: "cat_03", name: "Bottoms", handle: "bottoms", description: null, parent_category_id: null },
    { id: "cat_04", name: "Sets", handle: "sets", description: null, parent_category_id: null },
    { id: "cat_05", name: "Accessories", handle: "accessories", description: null, parent_category_id: null },
    { id: "cat_06", name: "Sale", handle: "sale", description: null, parent_category_id: null },
  ];
}
