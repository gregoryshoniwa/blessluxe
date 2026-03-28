import type { PoolClient } from "pg";
import { randomBytes } from "crypto";
import { adjustCustomerBlitsWithClient } from "@/lib/blits";

export type GiftAllocationType = "fixed_per_payment" | "equal_pool" | "fcfs_pool" | "custom_per_size";

/** Unique pickup / fulfillment code per paid slot (column + metadata mirror). */
export async function generatePackCollectionCode(client: PoolClient): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = `PKT-${randomBytes(4).toString("hex").toUpperCase()}`;
    const dup = await client.query(
      `SELECT 1 FROM pack_slot WHERE collection_code = $1 AND deleted_at IS NULL LIMIT 1`,
      [code]
    );
    if (dup.rows.length === 0) return code;
  }
  throw new Error("Could not allocate collection code.");
}

function storefrontIdForSlot(meta: Record<string, unknown>, customerId: string | null): string | null {
  const sf =
    (typeof meta.storefront_customer_id === "string" && !String(meta.storefront_customer_id).startsWith("cus_")
      ? String(meta.storefront_customer_id).trim()
      : null) ||
    (customerId && !String(customerId).startsWith("cus_") ? String(customerId).trim() : null);
  return sf || null;
}

function parsePaymentAt(meta: Record<string, unknown>): Date | null {
  const raw = meta.payment_at;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function splitEqualInt(pool: number, m: number): number[] {
  if (m <= 0 || pool <= 0) return [];
  const base = Math.floor(pool / m);
  let rem = pool - base * m;
  const out: number[] = new Array(m).fill(base);
  for (let i = 0; i < m && rem > 0; i++) {
    out[i] += 1;
    rem -= 1;
  }
  return out;
}

function splitFcfsInt(pool: number, nSlots: number, m: number): number[] {
  if (m <= 0 || pool <= 0 || nSlots <= 0) return [];
  const weights: number[] = [];
  for (let i = 0; i < m; i++) {
    weights.push(nSlots - i);
  }
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0) return splitEqualInt(pool, m);
  const raw = weights.map((w) => (pool * w) / sumW);
  const floors = raw.map((x) => Math.floor(x));
  let rem = pool - floors.reduce((a, b) => a + b, 0);
  for (let i = 0; i < m && rem > 0; i++) {
    floors[i] += 1;
    rem -= 1;
  }
  return floors;
}

/**
 * After the gift countdown ends, split `gift_blits_pool` across qualifying paid slots
 * (`payment_at` on or before deadline). Idempotent via campaign.metadata.gift_pool_settled.
 */
export async function settlePackPoolGifts(client: PoolClient, campaignId: string): Promise<void> {
  const cRes = await client.query<{
    id: string;
    gift_allocation_type: string;
    gift_blits_pool: string | number | null;
    gift_countdown_ends_at: string | null;
    metadata: Record<string, unknown> | null;
  }>(
    `SELECT id, gift_allocation_type, gift_blits_pool, gift_countdown_ends_at, metadata
     FROM pack_campaign WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
    [campaignId]
  );
  const camp = cRes.rows[0];
  if (!camp) return;

  const alloc = (camp.gift_allocation_type || "fixed_per_payment") as GiftAllocationType;
  if (alloc !== "equal_pool" && alloc !== "fcfs_pool") return;

  const prevMeta =
    camp.metadata && typeof camp.metadata === "object" && !Array.isArray(camp.metadata)
      ? (camp.metadata as Record<string, unknown>)
      : {};
  if (prevMeta.gift_pool_settled === true) return;

  const endsRaw = camp.gift_countdown_ends_at;
  if (!endsRaw) return;
  const deadline = new Date(String(endsRaw));
  if (Number.isNaN(deadline.getTime())) return;
  if (Date.now() < deadline.getTime()) return;

  const pool = Math.max(0, Math.floor(Number(camp.gift_blits_pool ?? 0)));
  if (pool <= 0) {
    const next = { ...prevMeta, gift_pool_settled: true, gift_pool_settled_at: new Date().toISOString() };
    await client.query(`UPDATE pack_campaign SET metadata = $2::jsonb, updated_at = NOW() WHERE id = $1`, [
      campaignId,
      JSON.stringify(next),
    ]);
    return;
  }

  const totalRes = await client.query<{ c: string }>(
    `SELECT COUNT(*)::int AS c FROM pack_slot WHERE pack_campaign_id = $1 AND deleted_at IS NULL`,
    [campaignId]
  );
  const nSlots = Math.max(1, Number(totalRes.rows[0]?.c ?? 1));

  const slotsRes = await client.query<{
    id: string;
    customer_id: string | null;
    metadata: Record<string, unknown> | null;
  }>(
    `SELECT id, customer_id, metadata FROM pack_slot
     WHERE pack_campaign_id = $1 AND deleted_at IS NULL AND status = 'paid'
     ORDER BY created_at ASC`,
    [campaignId]
  );

  type Row = { id: string; customer_id: string | null; meta: Record<string, unknown>; paidAt: Date };
  const qualifying: Row[] = [];
  for (const r of slotsRes.rows) {
    const meta =
      r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
        ? (r.metadata as Record<string, unknown>)
        : {};
    if (typeof meta.pack_gift_blits_ledger_id === "string" && meta.pack_gift_blits_ledger_id.length > 0) {
      continue;
    }
    const paidAt = parsePaymentAt(meta);
    if (!paidAt || paidAt.getTime() > deadline.getTime()) continue;
    const sf = storefrontIdForSlot(meta, r.customer_id);
    if (!sf) continue;
    qualifying.push({ id: r.id, customer_id: r.customer_id, meta, paidAt });
  }

  qualifying.sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());

  const M = qualifying.length;
  if (M === 0) {
    const next = { ...prevMeta, gift_pool_settled: true, gift_pool_settled_at: new Date().toISOString() };
    await client.query(`UPDATE pack_campaign SET metadata = $2::jsonb, updated_at = NOW() WHERE id = $1`, [
      campaignId,
      JSON.stringify(next),
    ]);
    return;
  }

  let amounts: number[];
  if (alloc === "equal_pool") {
    amounts = splitEqualInt(pool, M);
  } else {
    amounts = splitFcfsInt(pool, nSlots, M);
  }

  for (let i = 0; i < M; i++) {
    const row = qualifying[i];
    const blits = Math.max(0, amounts[i] ?? 0);
    if (blits <= 0) continue;
    const sf = storefrontIdForSlot(row.meta, row.customer_id);
    if (!sf) continue;

    const { ledgerId } = await adjustCustomerBlitsWithClient(client, sf, BigInt(blits), "pack_gift_pool_settlement", {
      pack_campaign_id: campaignId,
      pack_slot_id: row.id,
      gift_allocation_type: alloc,
      pool_total: pool,
      settlement_index: i + 1,
      settlement_count: M,
    });

    const merged = {
      ...row.meta,
      pack_gift_blits_ledger_id: ledgerId,
      pack_gift_blits_amount: blits,
      pack_gift_pool_pending: false,
    };
    await client.query(`UPDATE pack_slot SET metadata = $2::jsonb, updated_at = NOW() WHERE id = $1`, [
      row.id,
      JSON.stringify(merged),
    ]);
  }

  const nextCamp = {
    ...prevMeta,
    gift_pool_settled: true,
    gift_pool_settled_at: new Date().toISOString(),
  };
  await client.query(`UPDATE pack_campaign SET metadata = $2::jsonb, updated_at = NOW() WHERE id = $1`, [
    campaignId,
    JSON.stringify(nextCamp),
  ]);
}
