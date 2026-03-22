"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/providers";

export default function AffiliateApplyPage() {
  const { showToast } = useToast();
  const router = useRouter();
  const [customerEmail, setCustomerEmail] = useState("");
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [notes, setNotes] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const validateSession = async () => {
      try {
        const response = await fetch("/api/account/me", { cache: "no-store" });
        const data = await response.json();
        if (!data.customer?.email) {
          router.replace("/account/login?next=/affiliate/apply");
          return;
        }
        setCustomerEmail(String(data.customer.email));
      } catch {
        router.replace("/account/login?next=/affiliate/apply");
        return;
      } finally {
        setCheckingAuth(false);
      }
    };
    validateSession();
  }, [router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/affiliate/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes,
          acceptedTerms,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        const message = data.error || "Application failed.";
        setError(message);
        showToast({
          title: "Application failed",
          message,
          variant: "error",
        });
        setIsSubmitting(false);
        return;
      }

      showToast({
        title: "Application submitted",
        message: "We will review your affiliate application shortly.",
        variant: "success",
      });
      router.push(`/affiliate/dashboard?email=${encodeURIComponent(customerEmail)}`);
    } catch {
      const message = "Application failed. Please try again.";
      setError(message);
      showToast({
        title: "Application failed",
        message,
        variant: "error",
      });
      setIsSubmitting(false);
    }
  };

  if (checkingAuth) {
    return (
      <main className="min-h-screen bg-theme-background py-12 px-4">
        <div className="max-w-3xl mx-auto bg-white border border-theme-primary/20 rounded-xl p-8">
          <p className="text-black/60">Checking your account session...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-theme-background py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white border border-theme-primary/20 rounded-xl p-8">
        <h1 className="font-display text-3xl mb-2">Affiliate Application</h1>
        <p className="text-black/60 mb-8">
          Join BLESSLUXE as an affiliate partner and earn commission for every referred sale. Your logged-in profile is used for application identity.
        </p>

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="rounded-lg bg-theme-background-dark p-4 text-sm text-black/70">
            <p className="font-medium mb-1">Account used for application</p>
            <p>{customerEmail}</p>
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Tell us about your audience (optional)"
            rows={4}
            className="w-full px-4 py-3 border border-black/20 rounded-md"
          />

          <div className="rounded-lg bg-theme-background-dark p-4 text-sm text-black/70">
            <p className="font-medium mb-2">Terms and Conditions</p>
            <ul className="space-y-1">
              <li>- Commission is paid on approved completed orders only.</li>
              <li>- Fraudulent/self-referral activity may lead to account suspension.</li>
              <li>- Payouts are subject to minimum threshold and verification.</li>
            </ul>
          </div>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-1"
            />
            <span>I agree to BLESSLUXE affiliate terms and conditions.</span>
          </label>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <p className="text-xs text-black/55">
            Need another account?{" "}
            <Link href="/account/login" className="underline">
              Switch login
            </Link>
          </p>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-theme-primary text-white py-3 rounded-md font-semibold disabled:opacity-60"
          >
            {isSubmitting ? "Submitting..." : "Submit for Approval"}
          </button>
        </form>
      </div>
    </main>
  );
}
