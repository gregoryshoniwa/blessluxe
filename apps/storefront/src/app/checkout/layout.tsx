'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronLeft, Check, Lock } from 'lucide-react';
import { useCartStore } from '@/stores/cart';
import { CartLineThumbnail } from '@/components/cart/CartLineThumbnail';
import { cn } from '@/lib/utils';

const steps = [
  { number: 1, name: 'Information', path: '/checkout' },
  { number: 2, name: 'Shipping', path: '/checkout/shipping' },
  { number: 3, name: 'Payment', path: '/checkout/payment' },
];

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const medusaLines = useCartStore((s) => s.medusaLines);
  const virtualLines = useCartStore((s) => s.virtualLines);
  const items = useMemo(() => [...medusaLines, ...virtualLines], [medusaLines, virtualLines]);
  const getSubtotal = useCartStore((s) => s.getSubtotal);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect to cart if empty (after mount)
  useEffect(() => {
    if (mounted && items.length === 0 && !pathname.includes('confirmation')) {
      router.push('/cart');
    }
  }, [mounted, items.length, pathname, router]);

  const getCurrentStep = () => {
    if (pathname === '/checkout') return 1;
    if (pathname === '/checkout/shipping') return 2;
    if (pathname === '/checkout/payment') return 3;
    if (pathname.includes('confirmation')) return 4;
    return 1;
  };

  const currentStep = getCurrentStep();

  // Don't show layout for confirmation or payment page (payment has its own layout)
  if (pathname.includes('confirmation') || pathname.includes('payment')) {
    return <>{children}</>;
  }

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gold">Loading...</div>
      </div>
    );
  }

  const subtotal = getSubtotal();

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gold/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="font-display text-xl tracking-widest">
              BLESSLUXE
            </Link>
            <div className="flex items-center gap-2 text-sm text-black/60">
              <Lock className="w-4 h-4" />
              <span>Secure Checkout</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-center gap-2 sm:gap-4">
            {steps.map((step, index) => (
              <div key={step.number} className="flex items-center">
                <div className="flex items-center">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors",
                      currentStep > step.number
                        ? "bg-gold text-white"
                        : currentStep === step.number
                        ? "bg-gold text-white"
                        : "bg-black/10 text-black/40"
                    )}
                  >
                    {currentStep > step.number ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      step.number
                    )}
                  </div>
                  <span
                    className={cn(
                      "ml-2 text-sm font-medium hidden sm:block",
                      currentStep >= step.number ? "text-black" : "text-black/40"
                    )}
                  >
                    {step.name}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      "w-8 sm:w-16 h-0.5 mx-2 sm:mx-4",
                      currentStep > step.number ? "bg-gold" : "bg-black/10"
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="lg:grid lg:grid-cols-12 lg:gap-12">
          {/* Main Content */}
          <div className="lg:col-span-7">
            {/* Back navigation */}
            {currentStep > 1 && (
              <button
                onClick={() => router.back()}
                className="flex items-center gap-1 text-sm text-black/60 hover:text-gold mb-6 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}

            <motion.div
              key={pathname}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
            >
              {children}
            </motion.div>
          </div>

          {/* Order Summary Sidebar */}
          <div className="lg:col-span-5 mt-12 lg:mt-0">
            <div className="bg-cream-dark/50 rounded-none p-6 sticky top-8">
              <h2 className="font-display text-lg tracking-widest uppercase mb-6">
                Order Summary
              </h2>

              {/* Items */}
              <div className="space-y-4 max-h-64 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.id} className="flex gap-3">
                    <div className="relative w-16 h-20 bg-cream rounded-none flex-shrink-0 overflow-hidden">
                      <CartLineThumbnail
                        src={item.thumbnail}
                        alt={item.title}
                        className="h-full w-full"
                      />
                      {/* Quantity badge */}
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-gold text-white text-xs rounded-none flex items-center justify-center">
                        {item.quantity}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-clamp-1">{item.title}</p>
                      <p className="text-xs text-black/60">{item.variant.title}</p>
                      <p className="text-sm font-semibold mt-1">
                        ${(item.unitPrice * item.quantity).toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="border-t border-gold/20 mt-6 pt-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-black/60">Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-black/60">Shipping</span>
                  <span className="text-black/40">Calculated next step</span>
                </div>
                <div className="flex justify-between pt-3 border-t border-gold/20 text-base font-semibold">
                  <span>Total</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
