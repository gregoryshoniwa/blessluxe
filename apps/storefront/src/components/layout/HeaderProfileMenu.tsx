"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, CircleUser, Loader2, LogOut, User } from "lucide-react";
import { cn } from "@/lib/utils";

type MeCustomer = {
  email?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
};

type Props = {
  isLoggedIn: boolean;
};

export function HeaderProfileMenu({ isLoggedIn }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [customer, setCustomer] = useState<MeCustomer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const loadProfile = useCallback(async () => {
    if (!isLoggedIn) {
      setCustomer(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/account/me", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { customer?: MeCustomer | null };
        setCustomer(data.customer ?? null);
      } else {
        setCustomer(null);
      }
    } catch {
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile, pathname]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const displayName = (() => {
    if (!customer) return "";
    const c = customer;
    if (c.full_name?.trim()) return c.full_name.trim();
    const fn = String(c.first_name || "").trim();
    const ln = String(c.last_name || "").trim();
    if (fn || ln) return `${fn} ${ln}`.trim();
    return String(c.email || "");
  })();

  const emailLine = customer?.email?.trim() || "";
  const headline = displayName || emailLine || "Member";
  const showEmailSecondary = Boolean(emailLine && headline !== emailLine);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open && isLoggedIn) void loadProfile();
        }}
        className={cn(
          "flex items-center gap-0.5 p-2 transition-colors hover:text-theme-primary theme-transition",
          open && "text-theme-primary"
        )}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={isLoggedIn ? "Account menu" : "Sign in"}
      >
        {isLoggedIn ? (
          <CircleUser className="w-5 h-5" strokeWidth={1.5} />
        ) : (
          <User className="w-5 h-5" strokeWidth={1.5} />
        )}
        <ChevronDown className={cn("h-3.5 w-3.5 opacity-70 transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-[60] mt-2 w-[min(100vw-2rem,280px)] border border-black/10 bg-white shadow-xl theme-transition"
          >
            {isLoggedIn ? (
              <>
                <div className="border-b border-black/10 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/45">Signed in</p>
                  {loading && !customer ? (
                    <Loader2 className="mt-2 h-5 w-5 animate-spin text-gold" aria-label="Loading profile" />
                  ) : (
                    <>
                      <p className="mt-1 font-display text-lg leading-snug text-black/90 line-clamp-2">{headline}</p>
                      {showEmailSecondary ? (
                        <p className="mt-0.5 text-xs text-black/50 truncate" title={emailLine}>
                          {emailLine}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
                <div className="flex flex-col gap-px bg-black/10">
                  <Link
                    href="/account"
                    onClick={() => setOpen(false)}
                    className="bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-black/85 hover:bg-cream-dark/80 theme-transition"
                  >
                    My account
                  </Link>
                  <Link
                    href="/account?tab=transactions"
                    onClick={() => setOpen(false)}
                    className="bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-black/85 hover:bg-cream-dark/80 theme-transition"
                  >
                    Orders & invoices
                  </Link>
                  <Link
                    href="/account?tab=blits"
                    onClick={() => setOpen(false)}
                    className="bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-black/70 hover:bg-cream-dark/80 theme-transition"
                  >
                    Blits wallet
                  </Link>
                </div>
                <div className="border-t border-black/10 px-4 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      void (async () => {
                        setOpen(false);
                        await signOut({ redirect: false });
                        await fetch("/api/account/logout", { method: "POST" });
                        router.refresh();
                        router.push("/");
                      })();
                    }}
                    className="flex w-full items-center gap-2 text-left text-[11px] font-medium uppercase tracking-[0.12em] text-black/60 transition hover:text-red-700"
                  >
                    <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Sign out
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-px bg-black/10 p-px">
                <Link
                  href="/account/login"
                  onClick={() => setOpen(false)}
                  className="bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-black/85 hover:bg-cream-dark/80 theme-transition"
                >
                  Sign in
                </Link>
                <Link
                  href="/account/signup"
                  onClick={() => setOpen(false)}
                  className="bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-black/85 hover:bg-cream-dark/80 theme-transition"
                >
                  Create account
                </Link>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
