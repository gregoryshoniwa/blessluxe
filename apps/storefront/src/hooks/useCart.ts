"use client";

import { useCartStore, type CartItem } from "@/stores/cart";
import { useCartHydration } from "@/providers/CartProvider";
import { formatPrice } from "@/lib/utils";

export function useCart() {
  const { isHydrated } = useCartHydration();
  const store = useCartStore();

  const items = isHydrated ? [...store.medusaLines, ...store.virtualLines] : [];

  const addItem = (item: Omit<CartItem, "id" | "source">) => {
    store.addVirtualItem(item);
    store.openCart();
  };

  const removeItem = (id: string) => {
    void store.removeItem(id);
  };

  const updateQuantity = (id: string, quantity: number) => {
    void store.updateQuantity(id, quantity);
  };

  const clearCart = () => {
    store.clearCart();
  };

  const getFormattedSubtotal = (currency: string = "USD") => {
    return formatPrice(store.getSubtotal(), currency);
  };

  return {
    items,
    itemCount: isHydrated ? store.getItemCount() : 0,
    subtotal: isHydrated ? store.getSubtotal() : 0,
    isOpen: store.isOpen,
    isLoading: store.isLoading,
    isHydrated,

    addItem,
    addMedusaVariant: store.addMedusaVariant,
    refreshMedusaCart: store.refreshMedusaCart,
    removeItem,
    updateQuantity,
    clearCart,
    openCart: store.openCart,
    closeCart: store.closeCart,
    toggleCart: store.toggleCart,
    setLoading: store.setLoading,

    getFormattedSubtotal,
  };
}
