import { execute, query, queryOne, withTransaction } from "@/lib/db";
import type { PoolClient } from "pg";
import { randomUUID } from "crypto";

/** 1 USD = 100 Blits (base rate). */
export const DEFAULT_USD_TO_BLITS = 100;

let ensureBlitsPromise: Promise<void> | null = null;

export async function ensureBlitsSchema() {
  if (!ensureBlitsPromise) {
    ensureBlitsPromise = (async () => {
      await execute(
        `CREATE TABLE IF NOT EXISTS platform_blits_settings (
          id text PRIMARY KEY,
          usd_to_blits_per_dollar numeric NOT NULL DEFAULT 100,
          blits_per_usd_cashout numeric NOT NULL DEFAULT 100,
          product_discount_percent_paying_blits numeric NOT NULL DEFAULT 0,
          purchase_tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
          updated_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );

      await execute(
        `INSERT INTO platform_blits_settings (id, usd_to_blits_per_dollar, blits_per_usd_cashout, product_discount_percent_paying_blits, purchase_tiers)
         SELECT 'default', 100, 100, 0, $1::jsonb
         WHERE NOT EXISTS (SELECT 1 FROM platform_blits_settings WHERE id = 'default')`,
        [JSON.stringify(getDefaultPurchaseTiers())]
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS blits_gift_type (
          id text PRIMARY KEY,
          name text NOT NULL,
          description text NULL,
          emoji text NULL,
          cost_blits integer NOT NULL,
          sort_order integer NOT NULL DEFAULT 0,
          active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT NOW(),
          updated_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS customer_blits_wallet (
          customer_id text PRIMARY KEY,
          balance_blits bigint NOT NULL DEFAULT 0,
          pending_cashout_usd numeric NOT NULL DEFAULT 0,
          updated_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS affiliate_dispute (
          id text PRIMARY KEY,
          affiliate_id text NOT NULL,
          customer_email text NULL,
          order_ref text NULL,
          subject text NOT NULL,
          body text NOT NULL,
          status text NOT NULL DEFAULT 'open',
          admin_notes text NULL,
          created_at timestamptz NOT NULL DEFAULT NOW(),
          updated_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS affiliate_admin_message (
          id text PRIMARY KEY,
          affiliate_id text NOT NULL,
          from_admin boolean NOT NULL DEFAULT true,
          body text NOT NULL,
          read_at timestamptz NULL,
          created_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );

      await execute(
        `CREATE INDEX IF NOT EXISTS idx_affiliate_dispute_affiliate ON affiliate_dispute(affiliate_id, created_at DESC)`
      );
      await execute(
        `CREATE INDEX IF NOT EXISTS idx_affiliate_message_affiliate ON affiliate_admin_message(affiliate_id, created_at DESC)`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS blits_ledger (
          id text PRIMARY KEY,
          customer_id text NOT NULL,
          delta_blits bigint NOT NULL,
          balance_after bigint NOT NULL,
          kind text NOT NULL,
          metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );
      await execute(
        `CREATE INDEX IF NOT EXISTS idx_blits_ledger_customer ON blits_ledger(customer_id, created_at DESC)`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS blits_checkout_idempotency (
          idempotency_key text PRIMARY KEY,
          customer_id text NOT NULL,
          response_json jsonb NOT NULL,
          ledger_id text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );
      await execute(
        `CREATE INDEX IF NOT EXISTS idx_blits_checkout_idem_customer ON blits_checkout_idempotency(customer_id)`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS checkout_external_payment_idempotency (
          idempotency_key text PRIMARY KEY,
          outcome_json jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS blits_gift_event (
          id text PRIMARY KEY,
          customer_id text NOT NULL,
          affiliate_id text NOT NULL,
          post_id text NULL,
          gift_type_id text NOT NULL,
          blits_spent bigint NOT NULL,
          created_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );
      await execute(
        `CREATE INDEX IF NOT EXISTS idx_blits_gift_affiliate ON blits_gift_event(affiliate_id, created_at DESC)`
      );
      await execute(
        `CREATE INDEX IF NOT EXISTS idx_blits_gift_created ON blits_gift_event(created_at DESC)`
      );
    })();
  }
  await ensureBlitsPromise;
}

/** Default packs: $1–$100 with small bonuses on larger packs (editable in admin). */
export function getDefaultPurchaseTiers(): Array<{
  usd: number;
  blits: number;
  label: string;
  bonus_percent?: number;
}> {
  const base = DEFAULT_USD_TO_BLITS;
  const tiers: Array<{ usd: number; blits: number; label: string; bonus_percent?: number }> = [];
  const amounts = [1, 5, 10, 25, 50, 100];
  const bonus = [0, 2, 5, 8, 12, 15];
  for (let i = 0; i < amounts.length; i++) {
    const usd = amounts[i];
    const b = bonus[i] || 0;
    const blits = Math.round(usd * base * (1 + b / 100));
    tiers.push({
      usd,
      blits,
      label: `$${usd}`,
      bonus_percent: b || undefined,
    });
  }
  return tiers;
}

export async function getPlatformBlitsSettings() {
  await ensureBlitsSchema();
  const row = await queryOne<{
    id: string;
    usd_to_blits_per_dollar: string;
    blits_per_usd_cashout: string;
    product_discount_percent_paying_blits: string;
    purchase_tiers: unknown;
    updated_at: string;
  }>(`SELECT * FROM platform_blits_settings WHERE id = 'default' LIMIT 1`, []);
  return row;
}

export async function updatePlatformBlitsSettings(input: {
  usdToBlitsPerDollar?: number;
  blitsPerUsdCashout?: number;
  productDiscountPercentPayingBlits?: number;
  purchaseTiers?: unknown;
}) {
  await ensureBlitsSchema();
  let current = await getPlatformBlitsSettings();
  if (!current) {
    await execute(
      `INSERT INTO platform_blits_settings (id, usd_to_blits_per_dollar, blits_per_usd_cashout, product_discount_percent_paying_blits, purchase_tiers)
       SELECT 'default', 100, 100, 0, $1::jsonb
       WHERE NOT EXISTS (SELECT 1 FROM platform_blits_settings WHERE id = 'default')`,
      [JSON.stringify(getDefaultPurchaseTiers())]
    );
    current = await getPlatformBlitsSettings();
  }
  if (!current) return null;

  const usdToBlits =
    input.usdToBlitsPerDollar != null ? Number(input.usdToBlitsPerDollar) : Number(current.usd_to_blits_per_dollar);
  const cashout =
    input.blitsPerUsdCashout != null ? Number(input.blitsPerUsdCashout) : Number(current.blits_per_usd_cashout);
  const disc =
    input.productDiscountPercentPayingBlits != null
      ? Number(input.productDiscountPercentPayingBlits)
      : Number(current.product_discount_percent_paying_blits);
  const tiers =
    input.purchaseTiers !== undefined ? input.purchaseTiers : current.purchase_tiers;

  await execute(
    `UPDATE platform_blits_settings
     SET usd_to_blits_per_dollar = $1,
         blits_per_usd_cashout = $2,
         product_discount_percent_paying_blits = $3,
         purchase_tiers = $4::jsonb,
         updated_at = NOW()
     WHERE id = 'default'`,
    [usdToBlits, cashout, disc, JSON.stringify(tiers)]
  );
  return getPlatformBlitsSettings();
}

export type BlitsSettingsRow = NonNullable<Awaited<ReturnType<typeof getPlatformBlitsSettings>>>;

/** Subtotal is reduced by discount %; shipping is added after discount. */
export function computeCheckoutUsdAndBlits(input: {
  subtotalUsd: number;
  shippingUsd: number;
  productDiscountPercent: number;
  usdToBlitsPerDollar: number;
}): { payableUsd: number; blitsRequired: number } {
  const disc = Math.max(0, Math.min(100, input.productDiscountPercent));
  const sub = Math.max(0, input.subtotalUsd) * (1 - disc / 100);
  const ship = Math.max(0, input.shippingUsd);
  const payableUsd = Math.round((sub + ship) * 1e6) / 1e6;
  const rate = Math.max(0, input.usdToBlitsPerDollar);
  const blitsRequired = Math.max(1, Math.ceil(payableUsd * rate));
  return { payableUsd, blitsRequired };
}

export function computeBlitsForUsdPurchase(amountUsd: number, settings: BlitsSettingsRow): number {
  const tiersRaw = settings.purchase_tiers;
  const tiers = Array.isArray(tiersRaw) ? tiersRaw : [];
  const match = tiers.find((t: { usd?: number; blits?: number }) => Number((t as { usd?: number }).usd) === amountUsd);
  if (match && typeof (match as { blits?: number }).blits === "number") {
    return Math.max(0, Math.round(Number((match as { blits: number }).blits)));
  }
  const rate = Number(settings.usd_to_blits_per_dollar);
  return Math.max(0, Math.round(amountUsd * rate));
}

export async function adjustCustomerBlitsWithClient(
  client: PoolClient,
  customerId: string,
  deltaBlits: bigint,
  kind: string,
  metadata: Record<string, unknown>
): Promise<{ balanceAfter: bigint; ledgerId: string }> {
  await client.query(
    `INSERT INTO customer_blits_wallet (customer_id, balance_blits) VALUES ($1, 0)
     ON CONFLICT (customer_id) DO NOTHING`,
    [customerId]
  );
  const locked = await client.query<{ balance_blits: string }>(
    `SELECT balance_blits FROM customer_blits_wallet WHERE customer_id = $1 FOR UPDATE`,
    [customerId]
  );
  const row = locked.rows[0];
  const cur = row ? BigInt(String(row.balance_blits)) : BigInt(0);
  const next = cur + deltaBlits;
  if (next < BigInt(0)) {
    throw new Error("INSUFFICIENT_BLITS");
  }
  await client.query(
    `UPDATE customer_blits_wallet SET balance_blits = $1::bigint, updated_at = NOW() WHERE customer_id = $2`,
    [next.toString(), customerId]
  );
  const id = randomUUID();
  await client.query(
    `INSERT INTO blits_ledger (id, customer_id, delta_blits, balance_after, kind, metadata)
     VALUES ($1, $2, $3::bigint, $4::bigint, $5, $6::jsonb)`,
    [id, customerId, deltaBlits.toString(), next.toString(), kind, JSON.stringify(metadata)]
  );
  return { balanceAfter: next, ledgerId: id };
}

export async function adjustCustomerBlits(
  customerId: string,
  deltaBlits: bigint,
  kind: string,
  metadata: Record<string, unknown> = {}
): Promise<{ balanceAfter: bigint; ledgerId: string | null }> {
  await ensureBlitsSchema();
  if (deltaBlits === BigInt(0)) {
    const row = await queryOne<{ balance_blits: string }>(
      `SELECT balance_blits FROM customer_blits_wallet WHERE customer_id = $1`,
      [customerId]
    );
    return { balanceAfter: row ? BigInt(String(row.balance_blits)) : BigInt(0), ledgerId: null };
  }

  return withTransaction(async (client: PoolClient) => {
    return adjustCustomerBlitsWithClient(client, customerId, deltaBlits, kind, metadata);
  });
}

/**
 * Atomically deduct Blits for a photo gift and record the event.
 */
export async function performPhotoGiftBlits(input: {
  customerId: string;
  affiliateId: string;
  postId: string | null;
  giftTypeId: string;
  costBlits: number;
}): Promise<{ balanceAfter: bigint }> {
  await ensureBlitsSchema();
  const cost = BigInt(Math.max(1, Math.floor(input.costBlits)));
  const giftEventId = randomUUID();
  return withTransaction(async (client: PoolClient) => {
    const { balanceAfter } = await adjustCustomerBlitsWithClient(
      client,
      input.customerId,
      -cost,
      "gift_sent",
      {
        affiliate_id: input.affiliateId,
        post_id: input.postId,
        gift_type_id: input.giftTypeId,
      }
    );
    await insertBlitsGiftEvent(client, {
      id: giftEventId,
      customerId: input.customerId,
      affiliateId: input.affiliateId,
      postId: input.postId,
      giftTypeId: input.giftTypeId,
      blitsSpent: cost,
    });
    return { balanceAfter };
  });
}

export async function getCustomerWalletLedger(customerId: string, limit = 50) {
  await ensureBlitsSchema();
  return await query<{
    id: string;
    delta_blits: string;
    balance_after: string;
    kind: string;
    metadata: unknown;
    created_at: string;
  }>(
    `SELECT id, delta_blits, balance_after, kind, metadata, created_at
     FROM blits_ledger
     WHERE customer_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [customerId, limit]
  );
}

export async function listBlitsGiftEventsAdmin(limit = 200) {
  await ensureBlitsSchema();
  return await query<{
    id: string;
    customer_id: string;
    affiliate_id: string;
    post_id: string | null;
    gift_type_id: string;
    blits_spent: string;
    created_at: string;
    affiliate_code: string;
    affiliate_email: string;
  }>(
    `SELECT g.id, g.customer_id, g.affiliate_id, g.post_id, g.gift_type_id, g.blits_spent, g.created_at,
            a.code AS affiliate_code, a.email AS affiliate_email
     FROM blits_gift_event g
     JOIN affiliate a ON a.id = g.affiliate_id
     ORDER BY g.created_at DESC
     LIMIT $1`,
    [limit]
  );
}

export async function insertBlitsGiftEvent(
  client: PoolClient,
  input: {
    id: string;
    customerId: string;
    affiliateId: string;
    postId: string | null;
    giftTypeId: string;
    blitsSpent: bigint;
  }
) {
  await client.query(
    `INSERT INTO blits_gift_event (id, customer_id, affiliate_id, post_id, gift_type_id, blits_spent, created_at)
     VALUES ($1, $2, $3, $4, $5, $6::bigint, NOW())`,
    [
      input.id,
      input.customerId,
      input.affiliateId,
      input.postId,
      input.giftTypeId,
      input.blitsSpent.toString(),
    ]
  );
}
