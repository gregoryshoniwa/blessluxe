import { randomBytes } from "crypto";
import { adjustCustomerBlitsWithClient, ensureBlitsSchema, getPlatformBlitsSettings } from "@/lib/blits";
import { withTransaction } from "@/lib/db";
import { sendPackCampaignEmails } from "@/lib/pack-notifications";
import { getCampaignById, type PackCampaignRow, type PackSlotRow } from "@/lib/packs";

function packEventId() {
  return `pev_${randomBytes(12).toString("hex")}`;
}

/**
 * Host or admin closes the pack: no loyalty leave penalties; paid slots get Blits credit from stored line USD × platform rate.
 */
export async function closePackCampaign(input: {
  campaignId: string;
  reason: "cancelled" | "rejected";
  closedBy: "affiliate" | "admin";
}): Promise<{ refundedSlots: number; totalBlitsCredited: string }> {
  await ensureBlitsSchema();
  const settings = await getPlatformBlitsSettings();
  const usdToBlits = settings ? Number(settings.usd_to_blits_per_dollar) : 100;

  const out = await withTransaction(async (client) => {
    const cRes = await client.query(
      `SELECT * FROM pack_campaign WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [input.campaignId]
    );
    const camp = cRes.rows[0] as PackCampaignRow | undefined;
    if (!camp) throw new Error("Campaign not found.");
    if (["cancelled", "rejected", "fulfilled"].includes(camp.status)) {
      throw new Error("Campaign is already closed or fulfilled.");
    }

    const prevMeta =
      camp.metadata && typeof camp.metadata === "object" && !Array.isArray(camp.metadata)
        ? (camp.metadata as Record<string, unknown>)
        : {};
    const nextMeta = {
      ...prevMeta,
      closed_at: new Date().toISOString(),
      closed_by: input.closedBy,
      close_reason: input.reason,
      no_loyalty_penalty: true,
    };

    await client.query(
      `UPDATE pack_campaign SET status = $2, metadata = $3::jsonb, updated_at = NOW() WHERE id = $1`,
      [input.campaignId, input.reason, JSON.stringify(nextMeta)]
    );

    const slotsRes = await client.query(
      `SELECT * FROM pack_slot WHERE pack_campaign_id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [input.campaignId]
    );
    const slots = slotsRes.rows as PackSlotRow[];

    let refundedSlots = 0;
    let totalBlits = BigInt(0);

    for (const slot of slots) {
      if (slot.status === "reserved") {
        await client.query(
          `UPDATE pack_slot SET status = 'available', customer_id = NULL, reserved_until = NULL, commitment = 'none',
           metadata = NULL, updated_at = NOW() WHERE id = $1`,
          [slot.id]
        );
      } else if (slot.status === "paid") {
        const meta =
          slot.metadata && typeof slot.metadata === "object" && !Array.isArray(slot.metadata)
            ? (slot.metadata as Record<string, unknown>)
            : {};
        const lineUsd = Number(meta.line_paid_usd ?? 0);
        const sf =
          typeof meta.storefront_customer_id === "string" ? meta.storefront_customer_id.trim() : "";
        const storefrontId =
          sf && !sf.startsWith("cus_")
            ? sf
            : slot.customer_id && !String(slot.customer_id).startsWith("cus_")
              ? String(slot.customer_id)
              : null;

        let blits = BigInt(0);
        if (storefrontId && lineUsd > 0 && Number.isFinite(lineUsd)) {
          blits = BigInt(Math.max(0, Math.round(lineUsd * usdToBlits)));
          if (blits > BigInt(0)) {
            await adjustCustomerBlitsWithClient(client, storefrontId, blits, "pack_campaign_closed_refund", {
              pack_campaign_id: input.campaignId,
              slot_id: slot.id,
              close_reason: input.reason,
              line_paid_usd: lineUsd,
            });
            refundedSlots += 1;
            totalBlits += blits;
          }
        }

        const nextSlotMeta = {
          ...meta,
          refunded_at: new Date().toISOString(),
          refund_blits_credited: blits.toString(),
          campaign_closed: true,
          close_reason: input.reason,
        };
        await client.query(
          `UPDATE pack_slot SET status = 'refunded', metadata = $2::jsonb, updated_at = NOW() WHERE id = $1`,
          [slot.id, JSON.stringify(nextSlotMeta)]
        );
      }
    }

    await client.query(
      `INSERT INTO pack_event (id, pack_campaign_id, event_type, message, payload, created_at, updated_at)
       VALUES ($1, $2, 'campaign_closed', $3, $4::jsonb, NOW(), NOW())`,
      [
        packEventId(),
        input.campaignId,
        `Campaign ${input.reason} by ${input.closedBy}`,
        JSON.stringify({ reason: input.reason, closed_by: input.closedBy, refunded_slots: refundedSlots }),
      ]
    );

    return { refundedSlots, totalBlits };
  });

  const kind = input.reason === "rejected" ? "pack_closed_rejected" : "pack_closed_cancelled";
  const detail = `Closed by ${input.closedBy}. ${out.refundedSlots} paid slot(s) received Blits credit where a line total was recorded.`;

  void sendPackCampaignEmails({
    campaignId: input.campaignId,
    kind,
    detail,
  }).catch((e) => console.warn("[closePackCampaign] email:", e));

  return {
    refundedSlots: out.refundedSlots,
    totalBlitsCredited: out.totalBlits.toString(),
  };
}

export async function assertAffiliateOwnsCampaign(affiliateId: string, campaignId: string) {
  const c = await getCampaignById(campaignId);
  if (!c) throw new Error("Campaign not found.");
  if (c.affiliate_id !== affiliateId) throw new Error("Forbidden.");
  return c;
}
