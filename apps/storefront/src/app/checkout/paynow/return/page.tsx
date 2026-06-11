"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

type SessionState = "pending" | "paid" | "failed" | "cancelled" | "unknown";

interface SessionPayload {
  reference: string;
  status: SessionState;
  provider_status: string | null;
  order_id: string | null;
}

export default function PaynowReturnPage() {
  const router = useRouter();
  const params = useSearchParams();
  const reference = params.get("reference");
  const [state, setState] = useState<SessionState>("pending");
  const [providerStatus, setProviderStatus] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (!reference) {
      setState("unknown");
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/checkout/paynow/status/${encodeURIComponent(reference)}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          if (!cancelled) setAttempts((n) => n + 1);
          return;
        }
        const data = (await res.json()) as { session?: SessionPayload };
        if (cancelled) return;
        const s = data.session;
        if (!s) {
          setState("unknown");
          return;
        }
        setState(s.status);
        setProviderStatus(s.provider_status || null);
        if (s.status === "paid") {
          router.replace("/account?tab=transactions");
        }
      } finally {
        if (!cancelled) setAttempts((n) => n + 1);
      }
    };
    void tick();
    const interval = setInterval(() => {
      if (state === "paid" || state === "failed" || state === "cancelled") return;
      void tick();
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [reference, router, state]);

  return (
    <main className="min-h-screen bg-cream/40 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white border border-black/10 p-8 text-center">
        {state === "paid" ? (
          <>
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <h1 className="font-display text-2xl text-black mb-2">Payment received</h1>
            <p className="text-sm text-black/65">
              Redirecting to your account…
            </p>
          </>
        ) : state === "failed" || state === "cancelled" ? (
          <>
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h1 className="font-display text-2xl text-black mb-2">Payment {state}</h1>
            <p className="text-sm text-black/65 mb-4">
              {providerStatus ? `Paynow status: ${providerStatus}` : "We couldn't complete this transaction."}
            </p>
            <Link
              href="/cart"
              className="inline-block bg-gold text-white px-6 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark transition-colors"
            >
              Back to cart
            </Link>
          </>
        ) : state === "unknown" ? (
          <>
            <AlertCircle className="w-12 h-12 text-black/50 mx-auto mb-4" />
            <h1 className="font-display text-2xl text-black mb-2">No payment found</h1>
            <p className="text-sm text-black/65 mb-4">
              We can&apos;t find a payment with that reference.
            </p>
            <Link
              href="/cart"
              className="inline-block bg-gold text-white px-6 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark transition-colors"
            >
              Back to cart
            </Link>
          </>
        ) : (
          <>
            <Loader2 className="w-12 h-12 text-gold-dark mx-auto mb-4 animate-spin" />
            <h1 className="font-display text-2xl text-black mb-2">Confirming payment</h1>
            <p className="text-sm text-black/65">
              Paynow is finalising your transaction. This usually takes a few seconds.
            </p>
            <p className="text-[10px] tracking-widest uppercase text-black/40 mt-4">
              Reference: <span className="font-mono">{reference}</span>
              {attempts > 0 ? ` · check ${attempts}` : ""}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
