import Medusa from "@medusajs/js-sdk";

const MEDUSA_BACKEND_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000";

const PUBLISHABLE_API_KEY =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || "";

export const medusa = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  debug: process.env.NODE_ENV === "development",
  ...(PUBLISHABLE_API_KEY ? { publishableKey: PUBLISHABLE_API_KEY } : {}),
});

/** Typed headers for direct `fetch` to the Medusa Store API (avoids `HeadersInit` union issues). */
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
 * Resolve Medusa `thumbnail` / image `url` values for the browser (relative paths,
 * `http://medusa:9000`, etc.). Matches PDP and shop grid behavior.
 */
export function normalizeMedusaImageUrl(value: string | null | undefined): string {
  const input = String(value || "").trim();
  if (!input) return "";
  const publicBase = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(
    /\/+$/,
    ""
  );
  if (input.startsWith("/")) return `${publicBase}${input}`;
  if (input.startsWith("http://medusa:9000")) {
    return `${publicBase}${input.slice("http://medusa:9000".length)}`;
  }
  if (input.startsWith("https://medusa:9000")) {
    return `${publicBase}${input.slice("https://medusa:9000".length)}`;
  }
  if (input.startsWith("http://host.docker.internal:9000")) {
    return `${publicBase}${input.slice("http://host.docker.internal:9000".length)}`;
  }
  if (input.startsWith("https://host.docker.internal:9000")) {
    return `${publicBase}${input.slice("https://host.docker.internal:9000".length)}`;
  }
  return input;
}

function medusaStoreBases() {
  const configured = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/+$/, "");
  return Array.from(
    new Set([configured, "http://medusa:9000", "http://host.docker.internal:9000", "http://localhost:9000"])
  );
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

/** Field sets for Store API; `null` = omit `fields` (full product). */
const STORE_PRODUCT_FIELDS_ATTEMPTS = ["handle,+thumbnail,*images", "handle,thumbnail,images", null] as const;

/**
 * Load thumbnail + store handle for a Medusa product (Store API). Used by /shop/packs and pack APIs.
 */
export async function fetchStoreProductThumbAndHandle(
  productId: string
): Promise<{ thumb: string | null; handle: string | null }> {
  for (const base of medusaStoreBases()) {
    for (const fields of STORE_PRODUCT_FIELDS_ATTEMPTS) {
      try {
        const url = new URL(`/store/products/${encodeURIComponent(productId)}`, base);
        if (fields) url.searchParams.set("fields", fields);
        const res = await fetch(url.toString(), { cache: "no-store", headers: getStoreMedusaFetchHeaders() });
        if (!res.ok) continue;
        const j = (await res.json()) as {
          product?: { handle?: string; thumbnail?: string; images?: Array<{ url?: string }> };
        };
        const p = j.product;
        if (!p) continue;
        const thumb = pickStoreProductImageUrl(p);
        const handle = String(p.handle || "").trim() || null;
        return { thumb, handle };
      } catch {
        // try next fields / base
      }
    }
  }
  return { thumb: null, handle: null };
}
