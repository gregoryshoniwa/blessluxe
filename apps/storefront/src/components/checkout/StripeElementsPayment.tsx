"use client";

import { useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { cn } from "@/lib/utils";
import { saveStripePendingCheckout, type StripePendingCheckout } from "@/lib/checkout-finalize-order-client";

const pk =
  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "" : "";
const stripePromise = pk ? loadStripe(pk) : null;

type InnerProps = {
  clientSecret: string;
  returnUrl: string;
  pending: StripePendingCheckout;
  amountLabel: string;
  onSuccessInline: () => void | Promise<void>;
  onError: (message: string) => void;
};

function InnerStripePay({ clientSecret, returnUrl, pending, amountLabel, onSuccessInline, onError }: InnerProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);

  const handlePay = async () => {
    if (!stripe || !elements) {
      onError("Payment system is still loading. Please wait.");
      return;
    }
    setBusy(true);
    saveStripePendingCheckout(pending);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: returnUrl,
      },
    });

    if (error) {
      if (error.type === "card_error" || error.type === "validation_error") {
        onError(error.message ?? "Payment could not be completed.");
      } else {
        onError(error.message ?? "Payment failed.");
      }
      setBusy(false);
      return;
    }

    const { paymentIntent } = await stripe.retrievePaymentIntent(clientSecret);
    if (paymentIntent?.status !== "succeeded") {
      // 3DS / bank redirect in progress — return page will finalize.
      setBusy(false);
      return;
    }

    try {
      await onSuccessInline();
    } catch (e) {
      console.error(e);
      onError("Order could not be finalized. Please contact support.");
    }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <PaymentElement />
      <button
        type="button"
        onClick={() => void handlePay()}
        disabled={busy || !stripe || !elements}
        className={cn(
          "w-full bg-gold text-white py-4 rounded-none text-sm font-semibold tracking-widest uppercase",
          "hover:bg-gold-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {busy ? "Processing…" : `Pay ${amountLabel}`}
      </button>
    </div>
  );
}

export function StripeElementsPayment(props: {
  clientSecret: string;
  pending: StripePendingCheckout;
  amountLabel: string;
  onSuccessInline: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  if (!stripePromise) {
    return (
      <p className="text-sm text-amber-800">
        Stripe publishable key is missing. Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.
      </p>
    );
  }

  const returnUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/checkout/payment/stripe-return`
      : "/checkout/payment/stripe-return";

  const options: StripeElementsOptions = {
    clientSecret: props.clientSecret,
    appearance: {
      theme: "stripe",
      variables: {
        colorPrimary: "#b8860b",
      },
    },
  };

  return (
    <Elements stripe={stripePromise} options={options}>
      <InnerStripePay {...props} clientSecret={props.clientSecret} returnUrl={returnUrl} />
    </Elements>
  );
}

export function isStripePublishableConfigured(): boolean {
  return Boolean(pk);
}
