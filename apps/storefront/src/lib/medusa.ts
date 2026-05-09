import Medusa from "@medusajs/js-sdk";

/**
 * Commerce backend URL. Points at the BLESSLUXE shop backend (Express, port 9001
 * by default). The Medusa JS SDK is used purely as an HTTP client because the
 * shop backend exposes Medusa-shaped `/store/*` endpoints.
 *
 * Override with `NEXT_PUBLIC_COMMERCE_BACKEND` (preferred) or the legacy
 * `NEXT_PUBLIC_MEDUSA_BACKEND_URL` env var.
 */
const MEDUSA_BACKEND_URL =
  process.env.NEXT_PUBLIC_COMMERCE_BACKEND ||
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
  "http://localhost:9001";

const PUBLISHABLE_API_KEY =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || "";

/**
 * Always true now — kept for backward-compat with code that branched on
 * "is the storefront talking to Medusa or the custom backend?".
 */
export const isCustomBackend = true;

export const medusa = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  debug: false,
  ...(PUBLISHABLE_API_KEY ? { publishableKey: PUBLISHABLE_API_KEY } : {}),
});

/** Typed headers for direct `fetch` to the Store API (avoids `HeadersInit` union issues). */
export function getStoreMedusaFetchHeaders(): Record<string, string> {
  const h: Record<string, string> = { accept: "application/json" };
  const key = (
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
    process.env.MEDUSA_PUBLISHABLE_KEY ||
    ""
  ).trim();
  if (key) h["x-publishable-api-key"] = key;
  return h;
}

export { MEDUSA_BACKEND_URL };

/**
 * Resolve a backend-served image url for the browser. The shop backend serves
 * uploads under `/uploads/...` so relative paths get prefixed with the backend
 * base. Absolute URLs pass through unchanged.
 */
export function normalizeMedusaImageUrl(value: string | null | undefined): string {
  const input = String(value || "").trim();
  if (!input) return "";
  const publicBase = MEDUSA_BACKEND_URL.replace(/\/+$/, "");
  if (input.startsWith("/")) return `${publicBase}${input}`;
  return input;
}

function pickStoreProductImageUrl(p: {
  thumbnail?: string;
  images?: Array<{ url?: string }>;
}): string | null {
  const candidates = [
    String(p.thumbnail || "").trim(),
    ...(Array.isArray(p.images) ? p.images.map((img) => String(img?.url || "").trim()) : []),
  ].filter(Boolean);
  for (const raw of candidates) {
    const normalized = normalizeMedusaImageUrl(raw);
    if (normalized) return normalized;
  }
  return null;
}

/**
 * Load thumbnail + store handle for a product (Store API). Used by /shop/packs and pack APIs.
 */
export async function fetchStoreProductThumbAndHandle(
  productId: string
): Promise<{ thumb: string | null; handle: string | null }> {
  try {
    const url = new URL(`/store/products/${encodeURIComponent(productId)}`, MEDUSA_BACKEND_URL);
    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: getStoreMedusaFetchHeaders(),
    });
    if (!res.ok) return { thumb: null, handle: null };
    const j = (await res.json()) as {
      product?: { handle?: string; thumbnail?: string; images?: Array<{ url?: string }> };
    };
    const p = j.product;
    if (!p) return { thumb: null, handle: null };
    return {
      thumb: pickStoreProductImageUrl(p),
      handle: String(p.handle || "").trim() || null,
    };
  } catch {
    return { thumb: null, handle: null };
  }
}
