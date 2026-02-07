import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface WishlistItem {
  id: string;
  productId: string;
  title: string;
  thumbnail: string | null;
  price: number;
  handle: string;
}

interface WishlistState {
  items: WishlistItem[];
  isOpen: boolean;

  // Actions
  addItem: (item: Omit<WishlistItem, "id">) => void;
  removeItem: (productId: string) => void;
  toggleItem: (item: Omit<WishlistItem, "id">) => void;
  clearWishlist: () => void;
  openWishlist: () => void;
  closeWishlist: () => void;

  // Computed
  isInWishlist: (productId: string) => boolean;
  getItemCount: () => number;
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,

      addItem: (item) => {
        const items = get().items;
        const exists = items.some((i) => i.productId === item.productId);
        
        if (!exists) {
          set({
            items: [
              ...items,
              { ...item, id: Math.random().toString(36).substring(7) },
            ],
          });
        }
      },

      removeItem: (productId) => {
        set({
          items: get().items.filter((item) => item.productId !== productId),
        });
      },

      toggleItem: (item) => {
        const exists = get().isInWishlist(item.productId);
        if (exists) {
          get().removeItem(item.productId);
        } else {
          get().addItem(item);
        }
      },

      clearWishlist: () => set({ items: [] }),
      openWishlist: () => set({ isOpen: true }),
      closeWishlist: () => set({ isOpen: false }),

      isInWishlist: (productId) => {
        return get().items.some((item) => item.productId === productId);
      },

      getItemCount: () => get().items.length,
    }),
    {
      name: "blessluxe-wishlist",
      partialize: (state) => ({ items: state.items }),
    }
  )
);
