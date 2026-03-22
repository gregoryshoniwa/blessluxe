/**
 * Query params for Medusa Store cart endpoints so line items include variant + product
 * (thumbnail and images for storefront cart/checkout UI).
 */
export const MEDUSA_STORE_CART_QUERY = {
  fields:
    "*items,*items.variant,*items.variant.product,*items.variant.product.images,*items.variant.product.thumbnail",
} as const;
