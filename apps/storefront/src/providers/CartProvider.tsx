"use client";

import { type ReactNode, useEffect, useState } from "react";

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
