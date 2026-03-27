import type { CartItem } from "@/stores/cart";
import { BLITS_TOPUP_PRODUCT_ID } from "@/lib/blits-topup";
import { MEDUSA_BACKEND_URL, getStoreMedusaFetchHeaders } from "@/lib/medusa";
import { getDefaultStoreRegionId } from "@/lib/medusa-region";

/** Medusa line item + cart item shapes vary slightly by API version — read defensively. */
type LooseLineItem = Record<string, unknown>;

/** Resolve Medusa file paths / internal hosts to a browser-loadable URL. */
export function publicMedusaAssetUrl(input: string): string {
  const trimmed = String(input || "").trim();
  if (!trimmed) return "";
  const publicBase = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/+$/, "");
  if (trimmed.startsWith("/")) return `${publicBase}${trimmed}`;
  if (trimmed.startsWith("http://medusa:9000")) return `${publicBase}${trimmed.slice("http://medusa:9000".length)}`;
  if (trimmed.startsWith("https://medusa:9000")) return `${publicBase}${trimmed.slice("https://medusa:9000".length)}`;
  return trimmed;
}

function firstImageUrl(entity: LooseLineItem): string {
  const images = entity.images;
  if (!Array.isArray(images) || images.length === 0) return "";
  const first = images[0] as Record<string, unknown>;
  return String(first?.url ?? "").trim();
}

/** Prefer product thumbnail, then line/variant, then first gallery image. */
function pickThumbnailFromLine(line: LooseLineItem): string {
  const variant = (line.variant || {}) as LooseLineItem;
  const product = (line.product || variant.product || {}) as LooseLineItem;
  const candidates = [
    product.thumbnail,
    line.thumbnail,
    variant.thumbnail,
    firstImageUrl(product),
    firstImageUrl(variant),
  ];
  for (const c of candidates) {
    const s = String(c ?? "").trim();
    if (s) return s;
  }
  return "";
}

/** USD line total from Medusa (handles minor units). */
function lineUnitPriceUsd(line: LooseLineItem): number {
  const unit = Number(line.unit_price ?? 0);
  if (!Number.isFinite(unit) || unit <= 0) return 0;
  if (unit > 1000) return Math.round(unit) / 100;
  return unit;
}

export function medusaLineItemToCartItem(line: LooseLineItem): CartItem | null {
  const variant = (line.variant || {}) as LooseLineItem;
  const product = (line.product || variant.product || {}) as LooseLineItem;
  const lineId = String(line.id || "");
  const variantId = String(line.variant_id || variant.id || "");
  const productId = String(line.product_id || product.id || "");
  if (!lineId || !variantId) return null;

  const title = String(product.title || line.title || "Product");
  const handle = String(product.handle || "");
  const thumbRaw = pickThumbnailFromLine(line);
  const thumb = thumbRaw ? publicMedusaAssetUrl(thumbRaw) : "";
  const qty = Math.max(1, Math.floor(Number(line.quantity ?? 1)));
  const unit = lineUnitPriceUsd(line);
  const variantTitle = String(variant.title || line.description || "Variant");
  const inventoryQuantity = Number(variant.inventory_quantity);
  const hasInventoryQuantity = Number.isFinite(inventoryQuantity) && inventoryQuantity >= 0;

  return {
    id: lineId,
    medusaLineItemId: lineId,
    variantId,
    productId,
    handle: handle || undefined,
    title,
    thumbnail: thumb || null,
    quantity: qty,
    unitPrice: unit > 0 ? unit : 0,
    variant: {
      title: variantTitle,
      sku: variant.sku != null ? String(variant.sku) : null,
      ...(hasInventoryQuantity ? { inventoryQuantity } : {}),
    },
    source: "medusa",
  };
}

/** Map SDK `StoreCart` (or any cart-shaped object) without unsafe casts at call sites. */
export function medusaCartFromSdk(cart: unknown): CartItem[] {
  return medusaCartToCartItems(cart as unknown as Record<string, unknown>);
}

const PRODUCT_INVENTORY_FIELDS = "*variants,*variants.inventory_quantity";

/**
 * Fetches per-variant `inventory_quantity` from `/store/products/:id` (supported there)
 * and merges into cart lines. Cart `fields` cannot safely include variant inventory (Store API).
 */
export async function enrichCartItemsWithVariantInventory(lines: CartItem[]): Promise<CartItem[]> {
  const medusaLines = lines.filter((l) => l.source === "medusa" && l.productId);
  const productIds = [...new Set(medusaLines.map((l) => l.productId))];
  if (productIds.length === 0) return lines;

  const regionId = await getDefaultStoreRegionId();
  const base = MEDUSA_BACKEND_URL.replace(/\/+$/, "");
  const variantQty = new Map<string, number>();

  for (const pid of productIds) {
    try {
      const url = new URL(`/store/products/${encodeURIComponent(pid)}`, base);
      if (regionId) url.searchParams.set("region_id", regionId);
      url.searchParams.set("fields", PRODUCT_INVENTORY_FIELDS);
      const res = await fetch(url.toString(), {
        cache: "no-store",
        headers: getStoreMedusaFetchHeaders(),
      });
      if (!res.ok) continue;
      const payload = (await res.json()) as { product?: Record<string, unknown> };
      const raw =
        payload.product ||
        ((payload as { data?: { product?: Record<string, unknown> } }).data?.product as
          | Record<string, unknown>
          | undefined);
      if (!raw || typeof raw !== "object") continue;
      const variants = Array.isArray(raw.variants) ? (raw.variants as Array<Record<string, unknown>>) : [];
      for (const v of variants) {
        const vid = String(v.id || "");
        if (!vid) continue;
        const qty = Number(v.inventory_quantity);
        if (Number.isFinite(qty) && qty >= 0) variantQty.set(vid, qty);
      }
    } catch {
      // ignore per-product failures
    }
  }

  return lines.map((line) => {
    if (line.source !== "medusa") return line;
    const q = variantQty.get(line.variantId);
    if (typeof q !== "number") return line;
    return {
      ...line,
      variant: {
        ...line.variant,
        inventoryQuantity: q,
      },
    };
  });
}

export function medusaCartToCartItems(cart: Record<string, unknown>): CartItem[] {
  const items = Array.isArray(cart.items) ? (cart.items as LooseLineItem[]) : [];
  const out: CartItem[] = [];
  for (const line of items) {
    const mapped = medusaLineItemToCartItem(line);
    if (mapped) out.push(mapped);
  }
  return out;
}

export function isVirtualBlitsItem(item: CartItem): boolean {
  return item.productId === BLITS_TOPUP_PRODUCT_ID || item.blitsTopupUsd != null;
}
