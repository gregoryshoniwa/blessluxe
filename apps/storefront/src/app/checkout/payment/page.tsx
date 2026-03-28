'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CartLineThumbnail } from '@/components/cart/CartLineThumbnail';
import { CreditCard, Smartphone, Wallet, Lock, ChevronLeft, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { useCheckoutStore } from '@/stores/checkout';
import { useCartStore } from '@/stores/cart';
import { getEnabledPaymentMethods, type PaymentMethod } from '@/config/payment-config';
import { cn } from '@/lib/utils';
import { useToast } from '@/providers';
import {
  finalizeOrderAfterPayment,
  serializeCartItemsForCheckout,
  syncPackSlotsAfterCheckout,
  type StripePendingCheckout,
} from '@/lib/checkout-finalize-order-client';
import { StripeElementsPayment, isStripePublishableConfigured } from '@/components/checkout/StripeElementsPayment';

const icons = {
  CreditCard,
  Smartphone,
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
  const { showToast } = useToast();
  const router = useRouter();
  const { 
    shippingAddress, 
    shippingMethod, 
    setPaymentMethod, 
    setOrderComplete,
  } = useCheckoutStore();
  const clearCart = useCartStore((s) => s.clearCart);
  const getSubtotal = useCartStore((s) => s.getSubtotal);
  const medusaLines = useCartStore((s) => s.medusaLines);
  const virtualLines = useCartStore((s) => s.virtualLines);
  const items = useMemo(() => [...medusaLines, ...virtualLines], [medusaLines, virtualLines]);
  
  const [selectedMethod, setSelectedMethod] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [blitsSettings, setBlitsSettings] = useState<{
    usd_to_blits_per_dollar: number;
    product_discount_percent_paying_blits: number;
  } | null>(null);
  const [blitsBalance, setBlitsBalance] = useState<number | null>(null);
  const [hasCustomer, setHasCustomer] = useState(false);
  /** Blits to apply when using split payment (clamped to balance and order max). */
  const [splitBlitsToUse, setSplitBlitsToUse] = useState(0);
  /** Card / EcoCash / etc. for the USD remainder after Blits. */
  const [splitCashMethod, setSplitCashMethod] = useState<string>('');
  /** Stabilizes idempotency for split: Blits debit + cash leg + optional reversal. */
  const splitAttemptKeyRef = useRef<string | null>(null);
  /** Stripe PaymentIntent + pending order payload (card-only or split remainder). */
  const [stripeCheckout, setStripeCheckout] = useState<{
    clientSecret: string;
    pending: StripePendingCheckout;
  } | null>(null);

  const useStripeCard = isStripePublishableConfigured();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [pubRes, accRes] = await Promise.all([
        fetch('/api/blits/public', { cache: 'no-store' }),
        fetch('/api/account/me', { cache: 'no-store' }),
      ]);
      if (cancelled) return;
      if (pubRes.ok) {
        const pub = await pubRes.json();
        const s = pub?.settings;
        if (s) {
          setBlitsSettings({
            usd_to_blits_per_dollar: Number(s.usd_to_blits_per_dollar),
            product_discount_percent_paying_blits: Number(s.product_discount_percent_paying_blits),
          });
        }
      }
      if (accRes.ok) {
        const acc = await accRes.json();
        if (acc?.customer?.id) {
          setHasCustomer(true);
          const wRes = await fetch('/api/blits/wallet', { cache: 'no-store' });
          if (wRes.ok) {
            const w = await wRes.json();
            setBlitsBalance(Number(w.balance ?? 0));
          } else {
            setBlitsBalance(0);
          }
        } else {
          setHasCustomer(false);
          setBlitsBalance(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
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

  const hasBlitsTopupInCart = useMemo(
    () => items.some((i) => i.blitsTopupUsd != null && i.blitsTopupUsd > 0),
    [items]
  );

  const subtotalExcludingBlitsTopup = useMemo(() => {
    return items
      .filter((i) => !(i.blitsTopupUsd != null && i.blitsTopupUsd > 0))
      .reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);
  }, [items]);

  const cashMethodsForSplit = useMemo(
    () => getEnabledPaymentMethods().filter((m) => m.type === 'card' || m.type === 'mobile' || m.type === 'bank'),
    []
  );

  const subtotal = getSubtotal();
  const shipping = shippingMethod?.price || 0;
  const total = subtotal + shipping;

  const blitsPricing = useMemo(() => {
    if (!blitsSettings) {
      return { discountedSubtotal: subtotal, payableUsd: total, blitsNeeded: 0 };
    }
    const disc = Math.max(0, Math.min(100, blitsSettings.product_discount_percent_paying_blits));
    const discountedSubtotal = subtotalExcludingBlitsTopup * (1 - disc / 100);
    const payableUsd = Math.round((discountedSubtotal + shipping) * 1e6) / 1e6;
    const rate = Math.max(0, blitsSettings.usd_to_blits_per_dollar);
    const blitsNeeded = Math.max(1, Math.ceil(payableUsd * rate));
    return { discountedSubtotal, payableUsd, blitsNeeded };
  }, [subtotal, subtotalExcludingBlitsTopup, shipping, blitsSettings]);

  /** Show split option whenever Blits checkout applies; usable only with balance > 0. */
  const showSplitPaymentOption = useMemo(() => {
    if (!blitsSettings || !hasCustomer || hasBlitsTopupInCart) return false;
    return blitsPricing.blitsNeeded > 0 && blitsPricing.payableUsd > 0;
  }, [
    blitsSettings,
    hasCustomer,
    hasBlitsTopupInCart,
    blitsPricing.blitsNeeded,
    blitsPricing.payableUsd,
  ]);

  const splitPaymentUsable = useMemo(() => {
    if (!showSplitPaymentOption || blitsBalance === null) return false;
    return blitsBalance > 0;
  }, [showSplitPaymentOption, blitsBalance]);

  /** Full wallet payment: needs balance >= Blits required for the order. */
  const fullBlitsPaymentUsable = useMemo(() => {
    if (!blitsSettings || !hasCustomer || hasBlitsTopupInCart) return false;
    if (blitsBalance === null) return false;
    if (blitsPricing.blitsNeeded <= 0 || blitsPricing.payableUsd <= 0) return false;
    return blitsBalance >= blitsPricing.blitsNeeded;
  }, [
    blitsSettings,
    hasCustomer,
    hasBlitsTopupInCart,
    blitsBalance,
    blitsPricing.blitsNeeded,
    blitsPricing.payableUsd,
  ]);

  const paymentMethods = useMemo(() => {
    const base = getEnabledPaymentMethods();
    if (!blitsSettings || !hasCustomer || hasBlitsTopupInCart) return base;
    const blitsSplit: PaymentMethod = {
      id: "blits_split",
      name: "Blits + card or mobile",
      icon: "Wallet",
      description: "Use Blits for part of the order; pay the rest with card or mobile money",
      enabled: true,
      type: "blits_split",
    };
    const blitsMethod: PaymentMethod = {
      id: "blits",
      name: "Pay with Blits",
      icon: "Wallet",
      description: "Loyalty discount on products; pay using your Blits balance only",
      enabled: true,
      type: "blits",
    };
    return [...base, ...(showSplitPaymentOption ? [blitsSplit] : []), blitsMethod];
  }, [blitsSettings, hasCustomer, hasBlitsTopupInCart, showSplitPaymentOption]);

  const selectedPaymentMethod = paymentMethods.find((m) => m.id === selectedMethod);

  const splitBlitsMax = useMemo(() => {
    if (blitsBalance === null || !blitsSettings) return 0;
    return Math.min(blitsBalance, blitsPricing.blitsNeeded);
  }, [blitsBalance, blitsSettings, blitsPricing.blitsNeeded]);

  const splitUsdFromBlits = useMemo(() => {
    const rate = blitsSettings?.usd_to_blits_per_dollar ?? 0;
    if (rate <= 0 || splitBlitsToUse <= 0) return 0;
    return Math.round((splitBlitsToUse / rate) * 1e6) / 1e6;
  }, [blitsSettings, splitBlitsToUse]);

  const splitRemainderUsd = useMemo(() => {
    return Math.max(0, Math.round((blitsPricing.payableUsd - splitUsdFromBlits) * 1e6) / 1e6);
  }, [blitsPricing.payableUsd, splitUsdFromBlits]);

  useEffect(() => {
    if (hasBlitsTopupInCart && (selectedMethod === 'blits' || selectedMethod === 'blits_split')) {
      setSelectedMethod('');
    }
  }, [hasBlitsTopupInCart, selectedMethod]);

  useEffect(() => {
    if (selectedMethod === 'blits_split' && !splitPaymentUsable) {
      setSelectedMethod('');
    }
  }, [selectedMethod, splitPaymentUsable]);

  useEffect(() => {
    if (selectedMethod === 'blits' && !fullBlitsPaymentUsable) {
      setSelectedMethod('');
    }
  }, [selectedMethod, fullBlitsPaymentUsable]);

  useEffect(() => {
    if (selectedMethod !== 'blits_split' || blitsBalance === null || !blitsSettings) return;
    const max = Math.min(blitsBalance, blitsPricing.blitsNeeded);
    setSplitBlitsToUse((prev) => {
      if (max <= 0) return 0;
      if (prev <= 0 || prev > max) return max;
      return prev;
    });
    setSplitCashMethod((prev) => prev || 'card');
  }, [selectedMethod, blitsBalance, blitsSettings, blitsPricing.blitsNeeded]);

  const handleStripeSuccess = async (pending: StripePendingCheckout) => {
    await finalizeOrderAfterPayment({
      pending,
      setPaymentMethod,
      setOrderComplete,
      clearCart,
    });
    showToast({
      title: "Payment successful",
      message: `Order ${pending.orderNumber} has been placed.`,
      variant: "success",
    });
    setStripeCheckout(null);
    splitAttemptKeyRef.current = null;
    router.push(`/checkout/confirmation?order=${pending.orderNumber}`);
  };

  const handleCancelStripeSplit = async () => {
    const pending = stripeCheckout?.pending;
    if (!pending?.splitIdem) {
      setStripeCheckout(null);
      return;
    }
    const revRes = await fetch("/api/blits/checkout-split-reversal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotencyKey: pending.splitIdem }),
    });
    if (!revRes.ok) {
      showToast({
        title: "Could not refund Blits",
        message: "Please contact support.",
        variant: "error",
      });
      return;
    }
    splitAttemptKeyRef.current = null;
    setStripeCheckout(null);
    showToast({
      title: "Cancelled",
      message: "Your Blits have been refunded.",
      variant: "success",
    });
  };

  const handlePlaceOrder = async () => {
    setIsSubmitting(true);
    
    try {
      const orderId = `ORD-${Date.now()}`;
      const orderNumber = `BL-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      const topupLineItems = items.filter(
        (i) =>
          i.blitsTopupUsd != null &&
          i.blitsTopupUsd > 0 &&
          Math.abs(i.unitPrice - i.blitsTopupUsd) < 1e-6
      );

      if (topupLineItems.length > 0 && !hasCustomer) {
        showToast({
          title: 'Login required',
          message: 'Sign in to receive Blits wallet credit from your purchase.',
          variant: 'error',
        });
        setIsSubmitting(false);
        return;
      }

      let chargeUsd = total;

      if (selectedMethod === 'blits') {
        if (items.some((i) => i.blitsTopupUsd != null && i.blitsTopupUsd > 0)) {
          showToast({
            title: 'Use card or mobile money',
            message: 'Wallet top-ups must be paid with a standard payment method, not Blits.',
            variant: 'error',
          });
          setIsSubmitting(false);
          return;
        }
        if (blitsBalance === null || blitsPricing.payableUsd <= 0) {
          showToast({
            title: 'Cannot pay with Blits',
            message: 'Sign in and ensure your cart total is greater than zero.',
            variant: 'error',
          });
          setIsSubmitting(false);
          return;
        }
        if (blitsPricing.blitsNeeded > blitsBalance) {
          showToast({
            title: 'Insufficient Blits',
            message: `You need ${blitsPricing.blitsNeeded} Blits for this order.`,
            variant: 'error',
          });
          setIsSubmitting(false);
          return;
        }
        const payRes = await fetch('/api/blits/checkout-pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subtotalUsd: subtotalExcludingBlitsTopup, shippingUsd: shipping }),
        });
        const payData = (await payRes.json().catch(() => ({}))) as {
          error?: string;
          payableUsd?: number;
        };
        if (!payRes.ok) {
          showToast({
            title: 'Blits payment failed',
            message: payData.error || 'Could not complete Blits payment.',
            variant: 'error',
          });
          setIsSubmitting(false);
          return;
        }
        chargeUsd = Number(payData.payableUsd ?? blitsPricing.payableUsd);
      } else if (selectedMethod === "blits_split") {
        if (items.some((i) => i.blitsTopupUsd != null && i.blitsTopupUsd > 0)) {
          showToast({
            title: "Use card or mobile money",
            message: "Wallet top-ups must be paid with a standard payment method, not Blits.",
            variant: "error",
          });
          setIsSubmitting(false);
          return;
        }
        if (blitsBalance === null || blitsPricing.payableUsd <= 0 || !blitsSettings) {
          showToast({
            title: "Cannot use Blits split",
            message: "Sign in and ensure your cart total is greater than zero.",
            variant: "error",
          });
          setIsSubmitting(false);
          return;
        }
        if (!splitCashMethod) {
          showToast({
            title: "Choose payment for remainder",
            message: "Select how you will pay the balance after Blits.",
            variant: "error",
          });
          setIsSubmitting(false);
          return;
        }
        if (splitBlitsToUse < 1) {
          showToast({
            title: "Blits amount",
            message: "Use at least 1 Blit, or choose Card / EcoCash only instead.",
            variant: "error",
          });
          setIsSubmitting(false);
          return;
        }
        if (splitBlitsToUse > splitBlitsMax) {
          showToast({
            title: "Blits amount too high",
            message: "Adjust the Blits slider to match your balance and order total.",
            variant: "error",
          });
          setIsSubmitting(false);
          return;
        }

        if (splitCashMethod === "card" && useStripeCard) {
          /* Stripe collects card; no manual card fields. */
        } else if (splitCashMethod === "card" || splitCashMethod === "zimswitch") {
          const valid = await cardForm.trigger();
          if (!valid) {
            setIsSubmitting(false);
            return;
          }
        } else {
          const valid = await mobileForm.trigger();
          if (!valid) {
            setIsSubmitting(false);
            return;
          }
        }

        splitAttemptKeyRef.current = splitAttemptKeyRef.current ?? crypto.randomUUID();
        const splitIdem = splitAttemptKeyRef.current;

        const payRes = await fetch("/api/blits/checkout-pay", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": splitIdem },
          body: JSON.stringify({
            subtotalUsd: subtotalExcludingBlitsTopup,
            shippingUsd: shipping,
            blitsToUse: splitBlitsToUse,
          }),
        });
        const payData = (await payRes.json().catch(() => ({}))) as {
          error?: string;
          payableUsd?: number;
          remainderUsd?: number;
        };
        if (!payRes.ok) {
          splitAttemptKeyRef.current = null;
          showToast({
            title: "Blits payment failed",
            message: payData.error || "Could not apply Blits to this order.",
            variant: "error",
          });
          setIsSubmitting(false);
          return;
        }

        const remainderFromServer = Number(payData.remainderUsd ?? splitRemainderUsd);
        if (remainderFromServer >= 0.01) {
          if (splitCashMethod === "card" && useStripeCard) {
            const piRes = await fetch("/api/checkout/create-payment-intent", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                amountUsd: remainderFromServer,
                idempotencyKey: `${splitIdem}:pi`,
                metadata: { split_idem: splitIdem },
              }),
            });
            const piJson = (await piRes.json().catch(() => ({}))) as { clientSecret?: string; error?: string };
            if (!piRes.ok || !piJson.clientSecret) {
              const revRes = await fetch("/api/blits/checkout-split-reversal", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ idempotencyKey: splitIdem }),
              });
              if (!revRes.ok) {
                showToast({
                  title: "Payment issue",
                  message: `Could not start card payment and we could not refund your Blits. Reference: ${splitIdem}. Please contact support.`,
                  variant: "error",
                });
                setIsSubmitting(false);
                return;
              }
              splitAttemptKeyRef.current = null;
              showToast({
                title: "Payment setup failed",
                message: piJson.error || "Could not start card payment. Your Blits have been refunded.",
                variant: "error",
              });
              setIsSubmitting(false);
              return;
            }
            setStripeCheckout({
              clientSecret: piJson.clientSecret,
              pending: {
                orderId,
                orderNumber,
                chargeUsd: Number(payData.payableUsd ?? blitsPricing.payableUsd),
                selectedMethod: "blits_split",
                splitIdem,
                remainderUsd: remainderFromServer,
                items: serializeCartItemsForCheckout(items),
              },
            });
            setIsSubmitting(false);
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, 300));
          const extRes = await fetch("/api/checkout/external-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              amountUsd: remainderFromServer,
              currencyCode: "usd",
              methodId: splitCashMethod,
              idempotencyKey: `${splitIdem}:cash`,
            }),
          });
          const extJson = (await extRes.json().catch(() => ({}))) as {
            outcome?: string;
            errorMessage?: string;
          };
          if (extRes.status === 402 || extJson.outcome === "failure") {
            const revRes = await fetch("/api/blits/checkout-split-reversal", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ idempotencyKey: splitIdem }),
            });
            if (!revRes.ok) {
              showToast({
                title: "Payment issue",
                message: `The balance payment failed and we could not automatically refund your Blits. Reference: ${splitIdem}. Please contact support.`,
                variant: "error",
              });
              setIsSubmitting(false);
              return;
            }
            splitAttemptKeyRef.current = null;
            showToast({
              title: "Payment declined",
              message:
                extJson.errorMessage ||
                "Your card or mobile payment for the balance could not be processed. Your Blits have been refunded.",
              variant: "error",
            });
            setIsSubmitting(false);
            return;
          }
        }

        splitAttemptKeyRef.current = null;
        chargeUsd = Number(payData.payableUsd ?? blitsPricing.payableUsd);
      } else if (selectedMethod === "card" && useStripeCard) {
        const pending: StripePendingCheckout = {
          orderId,
          orderNumber,
          chargeUsd: total,
          selectedMethod: "card",
          splitIdem: null,
          items: serializeCartItemsForCheckout(items),
        };
        const piRes = await fetch("/api/checkout/create-payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amountUsd: total, idempotencyKey: orderId }),
        });
        const piJson = (await piRes.json().catch(() => ({}))) as { clientSecret?: string; error?: string };
        if (!piRes.ok || !piJson.clientSecret) {
          showToast({
            title: "Payment setup failed",
            message: piJson.error || "Could not start card payment.",
            variant: "error",
          });
          setIsSubmitting(false);
          return;
        }
        setStripeCheckout({ clientSecret: piJson.clientSecret, pending });
        setIsSubmitting(false);
        return;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 300));
        const extRes = await fetch("/api/checkout/external-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountUsd: total,
            currencyCode: "usd",
            methodId: selectedMethod,
          }),
        });
        const extJson = (await extRes.json().catch(() => ({}))) as {
          outcome?: string;
          errorMessage?: string;
        };
        if (extRes.status === 402 || extJson.outcome === "failure") {
          showToast({
            title: "Payment declined",
            message:
              extJson.errorMessage ||
              "Your payment could not be processed. Try another method or contact support.",
            variant: "error",
          });
          setIsSubmitting(false);
          return;
        }
      }

      if (selectedMethod !== 'blits' && topupLineItems.length > 0) {
        const lines = topupLineItems.map((i) => ({
          amountUsd: Math.round(i.blitsTopupUsd! * i.quantity * 1e6) / 1e6,
        }));
        const creditRes = await fetch('/api/blits/credit-from-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lines }),
        });
        const creditJson = (await creditRes.json().catch(() => ({}))) as { error?: string };
        if (!creditRes.ok) {
          showToast({
            title: 'Order placed; wallet credit pending',
            message: creditJson.error || 'Your payment went through. Contact support if Blits do not appear shortly.',
            variant: 'error',
          });
        }
      }

      // Affiliate commission: only lines added from `/affiliate/shop/[code]` carry `affiliateCode` on cart items.
      try {
        await fetch("/api/affiliate/order-complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId,
            currencyCode: "usd",
            lineItems: items.map((item) => ({
              affiliateCode: item.affiliateCode,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            })),
          }),
        });
      } catch (trackingError) {
        console.warn("Affiliate tracking failed:", trackingError);
      }

      // Persist order transaction and purchased line items for review verification.
      try {
        await fetch("/api/account/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderNumber,
            amount: chargeUsd,
            currencyCode: "usd",
            status: "paid",
            invoiceUrl: `/invoices/${orderNumber}.pdf`,
            items: items.map((item) => ({
              productId: item.productId,
              productHandle: item.handle || "",
              productTitle: item.title,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            })),
          }),
        });
      } catch (transactionError) {
        console.warn("Transaction persistence failed:", transactionError);
      }

      try {
        await syncPackSlotsAfterCheckout(orderId, items);
      } catch (packSyncErr) {
        console.warn("Pack slot sync failed:", packSyncErr);
      }

      setPaymentMethod(selectedMethod);
      setOrderComplete(orderId, orderNumber);
      clearCart();
      showToast({
        title: 'Payment successful',
        message: `Order ${orderNumber} has been placed.`,
        variant: 'success',
      });
      
      router.push(`/checkout/confirmation?order=${orderNumber}`);
    } catch (error) {
      console.error('Payment failed:', error);
      showToast({
        title: 'Payment failed',
        message: 'Please try again or choose another payment method.',
        variant: 'error',
      });
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
      "w-full px-4 py-3 border rounded-none text-sm",
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
            <div className="bg-cream-dark/50 rounded-none p-4 mb-6">
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

            <h1 className="font-display text-xl tracking-widest uppercase mb-2">
              Payment Method
            </h1>
            {showSplitPaymentOption ? (
              <p className="text-xs text-black/55 mb-4">
                <span className="font-medium text-black/75">Blits + card or mobile</span> uses part of your Blits and
                charges the rest to card, EcoCash, ZIMSWITCH, or Innbucks (you need some Blits).{' '}
                <span className="font-medium text-black/75">Pay with Blits</span> covers the whole order from your
                wallet (you need enough Blits for the full amount after the loyalty discount).
              </p>
            ) : null}

            {hasBlitsTopupInCart ? (
              <p className="text-xs text-black/55 mb-4">
                This order includes Blits wallet credit. Complete payment with card, mobile money, or bank — wallet
                top-ups cannot be paid with Blits.
              </p>
            ) : null}

            {/* Payment Method Selection */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {paymentMethods.map((method) => {
                const Icon = icons[method.icon];
                const isSelected = selectedMethod === method.id;
                const splitDisabled = method.id === "blits_split" && !splitPaymentUsable;
                const fullBlitsDisabled = method.id === "blits" && !fullBlitsPaymentUsable;
                const optionDisabled = splitDisabled || fullBlitsDisabled;

                let description = method.description;
                if (method.id === "blits_split" && !splitPaymentUsable) {
                  description =
                    "Requires a Blits balance. Top up or earn Blits, then use this to split with card or mobile.";
                } else if (method.id === "blits" && !fullBlitsPaymentUsable) {
                  if (blitsBalance === null) {
                    description = "Loading your Blits wallet…";
                  } else if (blitsBalance === 0) {
                    description =
                      "Requires enough Blits to cover this order. Top up or earn Blits first.";
                  } else {
                    description = `Needs ${blitsPricing.blitsNeeded.toLocaleString()} Blits for this order; your balance is ${blitsBalance.toLocaleString()}. Top up or use Blits + card or mobile.`;
                  }
                }

                return (
                  <div
                    key={method.id}
                    role="radio"
                    aria-checked={isSelected}
                    aria-disabled={optionDisabled}
                    tabIndex={optionDisabled ? -1 : 0}
                    onClick={() => {
                      if (splitDisabled) {
                        showToast({
                          title: "Blits balance needed",
                          message:
                            "Add Blits to your wallet or earn them on purchases to pay part of an order with Blits and the rest by card or mobile.",
                          variant: "info",
                        });
                        return;
                      }
                      if (fullBlitsDisabled) {
                        showToast({
                          title: "Cannot pay fully with Blits yet",
                          message:
                            blitsBalance === null
                              ? "Loading your wallet. Try again in a moment."
                              : blitsBalance === 0
                                ? "Add Blits to your wallet or earn them on purchases to pay the full order with Blits."
                                : `This order needs ${blitsPricing.blitsNeeded.toLocaleString()} Blits after the loyalty discount. Your balance is ${blitsBalance.toLocaleString()}. Top up, or choose Blits + card or mobile to pay part with Blits.`,
                          variant: "info",
                        });
                        return;
                      }
                      setSelectedMethod(method.id);
                    }}
                    onKeyDown={(e) => {
                      if (optionDisabled) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedMethod(method.id);
                      }
                    }}
                    className={cn(
                      "flex items-center gap-4 p-4 border rounded-none transition-all",
                      optionDisabled
                        ? "border-black/15 bg-black/[0.02] cursor-not-allowed opacity-60"
                        : "cursor-pointer",
                      !optionDisabled &&
                        (isSelected
                        ? "border-gold bg-gold/5"
                          : "border-black/20 hover:border-gold/50")
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
                        <p className="text-xs text-black/60">{description}</p>
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
            <div className="bg-cream-dark/50 rounded-none p-6">
              <h2 className="font-display text-lg tracking-widest uppercase mb-6">
                Order Summary
              </h2>

              {/* Items */}
              <div className="space-y-4 max-h-48 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.id} className="flex gap-3">
                    <div className="relative w-14 h-[4.5rem] bg-cream rounded-none flex-shrink-0 overflow-hidden">
                      <CartLineThumbnail
                          src={item.thumbnail}
                          alt={item.title}
                        className="h-full w-full"
                        />
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
              <div className="border-t border-gold/20 mt-4 pt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-black/60">Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                {(selectedMethod === 'blits' || selectedMethod === 'blits_split') &&
                blitsSettings &&
                blitsSettings.product_discount_percent_paying_blits > 0 ? (
                  <div className="flex justify-between text-emerald-700">
                    <span>Blits loyalty discount ({blitsSettings.product_discount_percent_paying_blits}%)</span>
                    <span>−${(subtotal - blitsPricing.discountedSubtotal).toFixed(2)}</span>
                  </div>
                ) : null}
                {selectedMethod === 'blits' || selectedMethod === 'blits_split' ? (
                  <div className="flex justify-between text-black/70">
                    <span>Subtotal after discount</span>
                    <span>${blitsPricing.discountedSubtotal.toFixed(2)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <span className="text-black/60">Shipping</span>
                  <span>{shipping === 0 ? 'FREE' : `$${shipping.toFixed(2)}`}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gold/20 text-base font-semibold">
                  <span>Total {selectedMethod === 'blits' || selectedMethod === 'blits_split' ? '(USD equiv.)' : ''}</span>
                  <span>
                    $
                    {selectedMethod === 'blits' || selectedMethod === 'blits_split'
                      ? blitsPricing.payableUsd.toFixed(2)
                      : total.toFixed(2)}
                  </span>
                </div>
                {selectedMethod === 'blits_split' && blitsSettings ? (
                  <div className="text-xs text-black/60 pt-2 space-y-1 border-t border-gold/10 mt-2">
                    <div className="flex justify-between">
                      <span>Blits to apply</span>
                      <span className="font-medium text-black">
                        {splitBlitsToUse.toLocaleString()} Blits (~${splitUsdFromBlits.toFixed(2)})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>
                        Pay remainder (
                        {cashMethodsForSplit.find((m) => m.id === splitCashMethod)?.name || '…'})
                      </span>
                      <span className="font-medium text-black">${splitRemainderUsd.toFixed(2)}</span>
                    </div>
                  </div>
                ) : null}
                {selectedMethod === 'blits' && blitsSettings ? (
                  <p className="text-xs text-black/55 pt-1">
                    Charged as {blitsPricing.blitsNeeded} Blits (rate {blitsSettings.usd_to_blits_per_dollar}{' '}
                    Blits / $1).
                    {blitsBalance !== null ? ` Your balance: ${blitsBalance} Blits.` : ''}
                  </p>
                ) : null}
              </div>
            </div>

            {/* Payment Input Forms - Separate Card */}
            {selectedMethod && (
              <div className="bg-cream-dark/50 rounded-none p-6">
                {selectedMethod === 'blits' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <h3 className="font-display text-lg tracking-widest uppercase mb-4">Pay with Blits</h3>
                    <p className="text-sm text-black/70">
                      Your order will be charged as{' '}
                      <span className="font-semibold">{blitsPricing.blitsNeeded} Blits</span> (includes loyalty
                      discount on products when configured).
                    </p>
                    {blitsBalance !== null ? (
                      <p className="text-sm">
                        Balance: <span className="font-medium">{blitsBalance}</span> Blits
                        {blitsPricing.blitsNeeded > blitsBalance ? (
                          <span className="text-red-600 ml-2">Not enough Blits for this order.</span>
                        ) : null}
                      </p>
                    ) : (
                      <p className="text-sm text-amber-800">Sign in to use Blits at checkout.</p>
                    )}
                    <button
                      type="button"
                      onClick={() => void handlePlaceOrder()}
                      disabled={isSubmitting || blitsBalance === null || blitsPricing.blitsNeeded > (blitsBalance ?? 0)}
                      className={cn(
                        "w-full bg-gold text-white py-4 rounded-none text-sm font-semibold tracking-widest uppercase",
                        "hover:bg-gold-dark transition-colors",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      {isSubmitting ? 'Processing...' : `Pay ${blitsPricing.blitsNeeded} Blits`}
                    </button>
                  </motion.div>
                )}

                {selectedMethod === 'blits_split' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <h3 className="font-display text-lg tracking-widest uppercase mb-2">Blits + card or mobile</h3>
                    <p className="text-sm text-black/70">
                      Choose how many Blits to apply (loyalty discount still applies). Blits are deducted first,
                      then we charge the remaining balance to your selected method. If that payment fails, your
                      Blits are refunded automatically.
                    </p>
                    {blitsBalance !== null && splitBlitsMax >= 1 ? (
                      <>
                        <div>
                          <label className="block text-xs font-medium mb-2 text-black/70">
                            Blits to use (max {splitBlitsMax.toLocaleString()})
                          </label>
                          <input
                            type="range"
                            min={1}
                            max={splitBlitsMax}
                            value={Math.min(splitBlitsToUse, splitBlitsMax)}
                            onChange={(e) => setSplitBlitsToUse(Number(e.target.value))}
                            className="w-full accent-gold h-2"
                          />
                          <div className="flex justify-between text-xs text-black/45 mt-1">
                            <span>1</span>
                            <span>{splitBlitsMax.toLocaleString()}</span>
                          </div>
                        </div>
                        <p className="text-sm">
                          Wallet: <span className="font-medium">{blitsBalance.toLocaleString()}</span> Blits
                        </p>
                        <p className="text-sm">
                          <span className="text-black/60">Covered by Blits:</span>{' '}
                          <span className="font-semibold">${splitUsdFromBlits.toFixed(2)}</span>
                        </p>
                        <p className="text-sm">
                          <span className="text-black/60">Remaining:</span>{' '}
                          <span className="font-semibold text-gold">${splitRemainderUsd.toFixed(2)}</span>
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-amber-800">Sign in with a Blits balance to use split checkout.</p>
                    )}

                    <h4 className="font-display text-xs tracking-widest uppercase mt-4 mb-2 text-black/80">
                      Pay remaining balance with
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {cashMethodsForSplit.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSplitCashMethod(m.id)}
                          className={cn(
                            'rounded-none border px-3 py-2.5 text-left text-xs transition-colors',
                            splitCashMethod === m.id
                              ? 'border-gold bg-gold/5'
                              : 'border-black/15 hover:border-gold/40'
                          )}
                        >
                          <span className="font-medium">{m.name}</span>
                        </button>
                      ))}
                    </div>

                    {splitCashMethod === 'card' && useStripeCard ? (
                      <p className="text-xs text-black/60 pt-2 border-t border-gold/15">
                        After you continue, you will enter your card in the secure Stripe form below.
                      </p>
                    ) : null}
                    {((splitCashMethod === 'card' && !useStripeCard) || splitCashMethod === 'zimswitch') ? (
                      <div className="space-y-4 pt-2 border-t border-gold/15">
                        <h4 className="font-display text-sm tracking-widest uppercase">Card for balance</h4>
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
                      </div>
                    ) : null}

                    {splitCashMethod && splitCashMethod !== 'card' && splitCashMethod !== 'zimswitch' ? (
                      <div className="space-y-4 pt-2 border-t border-gold/15">
                        <h4 className="font-display text-sm tracking-widest uppercase">
                          {cashMethodsForSplit.find((m) => m.id === splitCashMethod)?.name || 'Mobile'} details
                        </h4>
                        <div>
                          <label className="block text-xs font-medium mb-1 text-black/70">Mobile Number</label>
                          <input
                            type="tel"
                            placeholder={
                              cashMethodsForSplit.find((m) => m.id === splitCashMethod)?.phoneFormat ||
                              '+263 7X XXX XXXX'
                            }
                            {...mobileForm.register('phoneNumber')}
                            className={inputClassName(!!mobileForm.formState.errors.phoneNumber)}
                          />
                          {mobileForm.formState.errors.phoneNumber && (
                            <p className="text-red-500 text-xs mt-1">
                              {mobileForm.formState.errors.phoneNumber.message}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => void handlePlaceOrder()}
                      disabled={
                        isSubmitting ||
                        stripeCheckout != null ||
                        blitsBalance === null ||
                        splitBlitsMax < 1 ||
                        splitBlitsToUse < 1 ||
                        splitBlitsToUse > splitBlitsMax ||
                        !splitCashMethod
                      }
                      className={cn(
                        'w-full bg-gold text-white py-4 rounded-none text-sm font-semibold tracking-widest uppercase',
                        'hover:bg-gold-dark transition-colors',
                        'disabled:opacity-50 disabled:cursor-not-allowed'
                      )}
                    >
                      {isSubmitting
                        ? 'Processing...'
                        : splitRemainderUsd >= 0.01
                          ? `Pay $${splitRemainderUsd.toFixed(2)} + ${splitBlitsToUse.toLocaleString()} Blits`
                          : `Complete with ${splitBlitsToUse.toLocaleString()} Blits`}
                    </button>
                  </motion.div>
                )}

                {selectedMethod === 'card' && useStripeCard && !stripeCheckout && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <h3 className="font-display text-lg tracking-widest uppercase mb-2">Card payment</h3>
                    <p className="text-sm text-black/70">
                      You will enter your card on the next step using Stripe (supports 3D Secure).
                    </p>
                    <div className="flex items-center gap-2 text-xs text-black/50">
                      <Lock className="w-3 h-3" />
                      <span>Powered by Stripe</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handlePlaceOrder()}
                      disabled={isSubmitting}
                      className={cn(
                        "w-full bg-gold text-white py-4 rounded-none text-sm font-semibold tracking-widest uppercase",
                        "hover:bg-gold-dark transition-colors",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      {isSubmitting ? "Processing..." : `Continue — $${total.toFixed(2)}`}
                    </button>
                  </motion.div>
                )}

                {((selectedMethod === 'card' && !useStripeCard) || selectedMethod === 'zimswitch') && (
                  <motion.form
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onSubmit={onCardSubmit}
                    className="space-y-4"
                  >
                    <h3 className="font-display text-lg tracking-widest uppercase mb-4">
                      {selectedMethod === 'zimswitch' ? 'ZIMSWITCH' : 'Card Details'}
                    </h3>
                    
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
                        "w-full bg-gold text-white py-4 rounded-none text-sm font-semibold tracking-widest uppercase",
                        "hover:bg-gold-dark transition-colors",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      {isSubmitting ? 'Processing...' : `Pay $${total.toFixed(2)}`}
                    </button>
                  </motion.form>
                )}

                {selectedPaymentMethod?.type === 'mobile' &&
                  selectedMethod !== 'card' &&
                  selectedMethod !== 'zimswitch' &&
                  selectedMethod !== 'blits' &&
                  selectedMethod !== 'blits_split' && (
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
                        "w-full bg-gold text-white py-4 rounded-none text-sm font-semibold tracking-widest uppercase",
                        "hover:bg-gold-dark transition-colors",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      {isSubmitting ? 'Sending prompt...' : `Pay $${total.toFixed(2)}`}
                    </button>
                  </motion.form>
                )}

                    </div>
            )}
            {stripeCheckout ? (
              <div className="bg-cream-dark/50 rounded-none p-6 mt-6 border border-gold/20">
                <h3 className="font-display text-sm tracking-widest uppercase mb-3 text-black/80">
                  Secure card payment
                </h3>
                <StripeElementsPayment
                  clientSecret={stripeCheckout.clientSecret}
                  pending={stripeCheckout.pending}
                  amountLabel={
                    stripeCheckout.pending.splitIdem != null && stripeCheckout.pending.remainderUsd != null
                      ? `$${stripeCheckout.pending.remainderUsd.toFixed(2)}`
                      : `$${total.toFixed(2)}`
                  }
                  onSuccessInline={() => handleStripeSuccess(stripeCheckout.pending)}
                  onError={(msg) =>
                    showToast({
                      title: "Payment failed",
                      message: msg,
                      variant: "error",
                    })
                  }
                />
                {stripeCheckout.pending.splitIdem ? (
                  <button
                    type="button"
                    className="mt-4 text-sm text-black/60 hover:text-gold underline w-full text-left"
                    onClick={() => void handleCancelStripeSplit()}
                  >
                    Cancel and refund Blits
                    </button>
                ) : (
                  <button
                    type="button"
                    className="mt-4 text-sm text-black/60 hover:text-gold underline w-full text-left"
                    onClick={() => setStripeCheckout(null)}
                  >
                    Cancel
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
