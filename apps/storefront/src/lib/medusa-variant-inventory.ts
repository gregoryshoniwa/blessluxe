import type { CartItem } from "@/stores/cart";
import { cartApi } from "@/lib/cart-api";

/**
 * Cart `refetch` cannot request `variant.inventory_quantity` consistently —
 * fetch the live count per variant from the store API instead.
 */
export async function enrichCartItemsWithStoreInventory(lines: CartItem[]): Promise<CartItem[]> {
  const medusaLines = lines.filter((l) => l.source === "medusa");
  if (medusaLines.length === 0) return lines;

  const uniqueIds = [...new Set(medusaLines.map((l) => l.variantId).filter(Boolean))];
  const qtyByVariantId = new Map<string, number>();

  await Promise.all(
    uniqueIds.map(async (variantId) => {
      try {
        const res = await cartApi.variantInventory(variantId);
        const v = res.variant;
        const q = v?.inventory_quantity;
        if (v?.id && typeof q === "number" && Number.isFinite(q) && q >= 0) {
          qtyByVariantId.set(v.id, q);
        }
      } catch {
        // Per-variant failure shouldn't break the cart.
      }
    })
  );

  if (qtyByVariantId.size === 0) return lines;

  return lines.map((item) => {
    if (item.source !== "medusa") return item;
    const q = qtyByVariantId.get(item.variantId);
    if (q === undefined) return item;
    return {
      ...item,
      variant: {
        ...item.variant,
        inventoryQuantity: q,
      },
    };
  });
}
