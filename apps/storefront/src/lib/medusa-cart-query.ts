/**
 * Query params for Medusa Store cart endpoints so line items include variant + product
 * (thumbnail and images for storefront cart/checkout UI).
 *
 * Do not request `items.variant.inventory_quantity` on cart routes: cart `refetch` uses
 * remote-query and that field is not wired there (it would 500 with "An unknown error occurred.").
 * Use `enrichCartItemsWithStoreInventory` + `GET /store/product-variants/:id` for live stock.
 */
export const MEDUSA_STORE_CART_QUERY = {
  fields:
    "*items,*items.variant,*items.variant.product,*items.variant.product.images,*items.product,*items.product.images,*items.product.thumbnail",
} as const;
