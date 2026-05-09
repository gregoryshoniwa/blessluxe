"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api";
import type { AdminUser } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@blessluxe.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ token: string; user: AdminUser }>("/auth/login", {
        email,
        password,
      });
      setToken(res.token);
      router.replace("/");
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4"
      style={{
        background:
          "radial-gradient(circle at 20% 20%, var(--blush) 0%, transparent 45%), radial-gradient(circle at 80% 80%, color-mix(in srgb, var(--gold) 18%, transparent) 0%, transparent 50%), var(--cream)",
      }}
    >
      {/* Decorative gold corners */}
      <div className="pointer-events-none absolute top-8 left-8 h-12 w-12">
        <div className="absolute top-0 left-0 h-px w-12 bg-[var(--gold)]" />
        <div className="absolute top-0 left-0 h-12 w-px bg-[var(--gold)]" />
      </div>
      <div className="pointer-events-none absolute top-8 right-8 h-12 w-12">
        <div className="absolute top-0 right-0 h-px w-12 bg-[var(--gold)]" />
        <div className="absolute top-0 right-0 h-12 w-px bg-[var(--gold)]" />
      </div>
      <div className="pointer-events-none absolute bottom-8 left-8 h-12 w-12">
        <div className="absolute bottom-0 left-0 h-px w-12 bg-[var(--gold)]" />
        <div className="absolute bottom-0 left-0 h-12 w-px bg-[var(--gold)]" />
      </div>
      <div className="pointer-events-none absolute bottom-8 right-8 h-12 w-12">
        <div className="absolute bottom-0 right-0 h-px w-12 bg-[var(--gold)]" />
        <div className="absolute bottom-0 right-0 h-12 w-px bg-[var(--gold)]" />
      </div>

      <form
        onSubmit={onSubmit}
        className="relative w-full max-w-md bg-white px-10 py-12 shadow-xl animate-fade-up"
        style={{
          border: "1px solid var(--line)",
          borderRadius: 4,
          boxShadow:
            "0 1px 0 var(--gold), 0 25px 60px -20px color-mix(in srgb, var(--gold) 35%, transparent)",
        }}
      >
        {/* Brand mark */}
        <div className="mb-10 text-center">
          <p className="font-script text-3xl text-[var(--gold-dark)]">Bless</p>
          <h1 className="font-display text-4xl font-medium tracking-[0.3em] text-[var(--ink)]">
            BLESSLUXE
          </h1>
          <div className="mt-4 flex items-center justify-center gap-3">
            <span className="h-px w-8 bg-[var(--gold)]" />
            <span className="text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
              Admin Atelier
            </span>
            <span className="h-px w-8 bg-[var(--gold)]" />
          </div>
        </div>

        <div className="space-y-5">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-luxe text-[var(--ink-light)]">
              Email
            </span>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="you@blessluxe.com"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-luxe text-[var(--ink-light)]">
              Password
            </span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
            />
          </label>
          {error && (
            <div
              className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 animate-fade-in"
              role="alert"
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full mt-2"
            style={{ padding: "0.8rem 1.25rem" }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </div>

        <p className="mt-8 text-center text-[10px] uppercase tracking-luxe text-[var(--ink-muted)]">
          Restricted · Authorised personnel only
        </p>
      </form>
    </main>
  );
}
