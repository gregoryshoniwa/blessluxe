import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import { dispatchPackOrderCompletionEffects } from "@/lib/pack-order-completion-effects";
import { applyPackOrderToSlot } from "@/lib/packs";

export const dynamic = "force-dynamic";

/**
 * Storefront checkout does not create Medusa orders or call the affiliate order webhook.
 * After payment, the client posts cart lines (with Medusa line metadata from pack "Buy this size")
 * so pack slots move to paid and emails fire — same as `/api/affiliate/webhook/order-completion`.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      orderId?: string;
      lines?: Array<{
        variant_id?: string;
        line_item_id?: string;
        metadata?: Record<string, unknown> | null;
        line_paid_usd?: number;
      }>;
    };

    const orderId = String(body.orderId || "").trim();
    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (!orderId || lines.length === 0) {
      return NextResponse.json({ ok: true, applied: 0, skipped: true });
    }

    const sessionCustomer = await getCurrentCustomer();
    const sessionStorefrontId = sessionCustomer?.id ? String(sessionCustomer.id) : "";

    let applied = 0;

    for (const row of lines) {
      const variantId = String(row.variant_id || "").trim();
      const lineItemId = String(row.line_item_id || "").trim();
      const meta = (row.metadata || {}) as Record<string, unknown>;
      const packCampaignId = String(meta.pack_campaign_id || "").trim();
      const packSlotId = String(meta.pack_slot_id || "").trim();
      const fromMeta = String(meta.storefront_customer_id || "").trim();
      const storefrontCustomerId = fromMeta || sessionStorefrontId || null;
      const rawUsd = row.line_paid_usd;
      const linePaidUsd =
        rawUsd != null && Number.isFinite(Number(rawUsd)) ? Math.max(0, Number(rawUsd)) : null;

      if (!packCampaignId || !packSlotId || !variantId || !lineItemId) {
        continue;
      }

      try {
        const packResult = await applyPackOrderToSlot({
          orderId,
          lineItemId,
          variantId,
          customerId: null,
          storefrontCustomerId,
          packCampaignId,
          packSlotId,
          linePaidUsd,
          paidAt: new Date(),
        });

        if (packResult.updated) {
          applied += 1;
          dispatchPackOrderCompletionEffects({
            packCampaignId,
            orderId,
            storefrontCustomerId,
            packResult,
          });
        }
      } catch (e) {
        console.warn("[after-checkout] pack slot update failed:", e);
      }
    }

    return NextResponse.json({ ok: true, applied });
  } catch (e) {
    console.error("[API /pack-campaigns/after-checkout]", e);
    return NextResponse.json({ error: "Sync failed." }, { status: 500 });
  }
}
