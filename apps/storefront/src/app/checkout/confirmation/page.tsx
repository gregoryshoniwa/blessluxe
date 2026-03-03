'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { CheckCircle, Package, Truck, Mail } from 'lucide-react';
import { useCheckoutStore } from '@/stores/checkout';

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get('order');
  const [showConfetti, setShowConfetti] = useState(true);
  const { shippingAddress, shippingMethod, email, resetCheckout } = useCheckoutStore();

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  // Clean up checkout state after viewing confirmation
  useEffect(() => {
    const cleanupTimer = setTimeout(() => {
      resetCheckout();
    }, 10000);
    return () => clearTimeout(cleanupTimer);
  }, [resetCheckout]);

  return (
    <div className="min-h-screen bg-white">
      {/* Confetti Animation */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {[...Array(50)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-3 h-3"
              initial={{
                x: '50vw',
                y: '-10px',
                rotate: 0,
                opacity: 1,
              }}
              animate={{
                x: `${Math.random() * 100}vw`,
                y: '110vh',
                rotate: Math.random() * 720,
                opacity: 0,
              }}
              transition={{
                duration: 3 + Math.random() * 2,
                delay: Math.random() * 0.5,
                ease: 'easeOut',
              }}
              style={{
                backgroundColor: ['#C9A84C', '#F5E6E0', '#FFD700', '#FFC0CB', '#E6BE8A'][
                  Math.floor(Math.random() * 5)
                ],
                borderRadius: Math.random() > 0.5 ? '50%' : '0%',
              }}
            />
          ))}
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-16 sm:py-24">
        {/* Success Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', duration: 0.5 }}
          className="flex justify-center mb-8"
        >
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
        </motion.div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center mb-12"
        >
          <p className="font-script text-3xl text-gold mb-3">Thank You!</p>
          <h1 className="font-display text-2xl md:text-3xl tracking-widest uppercase mb-4">
            Order Confirmed
          </h1>
          <p className="text-black/60">
            We&apos;ve received your order and will begin processing it shortly.
          </p>
        </motion.div>

        {/* Order Number */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-cream-dark/50 rounded-lg p-6 mb-8 text-center"
        >
          <p className="text-sm text-black/60 mb-2">Order Number</p>
          <p className="font-display text-2xl tracking-widest">{orderNumber || 'BL-XXXXXX'}</p>
        </motion.div>

        {/* Order Details */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="space-y-6"
        >
          {/* Email Notification */}
          <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-lg">
            <Mail className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Confirmation email sent</p>
              <p className="text-sm text-black/60">
                A confirmation email has been sent to {email || 'your email address'}.
              </p>
            </div>
          </div>

          {/* Shipping Info */}
          {shippingAddress && (
            <div className="border border-gold/20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Truck className="w-5 h-5 text-gold" />
                <h2 className="font-medium">Shipping Details</h2>
              </div>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-black/60 mb-1">Delivery Address</p>
                  <p className="font-medium">
                    {shippingAddress.firstName} {shippingAddress.lastName}
                  </p>
                  <p className="text-black/70">{shippingAddress.address1}</p>
                  {shippingAddress.address2 && (
                    <p className="text-black/70">{shippingAddress.address2}</p>
                  )}
                  <p className="text-black/70">
                    {shippingAddress.city}, {shippingAddress.province} {shippingAddress.postalCode}
                  </p>
                  <p className="text-black/70">{shippingAddress.country}</p>
                </div>
                {shippingMethod && (
                  <div>
                    <p className="text-black/60 mb-1">Delivery Method</p>
                    <p className="font-medium">{shippingMethod.name}</p>
                    <p className="text-black/70">{shippingMethod.estimatedDays}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Next Steps */}
          <div className="border border-gold/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-5 h-5 text-gold" />
              <h2 className="font-medium">What&apos;s Next?</h2>
            </div>
            <ul className="space-y-2 text-sm text-black/70">
              <li className="flex items-start gap-2">
                <span className="text-gold">1.</span>
                We&apos;ll prepare your order for shipment
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gold">2.</span>
                You&apos;ll receive a tracking number via email
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gold">3.</span>
                Your order will be delivered to your address
              </li>
            </ul>
          </div>
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col sm:flex-row gap-4 mt-12"
        >
          <Link
            href="/shop"
            className="flex-1 text-center bg-gold text-white py-4 text-sm font-semibold tracking-widest uppercase hover:bg-gold-dark transition-colors"
          >
            Continue Shopping
          </Link>
          <Link
            href="/"
            className="flex-1 text-center border-2 border-gold text-gold py-4 text-sm font-semibold tracking-widest uppercase hover:bg-gold hover:text-white transition-colors"
          >
            Back to Home
          </Link>
        </motion.div>

        {/* Footer */}
        <p className="text-center text-sm text-black/50 mt-12">
          Questions about your order?{' '}
          <Link href="/contact" className="text-gold hover:underline">
            Contact us
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function CheckoutConfirmationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gold">Loading...</div>
      </div>
    }>
      <ConfirmationContent />
    </Suspense>
  );
}
