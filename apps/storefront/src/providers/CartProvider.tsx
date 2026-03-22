"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useCartStore } from "@/stores/cart";

interface CartProviderProps {
  children: ReactNode;
}

/**
 * Cart provider to handle hydration of cart state from localStorage
 * This prevents hydration mismatches between server and client
 */
export function CartProvider({ children }: CartProviderProps) {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    const cartId = useCartStore.getState().medusaCartId;
    if (cartId) {
      void useCartStore.getState().refreshMedusaCart();
    }
  }, [isHydrated]);

  // Prevent hydration mismatch by not rendering cart-dependent UI until hydrated
  // The actual cart state is managed by Zustand store with persist middleware
  return (
    <CartContext.Provider value={{ isHydrated }}>
      {children}
    </CartContext.Provider>
  );
}

// Context for cart hydration state
import { createContext, useContext } from "react";

interface CartContextValue {
  isHydrated: boolean;
}

const CartContext = createContext<CartContextValue>({ isHydrated: false });

export function useCartHydration() {
  return useContext(CartContext);
}
