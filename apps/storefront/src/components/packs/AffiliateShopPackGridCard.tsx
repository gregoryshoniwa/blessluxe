"use client";

import Link from "next/link";
import { AffiliateShopPackCardCountdown } from "./AffiliateShopPackCardCountdown";

export type ShopPackGridItem = {
  pack_campaign_id: string;
  public_code: string;
  pack_title?: string | null;
  thumbnail_url?: string | null;
  paid_slots?: number;
  total_slots?: number;
  status?: string;
  gift_countdown_ends_at?: string | null;
  gift_blits_prize?: string | null;
  gift_blits_pool?: string | null;
  gift_allocation_type?: string | null;
  slots?: Array<{ size_label: string; status: string }>;
};

type Props = {
  pack: ShopPackGridItem;
  affiliateCode: string;
  toOptimizedImageUrl: (url: string) => string;
};

export function AffiliateShopPackGridCard({ pack, affiliateCode, toOptimizedImageUrl }: Props) {
  const href = `/affiliate/shop/${encodeURIComponent(affiliateCode)}/pack/${encodeURIComponent(pack.public_code)}`;
  const paid = Number(pack.paid_slots ?? 0);
  const total = Number(pack.total_slots ?? 0);
  const slots = pack.slots || [];
  const showGiftCountdown =
    Boolean(pack.gift_countdown_ends_at) &&
    (Number(pack.gift_blits_prize ?? 0) > 0 ||
      Number(pack.gift_blits_pool ?? 0) > 0 ||
      pack.gift_allocation_type === "custom_per_size");

  return (
    <article className="bg-white border border-theme-primary/20 rounded-xl overflow-hidden shadow-sm flex flex-col">
      <Link href={href} className="block w-full text-left">
        <div className="relative aspect-[3/4] bg-black/[0.03]">
          {pack.thumbnail_url ? (
            <img
              src={toOptimizedImageUrl(pack.thumbnail_url)}
              alt={pack.pack_title || "Group pack"}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#F5F0E8] to-[#E8D5D0]" />
          )}
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider bg-black/70 text-white">
            Group pack
          </span>
        </div>
      </Link>
      <div className="p-3 space-y-2 flex flex-col flex-1">
        <p className="text-sm font-medium line-clamp-2 min-h-10">{pack.pack_title || "Wholesale pack"}</p>
        <p className="text-xs text-black/60">
          {paid} / {total} paid ·{" "}
          <span className="capitalize">{String(pack.status || "").replace(/_/g, " ")}</span>
        </p>

        {showGiftCountdown && pack.gift_countdown_ends_at ? (
          <AffiliateShopPackCardCountdown endsAt={pack.gift_countdown_ends_at} />
        ) : null}

        {slots.length > 0 ? (
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.12em] text-black/45">Sizes</p>
            <div className="flex flex-wrap gap-1.5">
              {slots.map((slot, idx) => {
                const available = slot.status === "available";
                const label = (
                  <span
                    className={`inline-flex items-center justify-center px-2 py-1 rounded border text-[11px] min-w-[2rem] ${
                      available
                        ? "border-theme-primary text-theme-primary bg-white hover:bg-theme-primary/5"
                        : "border-black/10 bg-black/[0.06] text-black/35 cursor-not-allowed"
                    }`}
                    title={slot.status}
                  >
                    {slot.size_label}
                  </span>
                );
                return available ? (
                  <Link key={`${slot.size_label}-${idx}`} href={href} className="inline-flex">
                    {label}
                  </Link>
                ) : (
                  <span key={`${slot.size_label}-${idx}`} className="inline-flex">
                    {label}
                  </span>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex gap-2 pt-1 mt-auto">
          <Link
            href={href}
            className="flex-1 px-3 py-2 bg-theme-primary text-white rounded-md text-xs text-center font-medium"
          >
            View pack
          </Link>
        </div>
      </div>
    </article>
  );
}
