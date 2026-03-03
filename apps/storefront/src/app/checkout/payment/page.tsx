'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import { CreditCard, Smartphone, Banknote, Wallet, Lock, ChevronLeft, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { useCheckoutStore } from '@/stores/checkout';
import { useCartStore } from '@/stores/cart';
import { getEnabledPaymentMethods, PaymentMethod } from '@/config/payment-config';
import { cn } from '@/lib/utils';

const icons = {
  CreditCard,
  Smartphone,
  Banknote,
  Wallet,
};

const cardSchema = z.object({
  cardNumber: z.string().min(16, 'Card number is required'),
  cardName: z.string().min(2, 'Name on card is required'),
  expiry: z.string().min(5, 'Expiry date is required'),
  cvv: z.string().min(3, 'CVV is required'),
});

const mobileSchema = z.object({
  phoneNumber: z.string().min(10, 'Phone number is required'),
});

type CardFormData = z.infer<typeof cardSchema>;
type MobileFormData = z.infer<typeof mobileSchema>;

const steps = [
  { number: 1, name: 'Information', path: '/checkout' },
  { number: 2, name: 'Shipping', path: '/checkout/shipping' },
  { number: 3, name: 'Payment', path: '/checkout/payment' },
];

export default function CheckoutPaymentPage() {
  const router = useRouter();
  const { 
    shippingAddress, 
    shippingMethod, 
    setPaymentMethod, 
    setOrderComplete,
  } = useCheckoutStore();
  const { clearCart, getSubtotal, items } = useCartStore();
  
  const [selectedMethod, setSelectedMethod] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setPaymentMethods(getEnabledPaymentMethods());
  }, []);

  // Redirect if no shipping method
  useEffect(() => {
    if (mounted && !shippingMethod) {
      router.push('/checkout/shipping');
    }
  }, [shippingMethod, router, mounted]);

  const cardForm = useForm<CardFormData>({
    resolver: zodResolver(cardSchema),
  });

  const mobileForm = useForm<MobileFormData>({
    resolver: zodResolver(mobileSchema),
  });

  const selectedPaymentMethod = paymentMethods.find((m) => m.id === selectedMethod);

  const subtotal = getSubtotal();
  const shipping = shippingMethod?.price || 0;
  const total = subtotal + shipping;

  const handlePlaceOrder = async () => {
    setIsSubmitting(true);
    
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      const orderId = `ORD-${Date.now()}`;
      const orderNumber = `BL-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      
      setPaymentMethod(selectedMethod);
      setOrderComplete(orderId, orderNumber);
      clearCart();
      
      router.push(`/checkout/confirmation?order=${orderNumber}`);
    } catch (error) {
      console.error('Payment failed:', error);
      setIsSubmitting(false);
    }
  };

  const onCardSubmit = cardForm.handleSubmit(() => handlePlaceOrder());
  const onMobileSubmit = mobileForm.handleSubmit(() => handlePlaceOrder());

  if (!mounted || !shippingMethod) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gold">Loading...</div>
      </div>
    );
  }

  const inputClassName = (error?: boolean) =>
    cn(
      "w-full px-4 py-3 border rounded-md text-sm",
      "focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold",
      error ? "border-red-500 bg-red-50" : "border-black/20"
    );

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gold/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <span className="font-display text-xl tracking-widest">
              BLESSLUXE
            </span>
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
                      step.number <= 3 ? "bg-gold text-white" : "bg-black/10 text-black/40"
                    )}
                  >
                    {step.number < 3 ? <Check className="w-4 h-4" /> : step.number}
                  </div>
                  <span className={cn("ml-2 text-sm font-medium hidden sm:block", "text-black")}>
                    {step.name}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div className={cn("w-8 sm:w-16 h-0.5 mx-2 sm:mx-4", step.number < 3 ? "bg-gold" : "bg-black/10")} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="lg:grid lg:grid-cols-12 lg:gap-12">
          {/* Left Column - Payment Method Selection */}
          <div className="lg:col-span-7">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1 text-sm text-black/60 hover:text-gold mb-6 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>

            {/* Order Summary (compact) */}
            <div className="bg-cream-dark/50 rounded-lg p-4 mb-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm text-black/60 mb-1">Ship to</p>
                  <p className="text-sm font-medium">
                    {shippingAddress?.firstName} {shippingAddress?.lastName}
                  </p>
                  <p className="text-sm text-black/70">
                    {shippingAddress?.address1}, {shippingAddress?.city}
                  </p>
                </div>
                <button
                  onClick={() => router.push('/checkout')}
                  className="text-sm text-gold hover:underline"
                >
                  Change
                </button>
              </div>
              <div className="border-t border-gold/20 pt-3 flex justify-between">
                <div>
                  <p className="text-sm text-black/60">Shipping</p>
                  <p className="text-sm font-medium">{shippingMethod.name}</p>
                </div>
                <p className="text-sm font-medium">
                  {shippingMethod.price === 0 ? 'FREE' : `$${shippingMethod.price.toFixed(2)}`}
                </p>
              </div>
            </div>

            <h1 className="font-display text-xl tracking-widest uppercase mb-6">
              Payment Method
            </h1>

            {/* Payment Method Selection */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {paymentMethods.map((method) => {
                const Icon = icons[method.icon];
                const isSelected = selectedMethod === method.id;
                return (
                  <div
                    key={method.id}
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={0}
                    onClick={() => setSelectedMethod(method.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedMethod(method.id);
                      }
                    }}
                    className={cn(
                      "flex items-center gap-4 p-4 border rounded-lg cursor-pointer transition-all",
                      isSelected
                        ? "border-gold bg-gold/5"
                        : "border-black/20 hover:border-gold/50"
                    )}
                  >
                    <div
                      className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                        isSelected ? "border-gold" : "border-black/30"
                      )}
                    >
                      {isSelected && (
                        <div className="w-2.5 h-2.5 rounded-full bg-gold" />
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <Icon
                        className={cn(
                          "w-5 h-5",
                          isSelected ? "text-gold" : "text-black/40"
                        )}
                      />
                      <div>
                        <p className="font-medium text-sm">{method.name}</p>
                        <p className="text-xs text-black/60">{method.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {!selectedMethod && (
              <p className="text-sm text-black/50 text-center py-8">
                Please select a payment method to continue
              </p>
            )}
          </div>

          {/* Right Column - Order Summary + Payment Input */}
          <div className="lg:col-span-5 mt-12 lg:mt-0 space-y-6">
            <div className="bg-cream-dark/50 rounded-lg p-6">
              <h2 className="font-display text-lg tracking-widest uppercase mb-6">
                Order Summary
              </h2>

              {/* Items */}
              <div className="space-y-4 max-h-48 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.id} className="flex gap-3">
                    <div className="relative w-14 h-18 bg-cream rounded flex-shrink-0 overflow-hidden">
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
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-gold text-white text-xs rounded-full flex items-center justify-center">
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
              <div className="border-t border-gold/20 mt-4 pt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-black/60">Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-black/60">Shipping</span>
                  <span>{shipping === 0 ? 'FREE' : `$${shipping.toFixed(2)}`}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gold/20 text-base font-semibold">
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Payment Input Forms - Separate Card */}
            {selectedMethod && (
              <div className="bg-cream-dark/50 rounded-lg p-6">
                {selectedMethod === 'card' && (
                  <motion.form
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onSubmit={onCardSubmit}
                    className="space-y-4"
                  >
                    <h3 className="font-display text-lg tracking-widest uppercase mb-4">Card Details</h3>
                    
                    <div>
                      <label className="block text-xs font-medium mb-1 text-black/70">Card Number</label>
                      <input
                        type="text"
                        placeholder="1234 5678 9012 3456"
                        {...cardForm.register('cardNumber')}
                        className={inputClassName(!!cardForm.formState.errors.cardNumber)}
                      />
                      {cardForm.formState.errors.cardNumber && (
                        <p className="text-red-500 text-xs mt-1">
                          {cardForm.formState.errors.cardNumber.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1 text-black/70">Name on Card</label>
                      <input
                        type="text"
                        placeholder="John Doe"
                        {...cardForm.register('cardName')}
                        className={inputClassName(!!cardForm.formState.errors.cardName)}
                      />
                      {cardForm.formState.errors.cardName && (
                        <p className="text-red-500 text-xs mt-1">
                          {cardForm.formState.errors.cardName.message}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium mb-1 text-black/70">Expiry</label>
                        <input
                          type="text"
                          placeholder="MM/YY"
                          {...cardForm.register('expiry')}
                          className={inputClassName(!!cardForm.formState.errors.expiry)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1 text-black/70">CVV</label>
                        <input
                          type="text"
                          placeholder="123"
                          {...cardForm.register('cvv')}
                          className={inputClassName(!!cardForm.formState.errors.cvv)}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-black/50">
                      <Lock className="w-3 h-3" />
                      <span>Encrypted and secure</span>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className={cn(
                        "w-full bg-gold text-white py-4 text-sm font-semibold tracking-widest uppercase",
                        "hover:bg-gold-dark transition-colors",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      {isSubmitting ? 'Processing...' : `Pay $${total.toFixed(2)}`}
                    </button>
                  </motion.form>
                )}

                {selectedPaymentMethod?.type === 'mobile' && selectedMethod !== 'card' && (
                  <motion.form
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onSubmit={onMobileSubmit}
                    className="space-y-4"
                  >
                    <h3 className="font-display text-lg tracking-widest uppercase mb-4">{selectedPaymentMethod.name}</h3>
                    
                    <div>
                      <label className="block text-xs font-medium mb-1 text-black/70">Mobile Number</label>
                      <input
                        type="tel"
                        placeholder={selectedPaymentMethod.phoneFormat || '+263 7X XXX XXXX'}
                        {...mobileForm.register('phoneNumber')}
                        className={inputClassName(!!mobileForm.formState.errors.phoneNumber)}
                      />
                      {mobileForm.formState.errors.phoneNumber && (
                        <p className="text-red-500 text-xs mt-1">
                          {mobileForm.formState.errors.phoneNumber.message}
                        </p>
                      )}
                      <p className="text-xs text-black/50 mt-2">
                        You will receive a payment prompt on your phone.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className={cn(
                        "w-full bg-gold text-white py-4 text-sm font-semibold tracking-widest uppercase",
                        "hover:bg-gold-dark transition-colors",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      {isSubmitting ? 'Sending prompt...' : `Pay $${total.toFixed(2)}`}
                    </button>
                  </motion.form>
                )}

                {selectedPaymentMethod?.type === 'bank' && (
                  <motion.form
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onSubmit={onMobileSubmit}
                    className="space-y-4"
                  >
                    <h3 className="font-display text-lg tracking-widest uppercase mb-4">{selectedPaymentMethod.name}</h3>
                    
                    <div>
                      <label className="block text-xs font-medium mb-1 text-black/70">Phone Number</label>
                      <input
                        type="tel"
                        placeholder="+263 7X XXX XXXX"
                        {...mobileForm.register('phoneNumber')}
                        className={inputClassName(!!mobileForm.formState.errors.phoneNumber)}
                      />
                      <p className="text-xs text-black/50 mt-2">
                        You will receive ZipIt transfer instructions via SMS.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className={cn(
                        "w-full bg-gold text-white py-4 text-sm font-semibold tracking-widest uppercase",
                        "hover:bg-gold-dark transition-colors",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      {isSubmitting ? 'Processing...' : `Pay $${total.toFixed(2)} via ZipIt`}
                    </button>
                  </motion.form>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
