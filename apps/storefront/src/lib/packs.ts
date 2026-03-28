import { randomBytes } from "crypto";
import type { PoolClient } from "pg";
import { adjustCustomerBlitsWithClient, ensureBlitsSchema, getPlatformBlitsSettings } from "@/lib/blits";
import { generatePackCollectionCode, settlePackPoolGifts, type GiftAllocationType } from "@/lib/pack-gift-settlement";
import { execute, query, queryOne, withTransaction } from "@/lib/db";

export type { GiftAllocationType };

export type PackDefinitionRow = {
  id: string;
  product_id: string;
  title: string;
  handle: string;
  description: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type PackCampaignRow = {
  id: string;
  pack_definition_id: string;
  affiliate_id: string;
  public_code: string;
  status: string;
  expires_at: string | null;
  gift_countdown_ends_at: string | null;
  gift_blits_prize: number | null;
  gift_allocation_type?: string;
  gift_blits_pool?: number | null;
  gift_custom_per_size?: Record<string, number> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type PackSlotRow = {
  id: string;
  pack_campaign_id: string;
  variant_id: string;
  size_label: string;
  status: string;
  customer_id: string | null;
  order_id: string | null;
  line_item_id: string | null;
  reserved_until: string | null;
  commitment: string;
  collection_code: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type PackEventRow = {
  id: string;
  pack_campaign_id: string;
  event_type: string;
  message: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

function genId(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function genPublicCode() {
  return randomBytes(5).toString("hex");
}

export async function listPublishedPackDefinitions(): Promise<PackDefinitionRow[]> {
  return query<PackDefinitionRow>(
    `SELECT id, product_id, title, handle, description, status, metadata, created_at, updated_at
     FROM pack_definition
     WHERE deleted_at IS NULL AND status = 'published'
     ORDER BY created_at DESC`
  );
}

export async function getPackDefinitionByHandle(handle: string): Promise<PackDefinitionRow | null> {
  return queryOne<PackDefinitionRow>(
    `SELECT id, product_id, title, handle, description, status, metadata, created_at, updated_at
     FROM pack_definition
     WHERE deleted_at IS NULL AND handle = $1`,
    [handle]
  );
}

export async function getPackDefinitionById(id: string): Promise<PackDefinitionRow | null> {
  return queryOne<PackDefinitionRow>(
    `SELECT id, product_id, title, handle, description, status, metadata, created_at, updated_at
     FROM pack_definition
     WHERE deleted_at IS NULL AND id = $1`,
    [id]
  );
}

/** Public lookup for pickup / fulfillment (code is unique per paid slot). */
export async function getPackSlotByCollectionCode(collectionCode: string): Promise<
  | (PackSlotRow & {
      pack_title: string;
      campaign_public_code: string;
      affiliate_code: string | null;
      campaign_status: string;
      product_id: string | null;
    })
  | null
> {
  const code = String(collectionCode || "").trim();
  if (!code) return null;
  return queryOne<
    PackSlotRow & {
      pack_title: string;
      campaign_public_code: string;
      affiliate_code: string | null;
      campaign_status: string;
      product_id: string | null;
    }
  >(
    `SELECT s.id, s.pack_campaign_id, s.variant_id, s.size_label, s.status, s.customer_id, s.order_id, s.line_item_id,
            s.reserved_until, s.commitment, s.collection_code, s.metadata, s.created_at, s.updated_at,
            d.title AS pack_title, d.product_id AS product_id, c.public_code AS campaign_public_code, c.status AS campaign_status,
            a.code AS affiliate_code
     FROM pack_slot s
     JOIN pack_campaign c ON c.id = s.pack_campaign_id AND c.deleted_at IS NULL
     JOIN pack_definition d ON d.id = c.pack_definition_id AND d.deleted_at IS NULL
     LEFT JOIN affiliate a ON a.id = c.affiliate_id
     WHERE s.deleted_at IS NULL AND s.collection_code = $1`,
    [code]
  );
}

export async function getPackDefinitionByProductId(productId: string): Promise<PackDefinitionRow | null> {
  return queryOne<PackDefinitionRow>(
    `SELECT id, product_id, title, handle, description, status, metadata, created_at, updated_at
     FROM pack_definition
     WHERE deleted_at IS NULL AND product_id = $1 AND status = 'published'`,
    [productId]
  );
}

export async function getCampaignByPublicCode(code: string): Promise<PackCampaignRow | null> {
  return queryOne<PackCampaignRow>(
    `SELECT id, pack_definition_id, affiliate_id, public_code, status, expires_at,
            gift_countdown_ends_at, gift_blits_prize, gift_allocation_type, gift_blits_pool, gift_custom_per_size,
            metadata, created_at, updated_at
     FROM pack_campaign
     WHERE deleted_at IS NULL AND public_code = $1`,
    [code]
  );
}

export async function getCampaignById(id: string): Promise<PackCampaignRow | null> {
  return queryOne<PackCampaignRow>(
    `SELECT id, pack_definition_id, affiliate_id, public_code, status, expires_at,
            gift_countdown_ends_at, gift_blits_prize, gift_allocation_type, gift_blits_pool, gift_custom_per_size,
            metadata, created_at, updated_at
     FROM pack_campaign
     WHERE deleted_at IS NULL AND id = $1`,
    [id]
  );
}

export async function listSlotsForCampaign(campaignId: string): Promise<PackSlotRow[]> {
  return query<PackSlotRow>(
    `SELECT id, pack_campaign_id, variant_id, size_label, status, customer_id, order_id, line_item_id,
            reserved_until, commitment, collection_code, metadata, created_at, updated_at
     FROM pack_slot
     WHERE deleted_at IS NULL AND pack_campaign_id = $1
     ORDER BY size_label`,
    [campaignId]
  );
}

export async function listEventsForCampaign(campaignId: string, limit = 50): Promise<PackEventRow[]> {
  return query<PackEventRow>(
    `SELECT id, pack_campaign_id, event_type, message, payload, created_at
     FROM pack_event
     WHERE deleted_at IS NULL AND pack_campaign_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [campaignId, limit]
  );
}

export async function insertPackEvent(input: {
  campaignId: string;
  eventType: string;
  message?: string;
  payload?: Record<string, unknown>;
}) {
  const id = genId("pev");
  await execute(
    `INSERT INTO pack_event (id, pack_campaign_id, event_type, message, payload, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, NOW(), NOW())`,
    [id, input.campaignId, input.eventType, input.message ?? null, JSON.stringify(input.payload ?? {})]
  );
}

/** Create campaign + one slot per variant row (from Medusa product payload). */
export async function createPackCampaignWithSlots(input: {
  packDefinitionId: string;
  affiliateId: string;
  variantRows: Array<{ variant_id: string; size_label: string }>;
  expiresAt?: Date | null;
}): Promise<{ campaign: PackCampaignRow; slots: PackSlotRow[] }> {
  const def = await getPackDefinitionById(input.packDefinitionId);
  if (!def || def.status !== "published") {
    throw new Error("Pack not found or not published.");
  }

  return withTransaction(async (client) => {
    const campaignId = genId("pcamp");
    const publicCode = genPublicCode();
    await client.query(
      `INSERT INTO pack_campaign (id, pack_definition_id, affiliate_id, public_code, status, expires_at,
         gift_countdown_ends_at, gift_blits_prize, gift_allocation_type, gift_blits_pool, gift_custom_per_size, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'open', $5, NULL, NULL, 'fixed_per_payment', NULL, NULL, NULL, NOW(), NOW())`,
      [campaignId, input.packDefinitionId, input.affiliateId, publicCode, input.expiresAt ?? null]
    );

    const slots: PackSlotRow[] = [];
    for (const row of input.variantRows) {
      const sid = genId("pslot");
      await client.query(
        `INSERT INTO pack_slot (id, pack_campaign_id, variant_id, size_label, status, customer_id, order_id, line_item_id,
          reserved_until, commitment, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'available', NULL, NULL, NULL, NULL, 'none', NULL, NOW(), NOW())`,
        [sid, campaignId, row.variant_id, row.size_label]
      );
      slots.push({
        id: sid,
        pack_campaign_id: campaignId,
        variant_id: row.variant_id,
        size_label: row.size_label,
        status: "available",
        customer_id: null,
        order_id: null,
        line_item_id: null,
        reserved_until: null,
        commitment: "none",
        collection_code: null,
        metadata: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    await client.query(
      `INSERT INTO pack_event (id, pack_campaign_id, event_type, message, payload, created_at, updated_at)
       VALUES ($1, $2, 'campaign_created', $3, $4::jsonb, NOW(), NOW())`,
      [
        genId("pev"),
        campaignId,
        "Pack campaign opened",
        JSON.stringify({ affiliate_id: input.affiliateId, slots: slots.length }),
      ]
    );

    // Must read via the same transaction client — `queryOne` uses the pool and cannot see uncommitted rows.
    const campaignRes = await client.query<PackCampaignRow>(
      `SELECT id, pack_definition_id, affiliate_id, public_code, status, expires_at,
              gift_countdown_ends_at, gift_blits_prize, gift_allocation_type, gift_blits_pool, gift_custom_per_size,
              metadata, created_at, updated_at
       FROM pack_campaign WHERE id = $1`,
      [campaignId]
    );
    const campaign = campaignRes.rows[0];
    if (!campaign) throw new Error("Campaign insert failed.");
    return { campaign, slots };
  });
}

export type ReserveMode = "pay_now" | "pay_when_complete";

export async function reservePackSlot(input: {
  campaignId: string;
  slotId: string;
  customerId: string;
  mode: ReserveMode;
  reserveHours?: number;
}) {
  const hours = input.reserveHours ?? 48;
  const until = new Date(Date.now() + hours * 3600 * 1000);

  return withTransaction(async (client) => {
    const slot = await client.query<PackSlotRow>(
      `SELECT * FROM pack_slot WHERE id = $1 AND pack_campaign_id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [input.slotId, input.campaignId]
    );
    const row = slot.rows[0] as PackSlotRow | undefined;
    if (!row || row.status !== "available") {
      throw new Error("This size is no longer available.");
    }

    await client.query(
      `UPDATE pack_slot SET status = 'reserved', customer_id = $2, reserved_until = $3,
         commitment = $4, updated_at = NOW()
       WHERE id = $1`,
      [input.slotId, input.customerId, until.toISOString(), input.mode === "pay_now" ? "pay_now" : "pay_when_complete"]
    );

    await client.query(
      `INSERT INTO pack_event (id, pack_campaign_id, event_type, message, payload, created_at, updated_at)
       VALUES ($1, $2, 'slot_reserved', $3, $4::jsonb, NOW(), NOW())`,
      [
        genId("pev"),
        input.campaignId,
        `Size reserved (${input.mode})`,
        JSON.stringify({ slot_id: input.slotId, customer_id: input.customerId }),
      ]
    );

    await client.query(
      `UPDATE pack_campaign SET status = CASE WHEN status = 'open' THEN 'filling' ELSE status END, updated_at = NOW()
       WHERE id = $1`,
      [input.campaignId]
    );
  });
}

/** Called when checkout completes: mark slot paid and maybe complete campaign. */
export async function applyPackOrderToSlot(input: {
  orderId: string;
  lineItemId: string;
  variantId: string;
  /** Medusa customer id when present; guest checkouts may omit. */
  customerId?: string | null;
  /** Storefront `customer_account.id` from cart line metadata (for "My packs"). */
  storefrontCustomerId?: string | null;
  packCampaignId?: string | null;
  packSlotId?: string | null;
  /** Line subtotal in major units (e.g. USD) for Blits refunds when host cancels. */
  linePaidUsd?: number | null;
  /** Order payment / confirmation time (UTC). Server decides gift eligibility; defaults to now. */
  paidAt?: string | Date | null;
}) {
  if (!input.packCampaignId || !input.packSlotId) return { updated: false as const };
  const packCampaignId = input.packCampaignId;

  await ensureBlitsSchema();

  const medusaId = input.customerId?.trim() ? input.customerId.trim() : null;
  const storefrontId = input.storefrontCustomerId?.trim() ? input.storefrontCustomerId.trim() : null;
  const lineUsd =
    input.linePaidUsd != null && Number.isFinite(Number(input.linePaidUsd))
      ? Math.max(0, Number(input.linePaidUsd))
      : null;

  const paidAtRaw = input.paidAt;
  const paidAtDate =
    paidAtRaw instanceof Date
      ? paidAtRaw
      : paidAtRaw != null && String(paidAtRaw).trim()
        ? new Date(String(paidAtRaw))
        : new Date();
  const paymentInstant = !Number.isNaN(paidAtDate.getTime()) ? paidAtDate : new Date();

  return withTransaction(async (client) => {
    const campRow = await client.query<{
      status: string;
      gift_countdown_ends_at: string | null;
      gift_blits_prize: string | number | null;
      gift_allocation_type: string | null;
      gift_blits_pool: string | number | null;
      gift_custom_per_size: Record<string, number> | unknown | null;
    }>(
      `SELECT status, gift_countdown_ends_at, gift_blits_prize, gift_allocation_type, gift_blits_pool, gift_custom_per_size
       FROM pack_campaign WHERE id = $1 AND deleted_at IS NULL`,
      [packCampaignId]
    );
    const camp = campRow.rows[0];
    const campStatus = camp?.status;
    if (campStatus === "cancelled" || campStatus === "rejected" || campStatus === "fulfilled") {
      return { updated: false as const };
    }

    const slot = await client.query(
      `SELECT * FROM pack_slot WHERE id = $1 AND pack_campaign_id = $2 AND variant_id = $3 AND deleted_at IS NULL FOR UPDATE`,
      [input.packSlotId, packCampaignId, input.variantId]
    );
    const srow = slot.rows[0] as PackSlotRow | undefined;
    if (!srow) return { updated: false as const };

    const prevMeta =
      srow.metadata && typeof srow.metadata === "object" && !Array.isArray(srow.metadata)
        ? (srow.metadata as Record<string, unknown>)
        : {};
    const nextMeta: Record<string, unknown> = {
      ...prevMeta,
      medusa_customer_id: medusaId,
      order_id: input.orderId,
      payment_at: paymentInstant.toISOString(),
    };
    if (storefrontId) nextMeta.storefront_customer_id = storefrontId;
    if (lineUsd != null) nextMeta.line_paid_usd = lineUsd;

    const customerIdForSlot = storefrontId || medusaId || (typeof srow.customer_id === "string" ? srow.customer_id : null);

    const endsRaw = camp?.gift_countdown_ends_at;
    const endsAt = endsRaw ? new Date(String(endsRaw)) : null;
    const endsOk = Boolean(endsAt && !Number.isNaN(endsAt.getTime()));
    const sf =
      (storefrontId && !storefrontId.startsWith("cus_") ? storefrontId : null) ||
      (typeof prevMeta.storefront_customer_id === "string" && !String(prevMeta.storefront_customer_id).startsWith("cus_")
        ? String(prevMeta.storefront_customer_id).trim()
        : null) ||
      (typeof srow.customer_id === "string" && !String(srow.customer_id).startsWith("cus_")
        ? String(srow.customer_id).trim()
        : null);

    const alloc = (camp?.gift_allocation_type || "fixed_per_payment") as GiftAllocationType;
    const alreadyGranted =
      typeof prevMeta.pack_gift_blits_ledger_id === "string" && prevMeta.pack_gift_blits_ledger_id.length > 0;

    let col =
      typeof srow.collection_code === "string" && srow.collection_code.trim()
        ? srow.collection_code.trim()
        : "";
    if (!col) {
      col = await generatePackCollectionCode(client);
    }
    nextMeta.collection_code = col;

    if (endsOk && endsAt && sf && !alreadyGranted) {
      if (paymentInstant.getTime() > endsAt.getTime()) {
        nextMeta.pack_gift_countdown_missed = true;
        nextMeta.pack_gift_countdown_deadline = endsAt.toISOString();
      } else {
        switch (alloc) {
          case "fixed_per_payment": {
            const prize = Math.max(0, Math.floor(Number(camp?.gift_blits_prize ?? 0)));
            if (prize > 0) {
              const { ledgerId } = await adjustCustomerBlitsWithClient(client, sf, BigInt(prize), "pack_gift_countdown", {
                pack_campaign_id: packCampaignId,
                pack_slot_id: input.packSlotId,
                order_id: input.orderId,
                gift_countdown_ends_at: endsAt.toISOString(),
              });
              nextMeta.pack_gift_blits_ledger_id = ledgerId;
              nextMeta.pack_gift_blits_amount = prize;
            }
            break;
          }
          case "custom_per_size": {
            const raw = camp?.gift_custom_per_size;
            const map =
              raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
            const v = map[input.variantId];
            const amt =
              typeof v === "number"
                ? Math.floor(v)
                : typeof v === "string"
                  ? Math.floor(Number(v))
                  : 0;
            if (amt > 0) {
              const { ledgerId } = await adjustCustomerBlitsWithClient(client, sf, BigInt(amt), "pack_gift_custom_size", {
                pack_campaign_id: packCampaignId,
                pack_slot_id: input.packSlotId,
                order_id: input.orderId,
                variant_id: input.variantId,
              });
              nextMeta.pack_gift_blits_ledger_id = ledgerId;
              nextMeta.pack_gift_blits_amount = amt;
            }
            break;
          }
          case "equal_pool":
          case "fcfs_pool":
            nextMeta.pack_gift_pool_pending = true;
            break;
          default:
            break;
        }
      }
    }

    await client.query(
      `UPDATE pack_slot SET status = 'paid', order_id = $2, line_item_id = $3,
         customer_id = COALESCE($4, customer_id),
         reserved_until = NULL,
         collection_code = COALESCE(collection_code, $6),
         metadata = $5::jsonb, updated_at = NOW()
       WHERE id = $1`,
      [input.packSlotId, input.orderId, input.lineItemId, customerIdForSlot, JSON.stringify(nextMeta), col]
    );

    await settlePackPoolGifts(client, packCampaignId);

    await client.query(
      `INSERT INTO pack_event (id, pack_campaign_id, event_type, message, payload, created_at, updated_at)
       VALUES ($1, $2, 'slot_paid', $3, $4::jsonb, NOW(), NOW())`,
      [
        genId("pev"),
        packCampaignId,
        "Payment received for slot",
        JSON.stringify({ slot_id: input.packSlotId, order_id: input.orderId }),
      ]
    );

    if (typeof nextMeta.pack_gift_blits_ledger_id === "string" && !nextMeta.pack_gift_pool_pending) {
      await client.query(
        `INSERT INTO pack_event (id, pack_campaign_id, event_type, message, payload, created_at, updated_at)
         VALUES ($1, $2, 'gift_countdown_blits', $3, $4::jsonb, NOW(), NOW())`,
        [
          genId("pev"),
          packCampaignId,
          "Early-bird Blits credited",
          JSON.stringify({
            slot_id: input.packSlotId,
            order_id: input.orderId,
            blits: nextMeta.pack_gift_blits_amount,
            ledger_id: nextMeta.pack_gift_blits_ledger_id,
          }),
        ]
      );
    }

    const remaining = await client.query(
      `SELECT COUNT(*)::int AS c FROM pack_slot
       WHERE pack_campaign_id = $1 AND deleted_at IS NULL AND status NOT IN ('paid')`,
      [packCampaignId]
    );
    const count = Number(remaining.rows[0]?.c ?? 1);
    if (count === 0) {
      await client.query(
        `UPDATE pack_campaign SET status = 'ready_to_process', updated_at = NOW() WHERE id = $1`,
        [packCampaignId]
      );
      await client.query(
        `INSERT INTO pack_event (id, pack_campaign_id, event_type, message, payload, created_at, updated_at)
         VALUES ($1, $2, 'pack_complete', $3, $4::jsonb, NOW(), NOW())`,
        [
          genId("pev"),
          packCampaignId,
          "All sizes claimed — ready to process",
          JSON.stringify({ order_id: input.orderId }),
        ]
      );
    }

    return {
      updated: true as const,
      campaignComplete: count === 0,
      collectionCode: col,
      sizeLabel: typeof srow.size_label === "string" ? srow.size_label : "",
    };
  });
}

/** Run pool settlement after countdown (e.g. lazy trigger from pack page load). */
export async function settlePackPoolGiftsIfDue(campaignId: string): Promise<void> {
  await withTransaction(async (client) => {
    await settlePackPoolGifts(client, campaignId);
  });
}

export async function listCampaignsForAffiliate(affiliateId: string): Promise<PackCampaignRow[]> {
  return query<PackCampaignRow>(
    `SELECT id, pack_definition_id, affiliate_id, public_code, status, expires_at,
            gift_countdown_ends_at, gift_blits_prize, gift_allocation_type, gift_blits_pool, gift_custom_per_size,
            metadata, created_at, updated_at
     FROM pack_campaign
     WHERE deleted_at IS NULL AND affiliate_id = $1
     ORDER BY created_at DESC`,
    [affiliateId]
  );
}

export async function listCampaignsForCustomer(customerId: string): Promise<
  Array<
    PackCampaignRow & {
      slot_id: string;
      variant_id: string;
      size_label: string;
      slot_status: string;
      slot_collection_code: string | null;
      affiliate_code: string | null;
    }
  >
> {
  return query(
    `SELECT c.id, c.pack_definition_id, c.affiliate_id, c.public_code, c.status, c.expires_at,
            c.gift_countdown_ends_at, c.gift_blits_prize, c.gift_allocation_type, c.gift_blits_pool, c.gift_custom_per_size,
            c.metadata, c.created_at, c.updated_at,
            s.id AS slot_id, s.variant_id, s.size_label, s.status AS slot_status, s.collection_code AS slot_collection_code,
            a.code AS affiliate_code
     FROM pack_slot s
     JOIN pack_campaign c ON c.id = s.pack_campaign_id AND c.deleted_at IS NULL
     LEFT JOIN affiliate a ON a.id = c.affiliate_id
     WHERE s.deleted_at IS NULL AND (
       s.customer_id = $1
       OR (s.metadata->>'storefront_customer_id') = $1
     )
     ORDER BY c.updated_at DESC`,
    [customerId]
  ) as Promise<
    Array<
      PackCampaignRow & {
        slot_id: string;
        variant_id: string;
        size_label: string;
        slot_status: string;
        slot_collection_code: string | null;
        affiliate_code: string | null;
      }
    >
  >;
}

export function slotOwnedByStorefront(slot: PackSlotRow, storefrontCustomerId: string): boolean {
  if (slot.customer_id === storefrontCustomerId) return true;
  const meta = slot.metadata && typeof slot.metadata === "object" && !Array.isArray(slot.metadata)
    ? (slot.metadata as Record<string, unknown>)
    : {};
  const sf = typeof meta.storefront_customer_id === "string" ? meta.storefront_customer_id.trim() : "";
  return sf === storefrontCustomerId;
}

export async function recomputePackCampaignStatus(client: PoolClient, campaignId: string) {
  const cs = await client.query<{ status: string }>(`SELECT status FROM pack_campaign WHERE id = $1`, [campaignId]);
  const st = cs.rows[0]?.status;
  if (st === "cancelled" || st === "rejected" || st === "fulfilled") {
    return;
  }

  const r = await client.query<{ total: string; paid: string; reserved: string }>(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'paid')::int AS paid,
       COUNT(*) FILTER (WHERE status = 'reserved')::int AS reserved
     FROM pack_slot
     WHERE pack_campaign_id = $1 AND deleted_at IS NULL`,
    [campaignId]
  );
  const row = r.rows[0];
  const total = Number(row?.total ?? 0);
  const paid = Number(row?.paid ?? 0);
  const reserved = Number(row?.reserved ?? 0);

  let status = "open";
  if (total > 0 && paid === total) {
    status = "ready_to_process";
  } else if (paid > 0 || reserved > 0) {
    status = "filling";
  } else {
    status = "open";
  }

  await client.query(`UPDATE pack_campaign SET status = $2, updated_at = NOW() WHERE id = $1`, [campaignId, status]);
}

export async function leavePackSlot(input: {
  campaignId: string;
  slotId: string;
  storefrontCustomerId: string;
}): Promise<{ ok: true; previousStatus: string } | { ok: false; reason: string }> {
  await ensureBlitsSchema();
  const settings = await getPlatformBlitsSettings();
  const usdToBlits = settings ? Number(settings.usd_to_blits_per_dollar) : 100;

  return withTransaction(async (client) => {
    const campChk = await client.query<{ status: string }>(
      `SELECT status FROM pack_campaign WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [input.campaignId]
    );
    const cst = campChk.rows[0]?.status;
    if (cst === "cancelled" || cst === "rejected" || cst === "fulfilled") {
      return { ok: false, reason: "campaign_closed" };
    }

    const slot = await client.query(
      `SELECT * FROM pack_slot WHERE id = $1 AND pack_campaign_id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [input.slotId, input.campaignId]
    );
    const row = slot.rows[0] as PackSlotRow | undefined;
    if (!row) return { ok: false, reason: "not_found" };

    if (!slotOwnedByStorefront(row, input.storefrontCustomerId)) {
      return { ok: false, reason: "forbidden" };
    }

    const prev = row.status;
    if (prev === "available" || prev === "withdrawn") {
      return { ok: false, reason: "invalid_status" };
    }

    if (prev === "reserved") {
      await client.query(
        `UPDATE pack_slot SET status = 'available', customer_id = NULL, reserved_until = NULL, commitment = 'none',
         metadata = NULL, updated_at = NOW()
         WHERE id = $1`,
        [input.slotId]
      );
    } else if (prev === "paid") {
      const prevMeta =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {};
      const lineUsd = Number(prevMeta.line_paid_usd ?? 0);
      const sfRaw =
        typeof prevMeta.storefront_customer_id === "string" ? prevMeta.storefront_customer_id.trim() : "";
      const storefrontId =
        sfRaw && !sfRaw.startsWith("cus_")
          ? sfRaw
          : row.customer_id && !String(row.customer_id).startsWith("cus_")
            ? String(row.customer_id).trim()
            : null;

      let blitsCredited = BigInt(0);
      if (storefrontId && lineUsd > 0 && Number.isFinite(lineUsd)) {
        blitsCredited = BigInt(Math.max(0, Math.round(lineUsd * usdToBlits)));
        if (blitsCredited > BigInt(0)) {
          await adjustCustomerBlitsWithClient(client, storefrontId, blitsCredited, "pack_slot_left_refund", {
            pack_campaign_id: input.campaignId,
            slot_id: input.slotId,
            line_paid_usd: lineUsd,
          });
        }
      }

      const nextMeta = {
        ...prevMeta,
        left_at: new Date().toISOString(),
        left_by_storefront_id: input.storefrontCustomerId,
        ...(blitsCredited > BigInt(0)
          ? {
              refund_blits_credited: blitsCredited.toString(),
              refunded_at: new Date().toISOString(),
            }
          : {}),
      };
      await client.query(
        `UPDATE pack_slot SET status = 'withdrawn', metadata = $2::jsonb, updated_at = NOW() WHERE id = $1`,
        [input.slotId, JSON.stringify(nextMeta)]
      );
    } else {
      return { ok: false, reason: "invalid_status" };
    }

    await client.query(
      `INSERT INTO pack_event (id, pack_campaign_id, event_type, message, payload, created_at, updated_at)
       VALUES ($1, $2, 'participant_left', $3, $4::jsonb, NOW(), NOW())`,
      [
        genId("pev"),
        input.campaignId,
        `Participant left (${prev})`,
        JSON.stringify({ slot_id: input.slotId, previous_status: prev }),
      ]
    );

    await recomputePackCampaignStatus(client, input.campaignId);

    return { ok: true, previousStatus: prev };
  });
}

/** Customer requests a refund before fulfillment processing (notifies all participants). */
export async function requestPackSlotRefund(input: {
  campaignId: string;
  slotId: string;
  storefrontCustomerId: string;
  note?: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  return withTransaction(async (client) => {
    const campChk = await client.query<{ status: string }>(
      `SELECT status FROM pack_campaign WHERE id = $1 AND deleted_at IS NULL`,
      [input.campaignId]
    );
    const cst = campChk.rows[0]?.status;
    if (cst === "cancelled" || cst === "rejected" || cst === "fulfilled") {
      return { ok: false, reason: "campaign_closed" };
    }

    const slot = await client.query(
      `SELECT * FROM pack_slot WHERE id = $1 AND pack_campaign_id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [input.slotId, input.campaignId]
    );
    const row = slot.rows[0] as PackSlotRow | undefined;
    if (!row) return { ok: false, reason: "not_found" };
    if (!slotOwnedByStorefront(row, input.storefrontCustomerId)) {
      return { ok: false, reason: "forbidden" };
    }
    if (row.status !== "paid") {
      return { ok: false, reason: "invalid_status" };
    }

    const prevMeta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    if (prevMeta.refund_requested_at) {
      return { ok: false, reason: "already_requested" };
    }

    const nextMeta = {
      ...prevMeta,
      refund_requested_at: new Date().toISOString(),
      refund_request_note: input.note?.trim() || null,
    };

    await client.query(`UPDATE pack_slot SET metadata = $2::jsonb, updated_at = NOW() WHERE id = $1`, [
      input.slotId,
      JSON.stringify(nextMeta),
    ]);

    await client.query(
      `INSERT INTO pack_event (id, pack_campaign_id, event_type, message, payload, created_at, updated_at)
       VALUES ($1, $2, 'refund_requested', $3, $4::jsonb, NOW(), NOW())`,
      [
        genId("pev"),
        input.campaignId,
        "Refund requested before processing",
        JSON.stringify({ slot_id: input.slotId, note: input.note }),
      ]
    );

    return { ok: true };
  });
}

/** Admin or affiliate: configure early-bird Blits (deadline, allocation type, amounts). */
export async function updatePackCampaignGiftSettings(input: {
  campaignId: string;
  giftCountdownEndsAt: Date | null;
  giftBlitsPrize: number | null;
  giftAllocationType?: GiftAllocationType | null;
  giftBlitsPool?: number | null;
  giftCustomPerSize?: Record<string, number> | null;
}): Promise<PackCampaignRow | null> {
  const prize =
    input.giftBlitsPrize != null && Number.isFinite(Number(input.giftBlitsPrize)) && Number(input.giftBlitsPrize) > 0
      ? Math.floor(Number(input.giftBlitsPrize))
      : null;
  const pool =
    input.giftBlitsPool != null && Number.isFinite(Number(input.giftBlitsPool)) && Number(input.giftBlitsPool) > 0
      ? Math.floor(Number(input.giftBlitsPool))
      : null;
  let ends: Date | null = null;
  if (input.giftCountdownEndsAt) {
    const d =
      input.giftCountdownEndsAt instanceof Date
        ? input.giftCountdownEndsAt
        : new Date(input.giftCountdownEndsAt);
    if (!Number.isNaN(d.getTime())) ends = d;
  }

  const alloc = (input.giftAllocationType || "fixed_per_payment") as GiftAllocationType;
  let customJson: string | null = null;
  if (input.giftCustomPerSize && typeof input.giftCustomPerSize === "object") {
    const cleaned: Record<string, number> = {};
    for (const [k, v] of Object.entries(input.giftCustomPerSize)) {
      const n = Math.floor(Number(v));
      if (n > 0 && k.trim()) cleaned[k.trim()] = n;
    }
    customJson = Object.keys(cleaned).length > 0 ? JSON.stringify(cleaned) : null;
  }

  const clearing = !ends && !prize && !pool && !customJson;

  if (!clearing) {
    if (!ends) {
      throw new Error("Set a pay-by deadline for early-bird Blits, or clear all gift fields.");
    }
    if (alloc === "fixed_per_payment" && !prize) {
      throw new Error("Set a Blits amount per payment for fixed allocation, or choose another allocation type.");
    }
    if ((alloc === "equal_pool" || alloc === "fcfs_pool") && !pool) {
      throw new Error("Set a total Blits pool for equal / first-come allocation.");
    }
    if (alloc === "custom_per_size" && !customJson) {
      throw new Error("Provide custom Blits per variant id (JSON object) for custom allocation.");
    }
  }

  const metaRow = await queryOne<{ metadata: Record<string, unknown> | null }>(
    `SELECT metadata FROM pack_campaign WHERE id = $1 AND deleted_at IS NULL`,
    [input.campaignId]
  );
  const prevMeta =
    metaRow?.metadata && typeof metaRow.metadata === "object" && !Array.isArray(metaRow.metadata)
      ? { ...metaRow.metadata }
      : {};
  if (clearing || pool !== null || alloc === "equal_pool" || alloc === "fcfs_pool") {
    delete prevMeta.gift_pool_settled;
    delete prevMeta.gift_pool_settled_at;
  }

  await execute(
    `UPDATE pack_campaign
     SET gift_countdown_ends_at = $2,
         gift_blits_prize = $3,
         gift_allocation_type = $4,
         gift_blits_pool = $5,
         gift_custom_per_size = $6::jsonb,
         metadata = $7::jsonb,
         updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL`,
    [
      input.campaignId,
      ends ? ends.toISOString() : null,
      prize,
      clearing ? "fixed_per_payment" : alloc,
      clearing ? null : pool,
      clearing ? null : customJson,
      JSON.stringify(prevMeta),
    ]
  );

  await insertPackEvent({
    campaignId: input.campaignId,
    eventType: "gift_countdown_settings",
    message: "Early-bird Blits settings updated",
    payload: {
      gift_countdown_ends_at: ends ? ends.toISOString() : null,
      gift_blits_prize: prize,
      gift_allocation_type: clearing ? "fixed_per_payment" : alloc,
      gift_blits_pool: clearing ? null : pool,
      gift_custom_per_size: clearing ? null : customJson ? JSON.parse(customJson) : null,
    },
  });

  return getCampaignById(input.campaignId);
}
