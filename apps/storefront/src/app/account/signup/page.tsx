"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: oauthSession } = useSession();
  const [googleOauthReady, setGoogleOauthReady] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const nextPath = searchParams.get("next") || "/account";

  useEffect(() => {
    const loadOauthStatus = async () => {
      try {
        const res = await fetch("/api/account/oauth-status", { cache: "no-store" });
        const data = (await res.json()) as { google?: boolean };
        setGoogleOauthReady(Boolean(data.google));
      } catch {
        setGoogleOauthReady(false);
      }
    };
    loadOauthStatus();
  }, []);

  useEffect(() => {
    const syncOauthSession = async () => {
      if (!oauthSession?.user?.email) return;
      const response = await fetch("/api/account/session-sync", { method: "POST" });
      if (response.ok) {
        router.replace(nextPath);
      }
    };
    syncOauthSession();
  }, [oauthSession?.user?.email, nextPath, router]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    const response = await fetch("/api/account/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ firstName, lastName, email, password }),
    });
    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.error || "Unable to create account.");
      return;
    }

    if (data.verifyEmailToken) {
      await fetch("/api/account/verify-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: data.verifyEmailToken }),
      });
    }
    router.replace(nextPath);
  };

  return (
    <main className="min-h-[75vh] px-[5%] py-16 flex items-center justify-center">
      <div className="w-full max-w-md border border-black/10 bg-white p-8 space-y-6">
        <div className="space-y-2">
          <p className="font-script text-3xl text-gold">Join BLESSLUXE</p>
          <h1 className="font-display text-2xl tracking-widest uppercase">Create Account</h1>
          <p className="text-sm text-black/60">Use Google or email to create your account.</p>
        </div>

        <button
          onClick={() => signIn("google", { callbackUrl: `/account/signup?next=${encodeURIComponent(nextPath)}` })}
          disabled={!googleOauthReady}
          className="w-full bg-black text-white py-3 text-xs tracking-[0.2em] uppercase disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {googleOauthReady ? "Continue With Google" : "Google OAuth Not Configured"}
        </button>

        <div className="flex items-center gap-3 text-xs text-black/40 uppercase tracking-[0.2em]">
          <span className="h-px flex-1 bg-black/10" />
          <span>or</span>
          <span className="h-px flex-1 bg-black/10" />
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="First name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              className="w-full border border-black/20 px-4 py-3 text-sm"
            />
            <input
              type="text"
              placeholder="Last name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              className="w-full border border-black/20 px-4 py-3 text-sm"
            />
          </div>
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full border border-black/20 px-4 py-3 text-sm"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full border border-black/20 px-4 py-3 text-sm"
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gold text-white py-3 text-xs tracking-[0.2em] uppercase disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create Account"}
          </button>
        </form>

        <p className="text-sm text-black/65">
          Already have an account?{" "}
          <Link href={`/account/login?next=${encodeURIComponent(nextPath)}`} className="underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

