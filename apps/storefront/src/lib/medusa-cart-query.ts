/**
 * Query params for Medusa Store cart endpoints so line items include variant + product
 * (thumbnail and images for storefront cart/checkout UI).
 *
 * Do NOT request `*items.variant.inventory_quantity` here: the Store cart API rejects or
 * errors on that path (see medusajs/medusa#12884). Inventory for cart lines is merged
 * client-side via `enrichCartItemsWithVariantInventory` in `medusa-cart-map.ts`.
 */
export const MEDUSA_STORE_CART_QUERY = {
  fields:
    "*items,*items.variant,*items.variant.product,*items.variant.product.images,*items.variant.product.thumbnail",
} as const;
