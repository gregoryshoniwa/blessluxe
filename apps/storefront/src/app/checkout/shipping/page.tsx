'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Truck, Clock, Package } from 'lucide-react';
import { useCheckoutStore } from '@/stores/checkout';
import { cn } from '@/lib/utils';

const shippingMethods = [
  {
    id: 'standard',
    name: 'Standard Delivery',
    description: 'Delivered to your doorstep',
    price: 0,
    estimatedDays: '3-5 business days',
    icon: Package,
  },
  {
    id: 'express',
    name: 'Express Delivery',
    description: 'Fast delivery to major cities',
    price: 10,
    estimatedDays: '1-2 business days',
    icon: Truck,
  },
  {
    id: 'same-day',
    name: 'Same Day Delivery',
    description: 'Harare only - Order before 12pm',
    price: 15,
    estimatedDays: 'Today',
    icon: Clock,
  },
];

export default function CheckoutShippingPage() {
  const router = useRouter();
  const { 
    shippingAddress, 
    shippingMethod, 
    setShippingMethod, 
    setCurrentStep 
  } = useCheckoutStore();
  
  const [selectedMethod, setSelectedMethod] = useState(
    shippingMethod?.id || 'standard'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if no shipping address
  useEffect(() => {
    if (!shippingAddress) {
      router.push('/checkout');
    }
  }, [shippingAddress, router]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const method = shippingMethods.find((m) => m.id === selectedMethod);
    if (method) {
      setShippingMethod({
        id: method.id,
        name: method.name,
        description: method.description,
        price: method.price,
        estimatedDays: method.estimatedDays,
      });
    }
    setCurrentStep(3);
    router.push('/checkout/payment');
  };

  if (!shippingAddress) {
    return null;
  }

  return (
    <div>
      {/* Shipping Address Summary */}
      <div className="bg-cream-dark/50 rounded-lg p-4 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-black/60 mb-1">Ship to</p>
            <p className="text-sm font-medium">
              {shippingAddress.firstName} {shippingAddress.lastName}
            </p>
            <p className="text-sm text-black/70">
              {shippingAddress.address1}
              {shippingAddress.address2 && `, ${shippingAddress.address2}`}
            </p>
            <p className="text-sm text-black/70">
              {shippingAddress.city}, {shippingAddress.province} {shippingAddress.postalCode}
            </p>
            <p className="text-sm text-black/70">{shippingAddress.country}</p>
          </div>
          <button
            onClick={() => router.push('/checkout')}
            className="text-sm text-gold hover:underline"
          >
            Change
          </button>
        </div>
      </div>

      <h1 className="font-display text-xl tracking-widest uppercase mb-6">
        Shipping Method
      </h1>

      <div className="space-y-3">
        {shippingMethods.map((method) => {
          const Icon = method.icon;
          return (
            <label
              key={method.id}
              className={cn(
                "flex items-center gap-4 p-4 border rounded-lg cursor-pointer transition-all",
                selectedMethod === method.id
                  ? "border-gold bg-gold/5"
                  : "border-black/20 hover:border-gold/50"
              )}
            >
              <input
                type="radio"
                name="shippingMethod"
                value={method.id}
                checked={selectedMethod === method.id}
                onChange={(e) => setSelectedMethod(e.target.value)}
                className="sr-only"
              />
              <div
                className={cn(
                  "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                  selectedMethod === method.id
                    ? "border-gold"
                    : "border-black/30"
                )}
              >
                {selectedMethod === method.id && (
                  <div className="w-2.5 h-2.5 rounded-full bg-gold" />
                )}
              </div>

              <div className="flex-1 flex items-center gap-4">
                <Icon
                  className={cn(
                    "w-5 h-5",
                    selectedMethod === method.id ? "text-gold" : "text-black/40"
                  )}
                />
                <div>
                  <p className="font-medium text-sm">{method.name}</p>
                  <p className="text-xs text-black/60">{method.description}</p>
                </div>
              </div>

              <div className="text-right">
                <p className="font-semibold text-sm">
                  {method.price === 0 ? 'FREE' : `$${method.price.toFixed(2)}`}
                </p>
                <p className="text-xs text-black/60">{method.estimatedDays}</p>
              </div>
            </label>
          );
        })}
      </div>

      {/* Continue Button */}
      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className={cn(
          "w-full mt-8 bg-gold text-white py-4 text-sm font-semibold tracking-widest uppercase",
          "hover:bg-gold-dark transition-colors",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {isSubmitting ? 'Processing...' : 'Continue to Payment'}
      </button>
    </div>
  );
}
