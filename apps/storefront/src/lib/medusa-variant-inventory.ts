import { medusa } from "@/lib/medusa";
import type { CartItem } from "@/stores/cart";

/**
 * Cart `refetch` cannot request `variant.inventory_quantity` — that field is not part of the
 * cart remote-query graph (unlike product routes, which compute it in middleware). Store
 * `GET /store/product-variants/:id?fields=inventory_quantity` does support it.
 */
export async function enrichCartItemsWithStoreInventory(lines: CartItem[]): Promise<CartItem[]> {
  const medusaLines = lines.filter((l) => l.source === "medusa");
  if (medusaLines.length === 0) return lines;

  const uniqueIds = [...new Set(medusaLines.map((l) => l.variantId).filter(Boolean))];
  const qtyByVariantId = new Map<string, number>();

  await Promise.all(
    uniqueIds.map(async (variantId) => {
      try {
        const res = (await medusa.client.fetch(`/store/product-variants/${encodeURIComponent(variantId)}`, {
          query: { fields: "id,inventory_quantity" },
        })) as { variant?: { id?: string; inventory_quantity?: number | null } };
        const v = res.variant;
        const q = v?.inventory_quantity;
        if (v?.id && typeof q === "number" && Number.isFinite(q) && q >= 0) {
          qtyByVariantId.set(v.id, q);
        }
      } catch {
        // Per-variant failure should not break the cart.
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
