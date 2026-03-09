"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AffiliateAdminAuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"key" | "email">("key");
  const [adminKey, setAdminKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const detectMode = async () => {
      try {
        const res = await fetch("/api/account/me", { cache: "no-store" });
        if (res.ok) {
          setMode("email");
        }
      } catch {
        setMode("key");
      }
    };
    detectMode();
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/admin/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: adminKey }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(String(data.error || "Admin authentication failed."));
      return;
    }
    router.push("/affiliate/admin");
  };

  return (
    <main className="min-h-[70vh] px-[5%] py-20 flex items-center justify-center">
      <div className="w-full max-w-lg border border-black/10 bg-white p-8 space-y-5">
        <h1 className="font-display text-2xl tracking-widest uppercase">Affiliate Admin Access</h1>
        <p className="text-sm text-black/65">
          This area is server-side protected. Authenticate to continue.
        </p>

        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block text-xs uppercase tracking-[0.2em] text-black/60">Admin key</label>
          <input
            type="password"
            required
            value={adminKey}
            onChange={(event) => setAdminKey(event.target.value)}
            className="w-full border border-black/20 px-4 py-3 text-sm"
            placeholder="Enter ADMIN_DASHBOARD_KEY"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white py-3 text-xs tracking-[0.2em] uppercase disabled:opacity-60"
          >
            {loading ? "Verifying..." : "Enter Admin Dashboard"}
          </button>
        </form>

        <div className="text-xs text-black/55 space-y-1">
          <p>
            If your project uses <code>ADMIN_EMAILS</code> instead of key mode, login first via{" "}
            <Link href="/account" className="underline">
              account
            </Link>{" "}
            and then open admin.
          </p>
          <p>Detected mode: {mode === "email" ? "email/session" : "admin key"}</p>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </main>
  );
}

