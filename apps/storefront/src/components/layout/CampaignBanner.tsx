"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ActiveCampaign {
  id: string;
  name: string;
  handle: string;
  description: string | null;
  banner_url: string | null;
  banner_text: string | null;
  banner_cta_label: string | null;
  banner_cta_href: string | null;
  discount_percent: number | null;
  starts_at: string;
  ends_at: string;
  show_countdown: boolean;
}

function useCountdown(endsAt: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return null;
  const ms = Math.max(0, new Date(endsAt).getTime() - now);
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return { days, hours, minutes, seconds, expired: ms === 0 };
}

export function CampaignBanner() {
  const [campaign, setCampaign] = useState<ActiveCampaign | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const countdown = useCountdown(campaign?.show_countdown ? campaign.ends_at : undefined);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/campaigns/active", { cache: "no-store" });
        const data = (await res.json()) as { campaigns?: ActiveCampaign[] };
        if (alive) setCampaign(data.campaigns?.[0] || null);
      } catch {
        /* silent */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!campaign || dismissed) return null;

  return (
    <div
      className="relative w-full theme-transition"
      style={{
        background:
          "linear-gradient(90deg, var(--theme-primary-dark, #B8860B), var(--theme-primary, #C9A84C))",
        color: "white",
      }}
    >
      <div className="max-w-[1600px] mx-auto px-[5%] py-2.5 flex items-center justify-center gap-4 text-sm">
        <span className="font-display tracking-soft">
          {campaign.banner_text || campaign.name}
          {campaign.discount_percent != null && campaign.discount_percent > 0 && (
            <span className="ml-2 text-xs uppercase tracking-luxe">
              −{campaign.discount_percent}% off
            </span>
          )}
        </span>
        {countdown && !countdown.expired && (
          <span className="hidden sm:flex items-center gap-1.5 font-mono text-xs uppercase tracking-luxe">
            <CountdownCell n={countdown.days} unit="d" />
            <CountdownCell n={countdown.hours} unit="h" />
            <CountdownCell n={countdown.minutes} unit="m" />
            <CountdownCell n={countdown.seconds} unit="s" />
          </span>
        )}
        {campaign.banner_cta_href && campaign.banner_cta_label && (
          <Link
            href={campaign.banner_cta_href}
            className="hidden md:inline-block rounded-sm bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-luxe hover:bg-white/25"
          >
            {campaign.banner_cta_label}
          </Link>
        )}
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs opacity-70 hover:opacity-100"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function CountdownCell({ n, unit }: { n: number; unit: string }) {
  return (
    <span className="inline-flex items-baseline gap-0.5">
      <span className="text-base font-semibold">{String(n).padStart(2, "0")}</span>
      <span className="text-[10px] opacity-80">{unit}</span>
    </span>
  );
}
