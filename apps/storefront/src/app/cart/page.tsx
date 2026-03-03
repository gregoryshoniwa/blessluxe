'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight, Tag } from 'lucide-react';
import { useCartStore } from '@/stores/cart';
import { cn } from '@/lib/utils';

export default function CartPage() {
  const [mounted, setMounted] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  
  const { items, updateQuantity, removeItem, getSubtotal } = useCartStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-pulse text-gold">Loading...</div>
      </div>
    );
  }

  const subtotal = getSubtotal();
  const shipping = 0; // Free shipping
  const discount = promoApplied ? subtotal * 0.1 : 0;
  const total = subtotal - discount + shipping;

  if (items.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-[5%] py-20">
        <div className="text-center max-w-md">
          <ShoppingBag className="w-16 h-16 text-gold/30 mx-auto mb-6" strokeWidth={1} />
          <p className="font-script text-3xl text-gold mb-4">Your Cart</p>
          <h1 className="font-display text-2xl tracking-widest uppercase mb-6">
            No Items Yet
          </h1>
          <p className="text-black/60 mb-8">
            Your shopping cart is empty. Start adding items to your cart.
          </p>
          <Link
            href="/shop"
            className="inline-block bg-gold text-white px-10 py-4 text-sm font-semibold tracking-widest uppercase hover:bg-gold-dark transition-colors"
          >
            Start Shopping
          </Link>
        </div>
      </div>
    );
  }

  const handleApplyPromo = () => {
    if (promoCode.toUpperCase() === 'WELCOME10') {
      setPromoApplied(true);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="font-script text-2xl text-gold mb-3">Your Cart</p>
          <h1 className="font-display text-2xl md:text-3xl tracking-widest uppercase">
            Shopping Cart
          </h1>
        </div>

        <div className="lg:grid lg:grid-cols-12 lg:gap-12">
          {/* Cart Items */}
          <div className="lg:col-span-7">
            <div className="border-b border-gold/20 pb-4 mb-4">
              <span className="text-sm text-black/60">
                {items.length} item{items.length !== 1 ? 's' : ''} in your cart
              </span>
            </div>

            <div className="space-y-6">
              {items.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex gap-4 pb-6 border-b border-gold/10"
                >
                  {/* Image */}
                  <Link href={`/shop/${item.productId}`} className="flex-shrink-0">
                    <div className="relative w-24 h-32 bg-cream-dark rounded overflow-hidden">
                      {item.thumbnail ? (
                        <Image
                          src={item.thumbnail}
                          alt={item.title}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-cream to-blush" />
                      )}
                    </div>
                  </Link>

                  {/* Details */}
                  <div className="flex-1 flex flex-col">
                    <Link 
                      href={`/shop/${item.productId}`}
                      className="font-display text-base hover:text-gold transition-colors"
                    >
                      {item.title}
                    </Link>
                    <p className="text-sm text-black/60 mt-1">
                      {item.variant.title}
                    </p>

                    <div className="flex-1" />

                    <div className="flex items-center justify-between mt-4">
                      {/* Quantity */}
                      <div className="flex items-center border border-black/20 rounded">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          className="p-2 hover:bg-cream-dark transition-colors disabled:opacity-50"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-10 text-center font-medium">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="p-2 hover:bg-cream-dark transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Price & Remove */}
                      <div className="flex items-center gap-4">
                        <span className="font-semibold">
                          ${(item.unitPrice * item.quantity).toFixed(2)}
                        </span>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-2 text-black/40 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Continue Shopping */}
            <div className="mt-8">
              <Link
                href="/shop"
                className="inline-flex items-center gap-2 text-sm font-medium text-gold hover:text-gold-dark transition-colors"
              >
                <ArrowRight className="w-4 h-4 rotate-180" />
                Continue Shopping
              </Link>
            </div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-5 mt-12 lg:mt-0">
            <div className="bg-cream-dark/50 rounded-lg p-6 sticky top-24">
              <h2 className="font-display text-lg tracking-widest uppercase mb-6">
                Order Summary
              </h2>

              {/* Promo Code */}
              <div className="mb-6">
                <label className="text-sm font-medium mb-2 block">
                  Promo Code
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
                    <input
                      type="text"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                      placeholder="Enter code"
                      disabled={promoApplied}
                      className={cn(
                        "w-full pl-10 pr-4 py-2.5 border border-black/20 rounded bg-white text-sm",
                        "focus:outline-none focus:border-gold",
                        promoApplied && "bg-green-50 border-green-500"
                      )}
                    />
                  </div>
                  <button
                    onClick={handleApplyPromo}
                    disabled={promoApplied || !promoCode}
                    className={cn(
                      "px-4 py-2 text-sm font-semibold rounded transition-colors",
                      promoApplied
                        ? "bg-green-500 text-white"
                        : "bg-black text-white hover:bg-black/80 disabled:opacity-50"
                    )}
                  >
                    {promoApplied ? '✓ Applied' : 'Apply'}
                  </button>
                </div>
                {promoApplied && (
                  <p className="text-xs text-green-600 mt-1">
                    10% discount applied!
                  </p>
                )}
              </div>

              {/* Totals */}
              <div className="space-y-3 text-sm border-t border-gold/20 pt-4">
                <div className="flex justify-between">
                  <span className="text-black/60">Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                {promoApplied && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount (10%)</span>
                    <span>-${discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-black/60">Shipping</span>
                  <span className="text-green-600">Free</span>
                </div>
                <div className="flex justify-between pt-3 border-t border-gold/20 text-base font-semibold">
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>

              {/* Checkout */}
              <Link
                href="/checkout"
                className="flex items-center justify-center gap-2 w-full mt-6 bg-gold text-white py-4 text-sm font-semibold tracking-widest uppercase hover:bg-gold-dark transition-colors"
              >
                Proceed to Checkout
                <ArrowRight className="w-4 h-4" />
              </Link>

              {/* Trust badges */}
              <div className="mt-6 pt-6 border-t border-gold/20">
                <div className="flex items-center justify-center gap-4 text-xs text-black/50">
                  <span>🔒 Secure Checkout</span>
                  <span>•</span>
                  <span>🚚 Free Shipping</span>
                  <span>•</span>
                  <span>↩️ Easy Returns</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
