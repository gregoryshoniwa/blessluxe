'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingBag, ArrowRight } from 'lucide-react';
import { useCartStore } from '@/stores/cart';
import { CartItem } from './CartItem';

export function CartSidebar() {
  const isOpen = useCartStore((s) => s.isOpen);
  const closeCart = useCartStore((s) => s.closeCart);
  const refreshMedusaCart = useCartStore((s) => s.refreshMedusaCart);
  const isCartLoading = useCartStore((s) => s.isLoading);
  const getItemCount = useCartStore((s) => s.getItemCount);
  const getSubtotal = useCartStore((s) => s.getSubtotal);
  const medusaLines = useCartStore((s) => s.medusaLines);
  const virtualLines = useCartStore((s) => s.virtualLines);
  const items = useMemo(() => [...medusaLines, ...virtualLines], [medusaLines, virtualLines]);

  // Auto-refresh stock/pricing while cart is open.
  useEffect(() => {
    if (!isOpen) return;

    let alive = true;
    const maybeRefresh = async () => {
      if (!alive) return;
      if (isCartLoading) return;
      await refreshMedusaCart();
    };

    // Immediate refresh on open.
    void maybeRefresh();

    // Periodic refresh (keeps inventory warnings current).
    const interval = window.setInterval(() => {
      void maybeRefresh();
    }, 15000);

    // Refresh when returning to the tab/window.
    const onFocus = () => void maybeRefresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void maybeRefresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      alive = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isOpen, isCartLoading, refreshMedusaCart]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCart();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, closeCart]);

  const itemCount = getItemCount();
  const subtotal = getSubtotal();
  const hasInventoryIssue = items.some((item) => {
    const qty = item.variant.inventoryQuantity;
    if (typeof qty !== 'number') return false;
    return qty <= 0 || item.quantity > qty;
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeCart}
            className="fixed inset-0 bg-black/50 z-[100]"
          />

          {/* Sidebar */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-white z-[100] shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gold/10">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-gold" />
                <h2 className="font-display text-lg tracking-wider uppercase">
                  Your Cart
                </h2>
                <span className="bg-gold text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                  {itemCount}
                </span>
              </div>
              <button
                onClick={closeCart}
                className="p-2 hover:bg-cream-dark rounded-full transition-colors"
                aria-label="Close cart"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cart Content */}
            {items.length === 0 ? (
              /* Empty State */
              <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
                <ShoppingBag className="w-16 h-16 text-gold/30 mb-4" strokeWidth={1} />
                <p className="font-display text-lg tracking-wider uppercase mb-2">
                  Your cart is empty
                </p>
                <p className="text-black/60 text-sm mb-6">
                  Discover our latest collection and find something you love.
                </p>
                <button
                  onClick={closeCart}
                  className="inline-block bg-gold text-white px-8 py-3 text-sm font-semibold tracking-widest uppercase hover:bg-gold-dark transition-colors"
                >
                  Continue Shopping
                </button>
              </div>
            ) : (
              <>
                {/* Items List */}
                <div className="flex-1 overflow-y-auto px-6">
                  {items.map((item) => (
                    <CartItem key={item.id} item={item} />
                  ))}
                </div>

                {/* Footer */}
                <div className="border-t border-gold/10 px-6 py-4 space-y-4">
                  {hasInventoryIssue ? (
                    <p className="text-xs font-medium text-red-600">
                      Some cart items exceed available stock. Update quantities before checkout.
                    </p>
                  ) : null}

                  {/* Subtotal */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-black/60">Subtotal</span>
                    <span className="font-display text-lg">
                      ${subtotal.toFixed(2)}
                    </span>
                  </div>

                  <p className="text-xs text-black/50 text-center">
                    Shipping & taxes calculated at checkout
                  </p>

                  {/* Action Buttons */}
                  <div className="space-y-2">
                    <Link
                      href="/checkout"
                      onClick={(e) => {
                        if (hasInventoryIssue) {
                          e.preventDefault();
                          return;
                        }
                        closeCart();
                      }}
                      aria-disabled={hasInventoryIssue}
                      className={`flex items-center justify-center gap-2 w-full py-3 text-sm font-semibold tracking-widest uppercase transition-colors ${
                        hasInventoryIssue
                          ? 'bg-gold/40 text-white/80 cursor-not-allowed'
                          : 'bg-gold text-white hover:bg-gold-dark'
                      }`}
                    >
                      Checkout
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                    <Link
                      href="/cart"
                      onClick={closeCart}
                      className="block w-full text-center border-2 border-gold text-gold py-3 text-sm font-semibold tracking-widest uppercase hover:bg-gold hover:text-white transition-colors"
                    >
                      View Cart
                    </Link>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
