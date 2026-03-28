"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCartStore } from "@/stores/cart";
import { useToast } from "@/providers";
import type { PackCampaignRow, PackDefinitionRow, PackSlotRow } from "@/lib/packs";

type Props = {
  affiliateCode: string;
  publicCode: string;
};

type PackSlotView = PackSlotRow & { occupant_label?: string | null };

type PackPageData = {
  campaign: PackCampaignRow;
  definition: PackDefinitionRow | null;
  slots: PackSlotView[];
  my_slot_id?: string | null;
  my_slot_ids?: string[];
  loyalty_points?: number | null;
  loyalty_settings?: { max_loyalty_points: number; blits_per_loyalty_point: number } | null;
  product_thumbnail_url?: string | null;
  product_handle?: string | null;
};

function PackGiftCountdownBanner({
  endsAt,
  headline,
  subline,
  aside = false,
}: {
  endsAt: string;
  headline: string;
  subline: string;
  /** When true, sits beside the product image and grows to fill remaining column height. */
  aside?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const end = new Date(endsAt).getTime();
  const left = Math.max(0, end - now);
  if (Number.isNaN(end)) return null;
  if (left <= 0) {
    return (
      <div
        className={`border border-black/15 bg-black/[0.04] px-4 py-3 text-sm text-black/70 rounded-none ${aside ? "flex-1 flex items-center" : ""}`}
      >
        The early-bird Blits offer ({headline}) has ended. You can still complete checkout for this pack; no gift Blits
        apply after the deadline.
      </div>
    );
  }
  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  const unitClass =
    "flex flex-col items-center justify-center rounded-2xl bg-white/95 border-2 border-theme-primary/35 px-3 sm:px-5 py-3.5 sm:py-4 min-w-0 flex-1 sm:min-w-[4.75rem] sm:max-w-[7rem] shadow-md shadow-theme-primary/10";

  const shell =
    "flex flex-col border-2 border-theme-primary/50 bg-gradient-to-br from-amber-50/95 via-white to-amber-100/40 rounded-none px-3 py-4 sm:px-5 sm:py-5 " +
    (aside ? "flex-1 min-h-0 h-full" : "w-full");

  return (
    <div className={shell}>
      <p
        className={`text-xs sm:text-sm uppercase tracking-[0.2em] text-theme-primary font-semibold ${aside ? "text-left" : "text-center"}`}
      >
        Early-bird Blits
      </p>
      <p
        className={`font-display text-xl sm:text-2xl mt-2 text-black leading-snug ${aside ? "text-left" : "text-center"}`}
      >
        {headline}
      </p>
      <p
        className={`text-xs sm:text-sm text-black/65 mt-1 leading-relaxed ${aside ? "text-left max-w-none" : "text-center max-w-xl mx-auto"}`}
      >
        {subline}
      </p>

      <p
        className={`text-[10px] sm:text-xs font-medium text-theme-primary mt-4 uppercase tracking-widest ${aside ? "text-left" : "text-center"}`}
      >
        Time remaining
      </p>
      <div
        className={`flex flex-wrap sm:flex-nowrap gap-2 sm:gap-3 mt-2 ${aside ? "flex-1 items-stretch min-h-[7rem] sm:min-h-[8rem]" : "justify-center"}`}
      >
        {d > 0 ? (
          <div className={unitClass}>
            <span className="font-display text-3xl sm:text-4xl tabular-nums text-black leading-none">{d}</span>
            <span className="text-[10px] sm:text-xs uppercase tracking-[0.15em] text-black/45 mt-1">Days</span>
          </div>
        ) : null}
        <div className={unitClass}>
          <span className="font-display text-3xl sm:text-4xl tabular-nums text-black leading-none">{h}</span>
          <span className="text-[10px] sm:text-xs uppercase tracking-[0.15em] text-black/45 mt-1">Hours</span>
        </div>
        <div className={unitClass}>
          <span className="font-display text-3xl sm:text-4xl tabular-nums text-black leading-none">{m}</span>
          <span className="text-[10px] sm:text-xs uppercase tracking-[0.15em] text-black/45 mt-1">Minutes</span>
        </div>
        <div
          className={`${unitClass} transition-transform duration-300 ${left < 60_000 ? "animate-pulse ring-2 ring-theme-primary/50 border-theme-primary/50" : ""}`}
          key={sec}
        >
          <span className="font-display text-3xl sm:text-4xl tabular-nums text-theme-primary leading-none">{sec}</span>
          <span className="text-[10px] sm:text-xs uppercase tracking-[0.15em] text-black/45 mt-1">Seconds</span>
        </div>
      </div>

      <p
        className={`text-[10px] sm:text-xs text-black/50 mt-4 leading-relaxed ${aside ? "text-left mt-auto pt-2" : "text-center mt-6 max-w-lg mx-auto"}`}
      >
        Pay on or before the deadline. The store records the official payment time at checkout—this countdown is for
        visibility only.
      </p>
    </div>
  );
}

export function AffiliatePackCampaignClient({ affiliateCode, publicCode }: Props) {
  const { showToast } = useToast();
  const addMedusaVariant = useCartStore((s) => s.addMedusaVariant);
  const openCart = useCartStore((s) => s.openCart);

  const [storefrontCustomerId, setStorefrontCustomerId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/account/me", { cache: "no-store" });
        const j = (await res.json()) as { customer?: { id?: string } };
        setStorefrontCustomerId(j.customer?.id ? String(j.customer.id) : null);
      } catch {
        setStorefrontCustomerId(null);
      }
    })();
  }, []);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PackPageData | null>(null);
  const [err, setErr] = useState("");
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [reserveBusyId, setReserveBusyId] = useState<string | null>(null);

  const load = useCallback(async (soft?: boolean) => {
    if (!soft) setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/pack-campaigns/by-code/${encodeURIComponent(publicCode)}`, {
        cache: "no-store",
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(String(j.error || "Not found."));
        setData(null);
        return;
      }
      const ids = Array.isArray(j.my_slot_ids) ? (j.my_slot_ids as string[]) : [];
      setData({
        campaign: j.campaign,
        definition: j.definition,
        slots: (j.slots || []) as PackSlotView[],
        my_slot_id: j.my_slot_id ?? null,
        my_slot_ids: ids.length ? ids : j.my_slot_id ? [String(j.my_slot_id)] : [],
        loyalty_points: j.loyalty_points ?? null,
        loyalty_settings: j.loyalty_settings ?? null,
        product_thumbnail_url: j.product_thumbnail_url ?? null,
        product_handle: j.product_handle ?? null,
      });
    } catch {
      setErr("Failed to load pack.");
      setData(null);
    } finally {
      if (!soft) setLoading(false);
    }
  }, [publicCode]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const paidCount = data?.slots.filter((s) => s.status === "paid").length ?? 0;
  const total = data?.slots.length ?? 0;
  const pct = total ? Math.round((paidCount / total) * 100) : 0;

  const onBuySize = async (slot: PackSlotView) => {
    if (slot.status !== "available") {
      showToast({ title: "Unavailable", message: "This size is already taken.", variant: "error" });
      return;
    }
    try {
      await addMedusaVariant({
        variantId: slot.variant_id,
        quantity: 1,
        affiliateCode,
        lineItemMetadata: {
          pack_campaign_id: data?.campaign.id,
          pack_slot_id: slot.id,
          affiliate_attribution: "affiliate_shop",
          ...(storefrontCustomerId ? { storefront_customer_id: storefrontCustomerId } : {}),
        },
      });
      openCart();
      showToast({
        title: "Added to cart",
        message: "Complete checkout on BLESSLUXE to pay for this size.",
        variant: "success",
      });
    } catch (e) {
      showToast({
        title: "Could not add",
        message: e instanceof Error ? e.message : "Try again.",
        variant: "error",
      });
    }
  };

  /** Checkout for a slot you already reserved (same cart line metadata as Buy). */
  const onPayReservedSize = async (slot: PackSlotView) => {
    if (slot.status !== "reserved" || !data?.campaign?.id) return;
    try {
      await addMedusaVariant({
        variantId: slot.variant_id,
        quantity: 1,
        affiliateCode,
        lineItemMetadata: {
          pack_campaign_id: data.campaign.id,
          pack_slot_id: slot.id,
          affiliate_attribution: "affiliate_shop",
          ...(storefrontCustomerId ? { storefront_customer_id: storefrontCustomerId } : {}),
        },
      });
      openCart();
      showToast({
        title: "Added to cart",
        message: "Complete checkout to pay for this reserved size.",
        variant: "success",
      });
    } catch (e) {
      showToast({
        title: "Could not add",
        message: e instanceof Error ? e.message : "Try again.",
        variant: "error",
      });
    }
  };

  const onReserveSize = async (slot: PackSlotView) => {
    if (!data?.campaign?.id) return;
    if (slot.status !== "available") {
      showToast({ title: "Unavailable", message: "This size is already taken.", variant: "error" });
      return;
    }
    if (!storefrontCustomerId) {
      showToast({
        title: "Sign in required",
        message: "Sign in to reserve a size and pay when the pack is closer to complete.",
        variant: "error",
      });
      return;
    }
    setReserveBusyId(slot.id);
    try {
      const res = await fetch(`/api/pack-campaigns/${encodeURIComponent(data.campaign.id)}/reserve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slot_id: slot.id, mode: "pay_when_complete" }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast({ title: "Could not reserve", message: j.error || "Try again.", variant: "error" });
        return;
      }
      showToast({
        title: "Size reserved",
        message: "Use Pay under “Your sizes in this pack” when you’re ready to check out.",
        variant: "success",
      });
      await load(true);
    } catch {
      showToast({ title: "Error", message: "Reserve failed.", variant: "error" });
    } finally {
      setReserveBusyId(null);
    }
  };

  const onLeavePack = async (slotId: string) => {
    if (!data?.campaign?.id || !slotId) return;
    const ok = window.confirm(
      "Leave this pack? Reserved slots are released. If you already paid, your Blits wallet is credited automatically " +
        "(same value as when a host cancels a pack), and loyalty rules may still apply—see your account."
    );
    if (!ok) return;
    setLeaveBusy(true);
    try {
      const res = await fetch(
        `/api/pack-campaigns/${encodeURIComponent(data.campaign.id)}/slots/${encodeURIComponent(slotId)}/leave`,
        { method: "POST" }
      );
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast({ title: "Could not leave", message: j.error || "Try again.", variant: "error" });
        return;
      }
      showToast({ title: "Left pack", message: "Other participants were notified by email.", variant: "success" });
      await load(true);
    } catch {
      showToast({ title: "Error", message: "Could not leave pack.", variant: "error" });
    } finally {
      setLeaveBusy(false);
    }
  };

  if (loading) {
    return <div className="text-center text-black/60 py-12">Loading pack…</div>;
  }
  if (err || !data?.campaign) {
    return (
      <div className="py-12 text-center">
        <p className="text-red-600">{err || "Pack not found."}</p>
        <Link href={`/affiliate/shop/${encodeURIComponent(affiliateCode)}`} className="mt-4 inline-block text-theme-primary">
          Back to shop
        </Link>
      </div>
    );
  }

  const { campaign, definition, slots } = data;
  const productThumb = data.product_thumbnail_url;
  const productHandle = data.product_handle;
  const loyaltyPoints = data.loyalty_points;
  const maxL = data.loyalty_settings?.max_loyalty_points ?? 200;
  const bpl = data.loyalty_settings?.blits_per_loyalty_point ?? 1;
  const closedHost =
    campaign.status === "cancelled" ||
    campaign.status === "rejected" ||
    campaign.status === "fulfilled";
  const myIds = data.my_slot_ids?.length ? data.my_slot_ids : data.my_slot_id ? [data.my_slot_id] : [];
  const mySlots = myIds.map((id) => slots.find((s) => s.id === id)).filter(Boolean) as PackSlotRow[];
  const showLeave = Boolean(myIds.length > 0 && storefrontCustomerId && !closedHost);

  const showGiftCountdown =
    Boolean(campaign.gift_countdown_ends_at) &&
    (Number(campaign.gift_blits_prize ?? 0) > 0 ||
      Number(campaign.gift_blits_pool ?? 0) > 0 ||
      campaign.gift_allocation_type === "custom_per_size");

  const giftHeadline =
    campaign.gift_allocation_type === "equal_pool" || campaign.gift_allocation_type === "fcfs_pool"
      ? `${Number(campaign.gift_blits_pool ?? 0).toLocaleString()} Blits total pool`
      : campaign.gift_allocation_type === "custom_per_size"
        ? "Custom Blits per size (see host)"
        : `${Number(campaign.gift_blits_prize ?? 0).toLocaleString()} Blits per qualifying payment`;

  const giftSubline =
    campaign.gift_allocation_type === "equal_pool"
      ? "Pool is split evenly among qualifying payments after the deadline."
      : campaign.gift_allocation_type === "fcfs_pool"
        ? "Earlier payers get a larger share of the pool (by pack size), settled after the deadline."
        : campaign.gift_allocation_type === "custom_per_size"
          ? "Amount depends on variant; see campaign settings."
          : "Fixed Blits per paid size when you check out before the deadline.";

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-black/50">Group pack</p>
          <h1 className="font-display text-3xl mt-1">{definition?.title || "Pack"}</h1>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-stretch">
          <div className="flex-1 min-w-0 rounded-none border border-theme-primary/50 bg-white/80 px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm">
              <span className="font-semibold text-black/85">Progress</span>
              <span className="hidden sm:inline text-black/25" aria-hidden>
                ·
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-[0.15em] text-black/40">Status</span>
                <span className="rounded-none border border-black/15 bg-black/[0.05] px-2 py-0.5 text-[11px] sm:text-xs font-medium capitalize text-black/90">
                  {campaign.status.replace(/_/g, " ")}
                </span>
              </span>
              <span className="font-semibold tabular-nums text-black/90 sm:ml-auto">
                {paidCount} / {total} paid
              </span>
            </div>
            <div className="h-1.5 mt-2 rounded-none bg-black/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-theme-primary to-amber-600 transition-all duration-500 rounded-none"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-[10px] sm:text-[11px] text-black/45 mt-1.5 leading-snug">
              When every size is paid, the pack moves to processing. Payments use your normal checkout.
            </p>
            {campaign.status !== "cancelled" && campaign.status !== "rejected" ? (
              <p className="text-[10px] sm:text-[11px] text-black/55 mt-2 pt-2 border-t border-black/10 leading-relaxed">
                <span className="font-semibold text-black/75">How your size counts:</span>{" "}
                <strong className="font-medium">Buy</strong> checks out now; <strong className="font-medium">Reserve</strong>{" "}
                holds your slot (sign in). Only completed payment marks a slot paid—confirmation emails send after payment.
              </p>
            ) : null}
          </div>

          {loyaltyPoints != null ? (
            <div className="shrink-0 sm:w-[10.5rem] rounded-none border border-theme-primary/50 bg-white/90 px-3 py-2.5 flex flex-col justify-center">
              <p className="text-[10px] uppercase tracking-[0.18em] text-black/45">Pack loyalty</p>
              <p className="font-display text-2xl text-theme-primary leading-none mt-1">{loyaltyPoints}</p>
              <p className="text-[10px] text-black/40 mt-0.5">
                max {maxL} pts · {bpl} Blits/pt
              </p>
              <Link
                href="/account?tab=packs"
                className="text-[10px] font-medium text-theme-primary underline mt-1.5 w-fit"
              >
                Redeem in account
              </Link>
            </div>
          ) : null}
        </div>
      </div>

      {productThumb ? (
        <div className="grid gap-6 sm:grid-cols-[minmax(0,280px)_1fr] sm:items-stretch">
          <div className="relative mx-auto w-full max-w-[280px] sm:mx-0 aspect-[3/4] overflow-hidden rounded-2xl border border-black/10 bg-black/[0.04] shadow-sm">
            <Image
              src={productThumb}
              alt={definition?.title || "Pack product"}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 280px"
              priority
            />
          </div>
            <div className="flex flex-col gap-4 min-w-0 min-h-0">
            <div className="space-y-2 text-sm text-black/65 shrink-0">
              <p className="font-display text-lg text-black">You&apos;re buying into this wholesale pack</p>
              <p>
                One size per participant. Pay now with <strong className="text-black/85">Buy</strong>, or{" "}
                <strong className="text-black/85">Reserve</strong> to hold your size while you decide (sign in required).
              </p>
              {productHandle ? (
                <Link
                  href={`/shop/${encodeURIComponent(productHandle)}`}
                  className="inline-block text-sm font-medium text-theme-primary hover:underline mt-1"
                >
                  View full product details →
                </Link>
              ) : null}
            </div>
            {showGiftCountdown && campaign.gift_countdown_ends_at ? (
              <div className="flex-1 flex flex-col min-h-[12rem] sm:min-h-0">
                <PackGiftCountdownBanner
                  aside
                  endsAt={campaign.gift_countdown_ends_at}
                  headline={giftHeadline}
                  subline={giftSubline}
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : showGiftCountdown && campaign.gift_countdown_ends_at ? (
        <PackGiftCountdownBanner
          endsAt={campaign.gift_countdown_ends_at}
          headline={giftHeadline}
          subline={giftSubline}
        />
      ) : null}

      {campaign.status === "cancelled" || campaign.status === "rejected" ? (
        <div className="rounded-none border border-red-200/90 bg-red-50/90 px-5 py-4 text-sm text-red-950">
          <p className="font-medium">This pack was {campaign.status.replace(/_/g, " ")}</p>
          <p className="mt-2 text-red-900/90">
            Participants were notified by email. Loyalty points were not penalized for this closure. If you paid for a
            size, check your Blits balance—value may have been credited there when we had a line total on file.
          </p>
        </div>
      ) : null}

      {showLeave ? (
        <div className="rounded-none border border-amber-200/80 bg-amber-50/80 px-4 py-3 space-y-3">
          <p className="text-sm text-black/75">
            Your sizes in this pack. You can buy more than one size; each has its own pickup code after payment. For a{" "}
            <strong className="font-medium text-black/85">reserved</strong> size, use <strong className="font-medium text-black/85">Pay</strong>{" "}
            to open your cart and complete checkout. Leaving applies a loyalty penalty per slot. If you already paid and
            leave, your Blits balance is credited automatically (no separate refund request).
          </p>
          <ul className="space-y-2">
            {mySlots.map((ms) => (
              <li
                key={ms.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-none border border-amber-200/60 bg-white/80 px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium">{ms.size_label}</span>
                  <span className="ml-2 text-black/50 capitalize">{ms.status}</span>
                  {ms.collection_code ? (
                    <p className="text-xs text-black/60 mt-1 font-mono">
                      Collection: {ms.collection_code}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0 justify-end">
                  {ms.status === "reserved" ? (
                    <button
                      type="button"
                      onClick={() => void onPayReservedSize(ms)}
                      className="rounded-none bg-black text-white text-xs font-semibold uppercase tracking-[0.08em] px-3 py-1.5 hover:bg-black/85 min-w-[4rem]"
                    >
                      Pay
                    </button>
                  ) : null}
                  {ms.status === "reserved" || ms.status === "paid" ? (
                    <button
                      type="button"
                      onClick={() => void onLeavePack(ms.id)}
                      disabled={leaveBusy}
                      className="shrink-0 rounded-none border border-red-200 bg-white px-3 py-1.5 text-xs text-red-800 hover:bg-red-50 disabled:opacity-60"
                    >
                      {leaveBusy ? "…" : "Leave this size"}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <h2 className="font-display text-xl mb-3">Sizes</h2>
        <ul className="space-y-2">
          {slots.map((slot) => (
            <li
              key={slot.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-none border border-black/10 px-4 py-3 bg-white/60"
            >
              <div className="min-w-0">
                <span className="font-medium">{slot.size_label}</span>
                <span className="ml-2 text-sm text-black/50 capitalize">{slot.status}</span>
                {slot.status !== "available" && slot.occupant_label ? (
                  <p className="text-sm text-black/70 mt-1 truncate" title={slot.occupant_label}>
                    {slot.occupant_label}
                  </p>
                ) : null}
              </div>
              {slot.status === "available" ? (
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void onBuySize(slot)}
                    className="rounded-none bg-black text-white text-sm px-4 py-2 hover:bg-black/85 min-w-[4.5rem]"
                  >
                    Buy
                  </button>
                  <button
                    type="button"
                    onClick={() => void onReserveSize(slot)}
                    disabled={reserveBusyId === slot.id}
                    className="rounded-none border-2 border-theme-primary text-theme-primary text-sm px-4 py-2 hover:bg-theme-primary/5 disabled:opacity-60 min-w-[5rem]"
                  >
                    {reserveBusyId === slot.id ? "…" : "Reserve"}
                  </button>
                </div>
              ) : (
                <span className="text-xs uppercase tracking-wider text-black/35 shrink-0">Locked</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <Link
        href={`/affiliate/shop/${encodeURIComponent(affiliateCode)}`}
        className="inline-block text-sm text-theme-primary hover:underline"
      >
        ← Back to {affiliateCode}
      </Link>
    </div>
  );
}
