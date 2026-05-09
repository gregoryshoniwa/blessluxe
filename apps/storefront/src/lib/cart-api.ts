/**
 * Storefront cart API — talks directly to the BLESSLUXE shop backend's
 * `/store/carts/*` routes via fetch. We bypass `@medusajs/js-sdk` here because
 * the SDK insists on a publishable key + region negotiation that doesn't apply
 * to our setup, and silently throws when those checks fail.
 */

import { MEDUSA_BACKEND_URL, getStoreMedusaFetchHeaders } from "@/lib/medusa";

interface CartFetchOpts {
  method?: string;
  body?: unknown;
}

export class CartApiError extends Error {
  status: number;
  detail: string | null;
  constructor(status: number, message: string, detail: string | null = null) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function cartFetch<T>(path: string, opts: CartFetchOpts = {}): Promise<T> {
  const url = new URL(path, MEDUSA_BACKEND_URL);
  const headers: Record<string, string> = {
    ...getStoreMedusaFetchHeaders(),
  };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(url.toString(), {
    method: opts.method || (opts.body !== undefined ? "POST" : "GET"),
    headers,
    cache: "no-store",
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-json error response */
  }
  if (!res.ok) {
    const message =
      (data as { message?: string; error?: string })?.message ||
      (data as { message?: string; error?: string })?.error ||
      res.statusText ||
      "Cart request failed";
    throw new CartApiError(res.status, message, JSON.stringify(data || null));
  }
  return data as T;
}

export interface ShopCart {
  id: string;
  region_id: string | null;
  items: ShopLineItem[];
  created_at: string;
  updated_at: string;
}

export interface ShopLineItem {
  id: string;
  variant_id: string;
  product_id: string;
  title: string;
  thumbnail: string | null;
  quantity: number;
  unit_price: number;
  description: string | null;
  metadata: Record<string, unknown> | null;
  variant: {
    id: string;
    title: string;
    sku: string | null;
    inventory_quantity: number;
    product: {
      id: string;
      title: string;
      handle: string;
      thumbnail: string | null;
      images: Array<{ url: string }>;
    };
  };
  product: {
    id: string;
    title: string;
    handle: string;
    thumbnail: string | null;
    images: Array<{ url: string }>;
  };
}

export const cartApi = {
  create: (regionId?: string | null) =>
    cartFetch<{ cart: ShopCart }>("/store/carts", {
      body: { region_id: regionId || null },
    }),
  retrieve: (cartId: string) => cartFetch<{ cart: ShopCart }>(`/store/carts/${cartId}`),
  addLine: (
    cartId: string,
    body: { variant_id: string; quantity: number; metadata?: Record<string, unknown> }
  ) =>
    cartFetch<{ cart: ShopCart }>(`/store/carts/${cartId}/line-items`, {
      body,
    }),
  updateLine: (cartId: string, lineId: string, quantity: number) =>
    cartFetch<{ cart: ShopCart }>(`/store/carts/${cartId}/line-items/${lineId}`, {
      body: { quantity },
    }),
  deleteLine: (cartId: string, lineId: string) =>
    cartFetch<{ id: string; object: "line-item"; deleted: true; parent: ShopCart }>(
      `/store/carts/${cartId}/line-items/${lineId}`,
      { method: "DELETE" }
    ),
  variantInventory: (variantId: string) =>
    cartFetch<{ variant?: { id?: string; inventory_quantity?: number } }>(
      `/store/product-variants/${encodeURIComponent(variantId)}`
    ),
};
