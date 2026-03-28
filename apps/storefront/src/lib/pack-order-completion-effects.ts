import type { applyPackOrderToSlot } from "@/lib/packs";
import { grantPackCompletionLoyaltyBonuses } from "@/lib/pack-loyalty";
import { notifyPackBuyerPickupCode, sendPackCampaignEmails } from "@/lib/pack-notifications";

type PackApplySuccess = Extract<Awaited<ReturnType<typeof applyPackOrderToSlot>>, { updated: true }>;

/**
 * Shared follow-up after `applyPackOrderToSlot` succeeds (webhook or storefront checkout sync).
 */
export function dispatchPackOrderCompletionEffects(input: {
  packCampaignId: string;
  orderId: string;
  storefrontCustomerId: string | null | undefined;
  packResult: PackApplySuccess;
}): void {
  const { packCampaignId, orderId, storefrontCustomerId, packResult } = input;
  const sf = String(storefrontCustomerId || "").trim();

  if (sf && packResult.collectionCode) {
    void notifyPackBuyerPickupCode({
      storefrontCustomerId: sf,
      collectionCode: packResult.collectionCode,
      sizeLabel: packResult.sizeLabel,
      orderId,
      campaignId: packCampaignId,
    }).catch((e) => console.warn("[pack completion] buyer pickup email:", e));
  }

  const slotDetail = packResult.collectionCode
    ? `Order ${orderId} — size ${packResult.sizeLabel} — buyer notified with collection code.`
    : `Order ${orderId}`;

  if (packResult.campaignComplete) {
    void grantPackCompletionLoyaltyBonuses(packCampaignId).catch((e) =>
      console.warn("[pack completion] loyalty:", e)
    );
    void sendPackCampaignEmails({
      campaignId: packCampaignId,
      kind: "pack_complete",
    }).catch((e) => console.warn("[pack completion] pack email:", e));
  } else {
    void sendPackCampaignEmails({
      campaignId: packCampaignId,
      kind: "slot_paid",
      detail: slotDetail,
    }).catch((e) => console.warn("[pack completion] pack email:", e));
  }
}
