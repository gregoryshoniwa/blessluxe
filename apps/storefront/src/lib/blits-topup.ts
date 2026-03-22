import { useCartStore } from "@/stores/cart";

export const BLITS_TOPUP_PRODUCT_ID = "blits-wallet-credit";
export const BLITS_TOPUP_HANDLE = "blits-wallet-credit";

export function blitsTopupVariantId(usd: number): string {
  const rounded = Math.round(usd * 1e6) / 1e6;
  return `blits-topup-${rounded}`;
}

/** Adds a cart line that credits Blits after a successful card/mobile checkout payment. */
export function addBlitsTopupToCart(amountUsd: number): boolean {
  const rounded = Math.round(amountUsd * 1e6) / 1e6;
  if (!Number.isFinite(rounded) || rounded <= 0 || rounded > 100_000) return false;

  useCartStore.getState().addVirtualItem({
    variantId: blitsTopupVariantId(rounded),
    productId: BLITS_TOPUP_PRODUCT_ID,
    handle: BLITS_TOPUP_HANDLE,
    title: `Blits wallet credit ($${rounded.toFixed(2)})`,
    thumbnail: null,
    quantity: 1,
    unitPrice: rounded,
    variant: { title: "Wallet credit", sku: "BLITS-TOPUP" },
    blitsTopupUsd: rounded,
  });
  return true;
}
