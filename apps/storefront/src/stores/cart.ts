import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getDefaultStoreRegionId } from "@/lib/medusa-region";
import { medusaCartFromSdk, isVirtualBlitsItem } from "@/lib/medusa-cart-map";
import { enrichCartItemsWithStoreInventory } from "@/lib/medusa-variant-inventory";
import { cartApi, CartApiError } from "@/lib/cart-api";

export interface CartItem {
  id: string;
  variantId: string;
  productId: string;
  handle?: string;
  title: string;
  thumbnail: string | null;
  quantity: number;
  unitPrice: number;
  /** Set when the line was added from `/affiliate/shop/[code]` — used for commission attribution only. */
  affiliateCode?: string;
  /** USD paid for this line at checkout; wallet is credited with Blits after a successful non-Blits payment. */
  blitsTopupUsd?: number;
  /** Medusa-backed catalog lines (inventory + pricing from Medusa cart). */
  source?: "medusa" | "virtual";
  /** Medusa line item id (same as `id` for medusa lines). */
  medusaLineItemId?: string;
  /** From Medusa cart line `metadata` (pack ids, storefront customer, etc.). */
  lineMetadata?: Record<string, unknown> | null;
  variant: {
    title: string;
    sku: string | null;
    inventoryQuantity?: number;
  };
}

interface CartState {
  /** Medusa cart id (persisted). */
  medusaCartId: string | null;
  /** Lines from Medusa Store API (not persisted — refreshed from API). */
  medusaLines: CartItem[];
  /** Local-only lines (e.g. Blits wallet top-up). */
  virtualLines: CartItem[];
  /** variant_id → affiliate code (Medusa line items do not store this). */
  affiliateHints: Record<string, string>;
  isOpen: boolean;
  isLoading: boolean;

  getMergedItems: () => CartItem[];

  addVirtualItem: (item: Omit<CartItem, "id" | "source">) => void;
  /** Add or update a Medusa variant line via Store API (inventory-aware). */
  addMedusaVariant: (input: {
    variantId: string;
    quantity: number;
    affiliateCode?: string;
    /** Stored on the cart line item (e.g. pack campaign / slot ids for webhooks). */
    lineItemMetadata?: Record<string, unknown>;
  }) => Promise<void>;
  ensureMedusaCart: () => Promise<string | null>;
  refreshMedusaCart: () => Promise<void>;

  removeItem: (id: string) => Promise<void>;
  updateQuantity: (id: string, quantity: number) => Promise<void>;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  setLoading: (loading: boolean) => void;

  getItemCount: () => number;
  getSubtotal: () => number;
}

function applyAffiliateHints(lines: CartItem[], hints: Record<string, string>): CartItem[] {
  if (!hints || Object.keys(hints).length === 0) return lines;
  return lines.map((li) => ({
    ...li,
    affiliateCode: hints[li.variantId] ?? li.affiliateCode,
  }));
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      medusaCartId: null,
      medusaLines: [],
      virtualLines: [],
      affiliateHints: {},
      isOpen: false,
      isLoading: false,

      getMergedItems: () => {
        const { medusaLines, virtualLines } = get();
        return [...medusaLines, ...virtualLines];
      },

      ensureMedusaCart: async () => {
        const existing = get().medusaCartId;
        if (existing) {
          // Make sure the cart still exists on the backend.
          try {
            await cartApi.retrieve(existing);
            return existing;
          } catch (e) {
            if (e instanceof CartApiError && e.status === 404) {
              set({ medusaCartId: null, medusaLines: [] });
            } else {
              return existing; // transient error — keep the id
            }
          }
        }
        const regionId = await getDefaultStoreRegionId();
        try {
          const { cart } = await cartApi.create(regionId);
          const id = String(cart?.id || "");
          const raw = medusaCartFromSdk(cart);
          const lines = applyAffiliateHints(raw, get().affiliateHints);
          const enriched = await enrichCartItemsWithStoreInventory(lines);
          set({ medusaCartId: id || null, medusaLines: enriched });
          return id || null;
        } catch (e) {
          console.error("[cart] create failed", e);
          throw new Error(
            e instanceof CartApiError ? `Could not create cart: ${e.message}` : "Could not create cart"
          );
        }
      },

      refreshMedusaCart: async () => {
        const cartId = get().medusaCartId;
        if (!cartId) {
          set({ medusaLines: [] });
          return;
        }
        set({ isLoading: true });
        try {
          const { cart } = await cartApi.retrieve(cartId);
          const raw = medusaCartFromSdk(cart);
          const lines = applyAffiliateHints(raw, get().affiliateHints);
          const enriched = await enrichCartItemsWithStoreInventory(lines);
          set({ medusaLines: enriched, medusaCartId: String(cart.id || cartId) });
        } catch (e) {
          if (e instanceof CartApiError && e.status === 404) {
            set({ medusaCartId: null, medusaLines: [] });
          } else {
            console.warn("[cart] Failed to refresh cart:", e);
          }
        } finally {
          set({ isLoading: false });
        }
      },

      addMedusaVariant: async (input) => {
        const cartId = await get().ensureMedusaCart();
        if (!cartId) throw new Error("Could not create cart");
        if (input.affiliateCode) {
          set({
            affiliateHints: { ...get().affiliateHints, [input.variantId]: input.affiliateCode },
          });
        }
        set({ isLoading: true });
        try {
          const { cart } = await cartApi.addLine(cartId, {
            variant_id: input.variantId,
            quantity: input.quantity,
            ...(input.lineItemMetadata && Object.keys(input.lineItemMetadata).length > 0
              ? { metadata: input.lineItemMetadata }
              : {}),
          });
          const raw = medusaCartFromSdk(cart);
          const lines = applyAffiliateHints(raw, get().affiliateHints);
          const enriched = await enrichCartItemsWithStoreInventory(lines);
          set({ medusaLines: enriched, medusaCartId: String(cart.id || cartId) });
        } catch (e) {
          console.error("[cart] addLine failed", e);
          throw e instanceof CartApiError
            ? new Error(e.message || "Could not add to cart")
            : (e as Error);
        } finally {
          set({ isLoading: false });
        }
      },

      addVirtualItem: (item) => {
        const items = get().virtualLines;
        const keyAff = item.affiliateCode ?? "";
        const existingItem = items.find(
          (i) => i.variantId === item.variantId && (i.affiliateCode ?? "") === keyAff
        );
        if (existingItem) {
          set({
            virtualLines: items.map((i) =>
              i.variantId === item.variantId && (i.affiliateCode ?? "") === keyAff
                ? { ...i, quantity: i.quantity + item.quantity }
                : i
            ),
          });
        } else {
          set({
            virtualLines: [
              ...items,
              {
                ...item,
                id: Math.random().toString(36).substring(7),
                source: "virtual",
              },
            ],
          });
        }
      },

      removeItem: async (id) => {
        const virt = get().virtualLines.find((i) => i.id === id);
        if (virt) {
          set({ virtualLines: get().virtualLines.filter((i) => i.id !== id) });
          return;
        }
        const line = get().medusaLines.find((i) => i.id === id);
        const cartId = get().medusaCartId;
        if (!line || !cartId) return;
        set({ isLoading: true });
        try {
          const res = await cartApi.deleteLine(cartId, id);
          const raw = medusaCartFromSdk(res.parent);
          const lines = applyAffiliateHints(raw, get().affiliateHints);
          const enriched = await enrichCartItemsWithStoreInventory(lines);
          set({ medusaLines: enriched, medusaCartId: String(res.parent.id || cartId) });
        } catch (e) {
          console.error("[cart] deleteLine failed", e);
        } finally {
          set({ isLoading: false });
        }
      },

      updateQuantity: async (id, quantity) => {
        if (quantity <= 0) {
          await get().removeItem(id);
          return;
        }
        const virt = get().virtualLines.find((i) => i.id === id);
        if (virt) {
          set({
            virtualLines: get().virtualLines.map((i) => (i.id === id ? { ...i, quantity } : i)),
          });
          return;
        }
        const cartId = get().medusaCartId;
        if (!cartId) return;
        set({ isLoading: true });
        try {
          const { cart } = await cartApi.updateLine(cartId, id, quantity);
          const raw = medusaCartFromSdk(cart);
          const lines = applyAffiliateHints(raw, get().affiliateHints);
          const enriched = await enrichCartItemsWithStoreInventory(lines);
          set({ medusaLines: enriched, medusaCartId: String(cart.id || cartId) });
        } catch (e) {
          console.error("[cart] updateLine failed", e);
        } finally {
          set({ isLoading: false });
        }
      },

      clearCart: () => set({ medusaCartId: null, medusaLines: [], virtualLines: [], affiliateHints: {} }),

      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
      toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),
      setLoading: (loading) => set({ isLoading: loading }),

      getItemCount: () => {
        const { medusaLines, virtualLines } = get();
        const sum = (rows: CartItem[]) => rows.reduce((acc, item) => acc + item.quantity, 0);
        return sum(medusaLines) + sum(virtualLines);
      },

      getSubtotal: () => {
        const { medusaLines, virtualLines } = get();
        const sum = (rows: CartItem[]) =>
          rows.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
        return sum(medusaLines) + sum(virtualLines);
      },
    }),
    {
      name: "blessluxe-cart",
      partialize: (state) => ({
        medusaCartId: state.medusaCartId,
        virtualLines: state.virtualLines,
        affiliateHints: state.affiliateHints,
      }),
      version: 4,
      migrate: (persistedState: unknown) => {
        const state = persistedState as
          | { medusaCartId?: string | null; virtualLines?: CartItem[]; items?: CartItem[] }
          | undefined;
        if (state?.virtualLines && Array.isArray(state.virtualLines)) {
          return {
            medusaCartId: state.medusaCartId ?? null,
            virtualLines: state.virtualLines.filter((i) => isVirtualBlitsItem(i)),
            affiliateHints: (state as { affiliateHints?: Record<string, string> }).affiliateHints ?? {},
          };
        }
        const oldItems = state?.items;
        if (Array.isArray(oldItems)) {
          return {
            medusaCartId: null,
            virtualLines: oldItems.filter((i) => isVirtualBlitsItem(i)),
            affiliateHints: {},
          };
        }
        return { medusaCartId: null, virtualLines: [], affiliateHints: {} };
      },
    }
  )
);
