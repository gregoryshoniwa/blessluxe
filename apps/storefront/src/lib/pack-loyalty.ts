import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { execute, queryOne, withTransaction } from "@/lib/db";
import { adjustCustomerBlitsWithClient, ensureBlitsSchema } from "@/lib/blits";

let ensurePromise: Promise<void> | null = null;

export type PackLoyaltySettingsRow = {
  id: string;
  starting_loyalty_points: string;
  max_loyalty_points: string;
  leave_penalty_points: string;
  completion_bonus_points: string;
  blits_per_loyalty_point: string;
  updated_at: string;
};

export async function ensurePackLoyaltySchema() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await execute(
        `CREATE TABLE IF NOT EXISTS platform_pack_loyalty_settings (
          id text PRIMARY KEY,
          starting_loyalty_points integer NOT NULL DEFAULT 100,
          max_loyalty_points integer NOT NULL DEFAULT 200,
          leave_penalty_points integer NOT NULL DEFAULT 5,
          completion_bonus_points integer NOT NULL DEFAULT 2,
          blits_per_loyalty_point numeric NOT NULL DEFAULT 1,
          updated_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );
      await execute(
        `INSERT INTO platform_pack_loyalty_settings (id, starting_loyalty_points, max_loyalty_points, leave_penalty_points, completion_bonus_points, blits_per_loyalty_point)
         SELECT 'default', 100, 200, 5, 2, 1
         WHERE NOT EXISTS (SELECT 1 FROM platform_pack_loyalty_settings WHERE id = 'default')`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS customer_pack_loyalty (
          customer_id text PRIMARY KEY,
          loyalty_points integer NOT NULL DEFAULT 100,
          updated_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS pack_loyalty_ledger (
          id text PRIMARY KEY,
          customer_id text NOT NULL,
          delta_points integer NOT NULL,
          balance_after integer NOT NULL,
          kind text NOT NULL,
          metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );
      await execute(
        `CREATE INDEX IF NOT EXISTS idx_pack_loyalty_ledger_customer ON pack_loyalty_ledger(customer_id, created_at DESC)`
      );
    })();
  }
  await ensurePromise;
}

export async function getPackLoyaltySettings(): Promise<PackLoyaltySettingsRow | null> {
  await ensurePackLoyaltySchema();
  return queryOne<PackLoyaltySettingsRow>(
    `SELECT * FROM platform_pack_loyalty_settings WHERE id = 'default' LIMIT 1`,
    []
  );
}

export async function updatePackLoyaltySettings(input: {
  startingLoyaltyPoints?: number;
  maxLoyaltyPoints?: number;
  leavePenaltyPoints?: number;
  completionBonusPoints?: number;
  blitsPerLoyaltyPoint?: number;
}) {
  await ensurePackLoyaltySchema();
  const cur = await getPackLoyaltySettings();
  if (!cur) return null;

  const starting =
    input.startingLoyaltyPoints != null ? Math.max(0, Math.floor(input.startingLoyaltyPoints)) : Number(cur.starting_loyalty_points);
  const maxP =
    input.maxLoyaltyPoints != null ? Math.max(1, Math.floor(input.maxLoyaltyPoints)) : Number(cur.max_loyalty_points);
  const leavePen =
    input.leavePenaltyPoints != null ? Math.max(0, Math.floor(input.leavePenaltyPoints)) : Number(cur.leave_penalty_points);
  const bonus =
    input.completionBonusPoints != null ? Math.max(0, Math.floor(input.completionBonusPoints)) : Number(cur.completion_bonus_points);
  const bpl =
    input.blitsPerLoyaltyPoint != null
      ? Math.max(0, Number(input.blitsPerLoyaltyPoint))
      : Number(cur.blits_per_loyalty_point);

  await execute(
    `UPDATE platform_pack_loyalty_settings
     SET starting_loyalty_points = $1,
         max_loyalty_points = $2,
         leave_penalty_points = $3,
         completion_bonus_points = $4,
         blits_per_loyalty_point = $5,
         updated_at = NOW()
     WHERE id = 'default'`,
    [starting, maxP, leavePen, bonus, bpl]
  );
  return getPackLoyaltySettings();
}

function clampPoints(value: number, maxPoints: number): number {
  return Math.max(0, Math.min(maxPoints, Math.floor(value)));
}

export async function getOrCreateCustomerLoyaltyPoints(customerId: string): Promise<number> {
  await ensurePackLoyaltySchema();
  const settings = await getPackLoyaltySettings();
  const start = settings ? Number(settings.starting_loyalty_points) : 100;
  const maxP = settings ? Number(settings.max_loyalty_points) : 200;

  const row = await queryOne<{ loyalty_points: string }>(
    `SELECT loyalty_points FROM customer_pack_loyalty WHERE customer_id = $1`,
    [customerId]
  );
  if (row) return clampPoints(Number(row.loyalty_points), maxP);

  const initial = clampPoints(start, maxP);
  await execute(
    `INSERT INTO customer_pack_loyalty (customer_id, loyalty_points, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (customer_id) DO NOTHING`,
    [customerId, initial]
  );
  const again = await queryOne<{ loyalty_points: string }>(
    `SELECT loyalty_points FROM customer_pack_loyalty WHERE customer_id = $1`,
    [customerId]
  );
  return again ? clampPoints(Number(again.loyalty_points), maxP) : initial;
}

export async function adjustCustomerLoyaltyPointsWithClient(
  client: PoolClient,
  customerId: string,
  delta: number,
  kind: string,
  metadata: Record<string, unknown> = {}
): Promise<{ balanceAfter: number; ledgerId: string }> {
  await ensurePackLoyaltySchema();
  const settings = await getPackLoyaltySettings();
  const maxP = settings ? Number(settings.max_loyalty_points) : 200;

  await client.query(
    `INSERT INTO customer_pack_loyalty (customer_id, loyalty_points) VALUES ($1, $2)
     ON CONFLICT (customer_id) DO NOTHING`,
    [customerId, settings ? Number(settings.starting_loyalty_points) : 100]
  );

  const locked = await client.query<{ loyalty_points: string }>(
    `SELECT loyalty_points FROM customer_pack_loyalty WHERE customer_id = $1 FOR UPDATE`,
    [customerId]
  );
  const cur = locked.rows[0] ? Number(locked.rows[0].loyalty_points) : 0;
  const next = clampPoints(cur + delta, maxP);
  await client.query(`UPDATE customer_pack_loyalty SET loyalty_points = $1, updated_at = NOW() WHERE customer_id = $2`, [
    next,
    customerId,
  ]);
  const id = randomUUID();
  await client.query(
    `INSERT INTO pack_loyalty_ledger (id, customer_id, delta_points, balance_after, kind, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [id, customerId, delta, next, kind, JSON.stringify(metadata)]
  );
  return { balanceAfter: next, ledgerId: id };
}

export async function adjustCustomerLoyaltyPoints(
  customerId: string,
  delta: number,
  kind: string,
  metadata: Record<string, unknown> = {}
): Promise<{ balanceAfter: number }> {
  return withTransaction(async (client) => {
    const { balanceAfter } = await adjustCustomerLoyaltyPointsWithClient(client, customerId, delta, kind, metadata);
    return { balanceAfter };
  });
}

/** After all slots are paid: grant completion bonus to each participant with a storefront id (once per campaign). */
export async function grantPackCompletionLoyaltyBonuses(campaignId: string): Promise<{ granted: number }> {
  await ensurePackLoyaltySchema();
  const settings = await getPackLoyaltySettings();
  const bonus = settings ? Number(settings.completion_bonus_points) : 2;

  return withTransaction(async (client) => {
    const locked = await client.query<{ metadata: unknown }>(
      `SELECT metadata FROM pack_campaign WHERE deleted_at IS NULL AND id = $1 FOR UPDATE`,
      [campaignId]
    );
    const crow = locked.rows[0];
    if (!crow) return { granted: 0 };

    const meta = (crow.metadata && typeof crow.metadata === "object" && !Array.isArray(crow.metadata)
      ? crow.metadata
      : {}) as Record<string, unknown>;
    if (meta.completion_loyalty_granted === true) {
      return { granted: 0 };
    }

    const slotRes = await client.query(
      `SELECT id, status, customer_id, metadata
       FROM pack_slot WHERE pack_campaign_id = $1 AND deleted_at IS NULL`,
      [campaignId]
    );
    const slotRows = slotRes.rows as Array<{
      id: string;
      status: string;
      customer_id: string | null;
      metadata: unknown;
    }>;
    if (slotRows.length === 0) return { granted: 0 };

    const allPaid = slotRows.every((s) => s.status === "paid");
    if (!allPaid) return { granted: 0 };

    if (bonus <= 0) {
      const nextMeta = { ...meta, completion_loyalty_granted: true };
      await client.query(`UPDATE pack_campaign SET metadata = $2::jsonb, updated_at = NOW() WHERE id = $1`, [
        campaignId,
        JSON.stringify(nextMeta),
      ]);
      return { granted: 0 };
    }

    const storefrontIds = new Set<string>();
    for (const s of slotRows) {
      const m = (s.metadata || {}) as Record<string, unknown>;
      const sf = typeof m.storefront_customer_id === "string" ? m.storefront_customer_id.trim() : "";
      if (sf) storefrontIds.add(sf);
      else if (s.customer_id && !String(s.customer_id).startsWith("cus_")) {
        storefrontIds.add(String(s.customer_id));
      }
    }

    let granted = 0;
    for (const cid of storefrontIds) {
      try {
        await adjustCustomerLoyaltyPointsWithClient(client, cid, bonus, "pack_completion_bonus", {
          pack_campaign_id: campaignId,
        });
        granted += 1;
      } catch (e) {
        console.warn("[pack-loyalty] completion bonus skipped for", cid, e);
      }
    }

    const nextMeta = { ...meta, completion_loyalty_granted: true };
    await client.query(`UPDATE pack_campaign SET metadata = $2::jsonb, updated_at = NOW() WHERE id = $1`, [
      campaignId,
      JSON.stringify(nextMeta),
    ]);

    return { granted };
  });
}

export async function applyLeavePackPenalty(storefrontCustomerId: string, campaignId: string, slotId: string) {
  await ensurePackLoyaltySchema();
  const settings = await getPackLoyaltySettings();
  const pen = settings ? Number(settings.leave_penalty_points) : 5;
  if (pen <= 0) return { balanceAfter: await getOrCreateCustomerLoyaltyPoints(storefrontCustomerId) };
  return adjustCustomerLoyaltyPoints(storefrontCustomerId, -pen, "pack_leave_penalty", {
    pack_campaign_id: campaignId,
    pack_slot_id: slotId,
  });
}

export async function redeemLoyaltyPointsToBlits(
  customerId: string,
  pointsToRedeem: number
): Promise<{ loyaltyAfter: number; blitsCredited: bigint; balanceAfter: bigint }> {
  await ensurePackLoyaltySchema();
  await ensureBlitsSchema();
  const settings = await getPackLoyaltySettings();
  if (!settings) throw new Error("Pack loyalty settings missing.");

  const bpl = Number(settings.blits_per_loyalty_point);
  const pts = Math.max(0, Math.floor(pointsToRedeem));
  if (pts <= 0) throw new Error("Invalid points amount.");
  if (bpl <= 0) throw new Error("Loyalty redemption is disabled (blits per point is zero).");

  const blits = BigInt(Math.max(0, Math.floor(pts * bpl)));
  if (blits <= BigInt(0)) throw new Error("Redemption would yield no Blits.");

  return withTransaction(async (client) => {
    await client.query(
      `INSERT INTO customer_pack_loyalty (customer_id, loyalty_points) VALUES ($1, $2)
       ON CONFLICT (customer_id) DO NOTHING`,
      [customerId, Number(settings.starting_loyalty_points)]
    );

    const row = await client.query<{ loyalty_points: string }>(
      `SELECT loyalty_points FROM customer_pack_loyalty WHERE customer_id = $1 FOR UPDATE`,
      [customerId]
    );
    const cur = row.rows[0] ? Number(row.rows[0].loyalty_points) : 0;
    if (pts > cur) throw new Error("INSUFFICIENT_LOYALTY_POINTS");

    const maxP = Number(settings.max_loyalty_points);
    const nextLoyalty = Math.max(0, Math.min(maxP, cur - pts));

    await client.query(
      `UPDATE customer_pack_loyalty SET loyalty_points = $1, updated_at = NOW() WHERE customer_id = $2`,
      [nextLoyalty, customerId]
    );

    const ledgerId = randomUUID();
    await client.query(
      `INSERT INTO pack_loyalty_ledger (id, customer_id, delta_points, balance_after, kind, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [ledgerId, customerId, -pts, nextLoyalty, "redeem_to_blits", JSON.stringify({ points: pts, blits: blits.toString() })]
    );

    const { balanceAfter } = await adjustCustomerBlitsWithClient(client, customerId, blits, "pack_loyalty_redeem", {
      loyalty_points_redeemed: pts,
      blits_per_loyalty_point: bpl,
    });

    return { loyaltyAfter: nextLoyalty, blitsCredited: blits, balanceAfter };
  });
}

export async function seedInitialLoyaltyForNewCustomer(customerId: string) {
  await ensurePackLoyaltySchema();
  const settings = await getPackLoyaltySettings();
  const start = settings ? Number(settings.starting_loyalty_points) : 100;
  const maxP = settings ? Number(settings.max_loyalty_points) : 200;
  const initial = Math.min(maxP, Math.max(0, Math.floor(start)));
  await execute(
    `INSERT INTO customer_pack_loyalty (customer_id, loyalty_points, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (customer_id) DO NOTHING`,
    [customerId, initial]
  );
}
