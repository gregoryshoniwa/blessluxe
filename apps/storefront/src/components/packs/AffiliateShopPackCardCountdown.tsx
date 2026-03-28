"use client";

import { useEffect, useState } from "react";

/** Compact H/M/S (and days if needed) for pack cards on the affiliate shop grid. */
export function AffiliateShopPackCardCountdown({ endsAt }: { endsAt: string | null | undefined }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [endsAt]);
  if (!endsAt) return null;
  const end = new Date(endsAt).getTime();
  if (Number.isNaN(end)) return null;
  const left = Math.max(0, end - now);
  if (left <= 0) return null;

  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  const unit =
    "flex flex-col items-center justify-center rounded-lg bg-white border border-theme-primary/30 px-1.5 py-1 min-w-[2.1rem] shadow-sm";

  return (
    <div className="rounded-lg border border-theme-primary/20 bg-gradient-to-br from-amber-50/90 to-white px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-[0.12em] text-theme-primary font-semibold text-center mb-1">
        Early-bird ends
      </p>
      <div className="flex gap-1 justify-center flex-wrap">
        {d > 0 ? (
          <div className={unit}>
            <span className="font-display text-sm tabular-nums leading-none text-black">{d}</span>
            <span className="text-[8px] text-black/40 uppercase mt-0.5">d</span>
          </div>
        ) : null}
        <div className={unit}>
          <span className="font-display text-sm tabular-nums leading-none text-black">{h}</span>
          <span className="text-[8px] text-black/40 uppercase mt-0.5">h</span>
        </div>
        <div className={unit}>
          <span className="font-display text-sm tabular-nums leading-none text-black">{m}</span>
          <span className="text-[8px] text-black/40 uppercase mt-0.5">m</span>
        </div>
        <div className={`${unit} ${left < 60_000 ? "ring-1 ring-theme-primary/40" : ""}`}>
          <span className="font-display text-sm tabular-nums leading-none text-theme-primary">{sec}</span>
          <span className="text-[8px] text-black/40 uppercase mt-0.5">s</span>
        </div>
      </div>
    </div>
  );
}
