"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { useCheckoutStore } from "@/stores/checkout";
import { useCartStore } from "@/stores/cart";
import {
  clearStripePendingCheckout,
  finalizeOrderAfterPayment,
  readStripePendingCheckout,
} from "@/lib/checkout-finalize-order-client";

const pk =
  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "" : "";

function StripeReturnInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Confirming payment…");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!pk) {
        setMessage("Stripe is not configured.");
        return;
      }

      const clientSecret = searchParams.get("payment_intent_client_secret");
      if (!clientSecret) {
        setMessage("Missing payment confirmation. Return to checkout and try again.");
        return;
      }

      const stripe = await loadStripe(pk);
      if (!stripe) {
        setMessage("Could not load Stripe.");
        return;
      }

      const { paymentIntent, error } = await stripe.retrievePaymentIntent(clientSecret);
      if (cancelled) return;

      if (error) {
        setMessage(error.message ?? "Could not verify payment.");
        return;
      }

      const status = paymentIntent?.status;
      const pending = readStripePendingCheckout();

      if (status !== "succeeded") {
        if (pending?.splitIdem) {
          try {
            await fetch("/api/blits/checkout-split-reversal", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ idempotencyKey: pending.splitIdem }),
            });
          } catch {
            /* best effort */
          }
        }
        clearStripePendingCheckout();
        setMessage(
          pending?.splitIdem
            ? "Payment was not completed. Your Blits were refunded."
            : "Payment was not completed."
        );
        router.replace("/checkout/payment?stripe=incomplete");
        return;
      }

      if (!pending) {
        setMessage("Session expired. If you were charged, contact support with your email.");
        return;
      }

      await finalizeOrderAfterPayment({
        pending,
        setPaymentMethod: (m) => useCheckoutStore.getState().setPaymentMethod(m),
        setOrderComplete: (a, b) => useCheckoutStore.getState().setOrderComplete(a, b),
        clearCart: () => useCartStore.getState().clearCart(),
      });

      clearStripePendingCheckout();
      router.replace(`/checkout/confirmation?order=${encodeURIComponent(pending.orderNumber)}`);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4">
      <p className="font-body text-black/70">{message}</p>
    </div>
  );
}

export default function StripePaymentReturnPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-cream px-4">
          <p className="font-body text-black/70">Confirming payment…</p>
        </div>
      }
    >
      <StripeReturnInner />
    </Suspense>
  );
}
