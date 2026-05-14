"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock, Loader2 } from "lucide-react";
import { useCartStore } from "@/stores/cart";
import { useToast } from "@/providers";

export interface CampaignSlot {
  id: string;
  variant_id: string;
  size_label: string;
  status: string;
  customer_id: string | null;
  product_id: string;
  variant_title: string;
}

interface CampaignSlotListProps {
  campaignCode: string;
  campaignId: string;
  slots: CampaignSlot[];
}

/**
 * Claim flow:
 *   1. POST /api/pack-campaigns/<code>/slots/<id>/reserve  (atomic in backend)
 *   2. If 200 → add the variant to the cart with pack metadata so the order
 *      POST can flip the slot from reserved → paid once checkout completes.
 *   3. On 401 → toast prompting sign-in; on 409 → row updates to "Taken".
 */
export function CampaignSlotList({
  campaignCode,
  campaignId,
  slots: initialSlots,
}: CampaignSlotListProps) {
  const [slots, setSlots] = useState(initialSlots);
  const [busyId, setBusyId] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  const addMedusaVariant = useCartStore((s) => s.addMedusaVariant);
  const openCart = useCartStore((s) => s.openCart);

  const claim = async (slot: CampaignSlot) => {
    setBusyId(slot.id);
    try {
      const res = await fetch(
        `/api/pack-campaigns/by-code/${encodeURIComponent(campaignCode)}/slots/${slot.id}/reserve`,
        { method: "POST" }
      );
      const data = (await res.json()) as { slot?: CampaignSlot; error?: string };
      if (!res.ok || !data.slot) {
        if (res.status === 401) {
          toast.showToast({
            variant: "error",
            title: "Sign in first",
            message: "You need an account to claim a slot.",
          });
          return;
        }
        if (res.status === 409) {
          // Mark it taken locally so the UI catches up.
          setSlots((prev) =>
            prev.map((s) =>
              s.id === slot.id ? { ...s, status: "reserved" } : s
            )
          );
          toast.showToast({
            variant: "error",
            title: "Just taken",
            message: data.error || "Another customer claimed this slot.",
          });
          return;
        }
        toast.showToast({
          variant: "error",
          title: "Couldn’t claim",
          message: data.error || "Try again in a moment.",
        });
        return;
      }
      // Reserved successfully — add to cart with metadata so the order POST
      // can complete the slot when checkout finishes.
      await addMedusaVariant({
        variantId: slot.variant_id,
        quantity: 1,
        lineItemMetadata: {
          pack_campaign_id: campaignId,
          pack_campaign_code: campaignCode,
          pack_slot_id: slot.id,
          pack_size: slot.size_label,
        },
      });
      setSlots((prev) =>
        prev.map((s) =>
          s.id === slot.id ? { ...s, status: "reserved" } : s
        )
      );
      toast.showToast({
        variant: "success",
        title: "Slot held for 10 minutes",
        message: "Complete checkout to lock it in.",
      });
      openCart();
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ul className="divide-y divide-black/10">
      {slots.map((slot) => {
        const isClaimed = ["paid", "reserved", "fulfilled"].includes(slot.status);
        const busy = busyId === slot.id;
        return (
          <li key={slot.id} className="flex items-center gap-4 px-5 py-3">
            <span className="text-base font-semibold tracking-widest uppercase w-20">
              {slot.size_label}
            </span>
            <span className="flex-1 text-xs text-black/55">
              {isClaimed
                ? "Taken — another customer holds this slot"
                : "Available — first come, first served"}
            </span>
            {isClaimed ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-widest uppercase text-black/55">
                {slot.status === "paid" ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <Lock className="w-3 h-3" />
                )}
                {slot.status}
              </span>
            ) : (
              <button
                onClick={() => claim(slot)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 bg-gold text-white px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark transition-colors disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : null}
                {busy ? "Holding…" : "Claim"}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
