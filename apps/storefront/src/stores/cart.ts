import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartItem {
  id: string;
  variantId: string;
  productId: string;
  handle?: string;
  title: string;
  thumbnail: string | null;
  quantity: number;
  unitPrice: number;
  variant: {
    title: string;
    sku: string | null;
  };
}

interface CartState {
  items: CartItem[];
  isOpen: boolean;
  isLoading: boolean;

  // Actions
  addItem: (item: Omit<CartItem, "id">) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  setLoading: (loading: boolean) => void;

  // Computed
  getItemCount: () => number;
  getSubtotal: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,
      isLoading: false,

      addItem: (item) => {
        const items = get().items;
        const existingItem = items.find(
          (i) => i.variantId === item.variantId
        );

        if (existingItem) {
          set({
            items: items.map((i) =>
              i.variantId === item.variantId
                ? { ...i, quantity: i.quantity + item.quantity }
                : i
            ),
          });
        } else {
          set({
            items: [
              ...items,
              { ...item, id: Math.random().toString(36).substring(7) },
            ],
          });
        }
      },

      removeItem: (id) => {
        set({ items: get().items.filter((item) => item.id !== id) });
      },

      updateQuantity: (id, quantity) => {
        if (quantity <= 0) {
          get().removeItem(id);
          return;
        }
        set({
          items: get().items.map((item) =>
            item.id === id ? { ...item, quantity } : item
          ),
        });
      },

      clearCart: () => set({ items: [] }),
      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
      toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),
      setLoading: (loading) => set({ isLoading: loading }),

      getItemCount: () => {
        return get().items.reduce((acc, item) => acc + item.quantity, 0);
      },

      getSubtotal: () => {
        return get().items.reduce(
          (acc, item) => acc + item.unitPrice * item.quantity,
          0
        );
      },
    }),
    {
      name: "blessluxe-cart",
      partialize: (state) => ({ items: state.items }),
      version: 2,
      migrate: (persistedState: unknown) => {
        const state = persistedState as { items?: CartItem[] } | undefined;
        if (!state?.items) return { items: [] };
        return {
          items: state.items.map((item) => ({
            ...item,
            // Migrate older cart entries that accidentally stored cents as dollars.
            unitPrice: item.unitPrice > 2000 ? Number((item.unitPrice / 100).toFixed(2)) : item.unitPrice,
          })),
        };
      },
    }
  )
);
