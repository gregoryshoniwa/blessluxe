import type { CartItem } from "@/stores/cart";
import { BLITS_TOPUP_PRODUCT_ID } from "@/lib/blits-topup";

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
    },
    source: "medusa",
  };
}

/** Map SDK `StoreCart` (or any cart-shaped object) without unsafe casts at call sites. */
export function medusaCartFromSdk(cart: unknown): CartItem[] {
  return medusaCartToCartItems(cart as unknown as Record<string, unknown>);
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
