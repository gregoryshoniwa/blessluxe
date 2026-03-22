"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Loader2, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  isLoggedIn: boolean;
};

export function HeaderWalletMenu({ isLoggedIn }: Props) {
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const loadBalance = useCallback(async () => {
    if (!isLoggedIn) {
      setBalance(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/blits/wallet", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { balance?: number };
        setBalance(Number(data.balance ?? 0));
      } else {
        setBalance(null);
      }
    } catch {
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    void loadBalance();
  }, [loadBalance, pathname]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!isLoggedIn) {
    return null;
  }

  const balanceLabel =
    loading && balance === null ? "…" : balance !== null ? balance.toLocaleString() : "—";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void loadBalance();
        }}
        className={cn(
          "flex items-center gap-1 p-2 transition-colors hover:text-theme-primary theme-transition sm:gap-1.5",
          open && "text-theme-primary"
        )}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Blits wallet"
      >
        <Wallet className="w-5 h-5" strokeWidth={1.5} />
        <span className="hidden max-w-[4.5rem] truncate text-[11px] font-semibold tracking-wide tabular-nums sm:inline">
          {balanceLabel}
        </span>
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
            <div className="border-b border-black/10 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/45">Blits balance</p>
              <div className="mt-1 flex items-baseline gap-2">
                {loading && balance === null ? (
                  <Loader2 className="h-6 w-6 animate-spin text-gold" />
                ) : (
                  <p className="font-display text-2xl text-gold">{balanceLabel}</p>
                )}
                <span className="text-xs text-black/45">Blits</span>
              </div>
            </div>
            <div className="flex flex-col gap-px bg-black/10">
              <Link
                href="/account?tab=blits&sub=add"
                onClick={() => setOpen(false)}
                className="bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-black/85 hover:bg-cream-dark/80 theme-transition"
              >
                Top up
              </Link>
              <Link
                href="/account?tab=blits&sub=payout"
                onClick={() => setOpen(false)}
                className="bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-black/85 hover:bg-cream-dark/80 theme-transition"
              >
                Payout
              </Link>
              <Link
                href="/account?tab=blits&sub=activity"
                onClick={() => setOpen(false)}
                className="bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-black/70 hover:bg-cream-dark/80 theme-transition"
              >
                View activity
              </Link>
            </div>
            <div className="border-t border-black/10 px-4 py-2">
              <Link
                href="/account?tab=blits"
                onClick={() => setOpen(false)}
                className="text-[11px] text-black/50 underline-offset-2 hover:text-theme-primary hover:underline"
              >
                Open wallet
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
