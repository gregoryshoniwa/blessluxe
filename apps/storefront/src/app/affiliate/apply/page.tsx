"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AffiliateApplyPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/affiliate/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          notes,
          acceptedTerms,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Application failed.");
        setIsSubmitting(false);
        return;
      }

      router.push(`/affiliate/dashboard?email=${encodeURIComponent(email)}`);
    } catch {
      setError("Application failed. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-theme-background py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white border border-theme-primary/20 rounded-xl p-8">
        <h1 className="font-display text-3xl mb-2">Affiliate Application</h1>
        <p className="text-black/60 mb-8">
          Join BLESSLUXE as an affiliate partner and earn commission for every referred sale.
        </p>

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              required
              className="px-4 py-3 border border-black/20 rounded-md"
            />
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              required
              className="px-4 py-3 border border-black/20 rounded-md"
            />
          </div>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            required
            className="w-full px-4 py-3 border border-black/20 rounded-md"
          />

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
