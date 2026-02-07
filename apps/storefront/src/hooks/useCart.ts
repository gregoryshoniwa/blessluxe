"use client";

import { useCartStore, type CartItem } from "@/stores/cart";
import { useCartHydration } from "@/providers/CartProvider";
import { formatPrice } from "@/lib/utils";

export function useCart() {
  const { isHydrated } = useCartHydration();
  const store = useCartStore();

  const addItem = (item: Omit<CartItem, "id">) => {
    store.addItem(item);
    store.openCart();
  };

  const removeItem = (id: string) => {
    store.removeItem(id);
  };

  const updateQuantity = (id: string, quantity: number) => {
    store.updateQuantity(id, quantity);
  };

  const clearCart = () => {
    store.clearCart();
  };

  const getFormattedSubtotal = (currency: string = "USD") => {
    return formatPrice(store.getSubtotal(), currency);
  };

  return {
    items: isHydrated ? store.items : [],
    itemCount: isHydrated ? store.getItemCount() : 0,
    subtotal: isHydrated ? store.getSubtotal() : 0,
    isOpen: store.isOpen,
    isLoading: store.isLoading,
    isHydrated,

    // Actions
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    openCart: store.openCart,
    closeCart: store.closeCart,
    toggleCart: store.toggleCart,
    setLoading: store.setLoading,

    // Formatted values
    getFormattedSubtotal,
  };
}
