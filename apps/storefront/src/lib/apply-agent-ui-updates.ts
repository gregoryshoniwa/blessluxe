'use client';

import type { UIUpdate } from '@/lib/ai/types';
import { useCartStore } from '@/stores/cart';

/**
 * Applies server-returned agent UI instructions (cart, navigation) on the client.
 */
export async function applyAgentUiUpdates(updates: UIUpdate[] | undefined): Promise<void> {
  if (!updates?.length) return;

  for (const u of updates) {
    switch (u.type) {
      case 'add_to_cart': {
        const variantId = String(u.payload.variantId ?? '');
        const quantity = Math.max(1, Number(u.payload.quantity) || 1);
        if (!variantId) break;
        try {
          await useCartStore.getState().addMedusaVariant({ variantId, quantity });
          useCartStore.getState().openCart();
        } catch (e) {
          console.warn('[agent] add_to_cart failed:', e);
        }
        break;
      }
      case 'remove_from_cart': {
        const variantId = String(u.payload.variantId ?? '');
        const productId = String(u.payload.productId ?? '');
        const lines = useCartStore.getState().medusaLines;
        const line =
          (variantId && lines.find((l) => l.variantId === variantId)) ||
          (productId && lines.find((l) => l.productId === productId));
        if (line) await useCartStore.getState().removeItem(line.id);
        break;
      }
      case 'update_cart_quantity': {
        const variantId = String(u.payload.variantId ?? '');
        const productId = String(u.payload.productId ?? '');
        const quantity = Number(u.payload.quantity);
        const lines = useCartStore.getState().medusaLines;
        const line =
          (variantId && lines.find((l) => l.variantId === variantId)) ||
          (productId && lines.find((l) => l.productId === productId));
        if (line && Number.isFinite(quantity)) await useCartStore.getState().updateQuantity(line.id, quantity);
        break;
      }
      case 'clear_cart':
        useCartStore.getState().clearCart();
        break;
      case 'navigate': {
        const path = String(u.payload.path ?? '');
        if (path) window.location.assign(path);
        break;
      }
      default:
        break;
    }
  }
}
