import { execute, query, queryOne } from "@/lib/db";
import { randomUUID } from "crypto";

export type AffiliateStatus = "active" | "inactive" | "pending";
export type PayoutMethod = "bank_transfer" | "paypal" | "stripe";

export interface AffiliateRecord {
  id: string;
  code: string;
  first_name: string;
  last_name: string;
  email: string;
  commission_rate: number;
  status: AffiliateStatus;
  total_earnings: string;
  paid_out: string;
  metadata: Record<string, unknown> | null;
}

export interface AffiliateSaleRecord {
  id: string;
  affiliate_id: string;
  order_id: string;
  order_total: string;
  commission_amount: string;
  currency_code: string;
  status: "pending" | "approved" | "rejected";
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AffiliatePayoutRecord {
  id: string;
  affiliate_id: string;
  amount: string;
  currency_code: string;
  method: PayoutMethod;
  status: "pending" | "processing" | "completed" | "failed";
  reference: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const MIN_PAYOUT_THRESHOLD = 50;
let ensureTablesPromise: Promise<void> | null = null;

async function ensureAffiliateTables() {
  if (!ensureTablesPromise) {
    ensureTablesPromise = (async () => {
      await execute(
        `CREATE TABLE IF NOT EXISTS affiliate (
          id text PRIMARY KEY,
          code text UNIQUE NOT NULL,
          first_name text NOT NULL,
          last_name text NOT NULL,
          email text UNIQUE NOT NULL,
          commission_rate numeric NOT NULL DEFAULT 10,
          status text NOT NULL DEFAULT 'pending',
          total_earnings numeric NOT NULL DEFAULT 0,
          paid_out numeric NOT NULL DEFAULT 0,
          metadata jsonb NULL,
          created_at timestamptz NOT NULL DEFAULT NOW(),
          updated_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS affiliate_sale (
          id text PRIMARY KEY,
          affiliate_id text NOT NULL REFERENCES affiliate(id) ON DELETE CASCADE,
          order_id text NOT NULL,
          order_total numeric NOT NULL,
          commission_amount numeric NOT NULL,
          currency_code text NOT NULL DEFAULT 'usd',
          status text NOT NULL DEFAULT 'pending',
          metadata jsonb NULL,
          created_at timestamptz NOT NULL DEFAULT NOW(),
          updated_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );

      await execute(
        `CREATE TABLE IF NOT EXISTS affiliate_payout (
          id text PRIMARY KEY,
          affiliate_id text NOT NULL REFERENCES affiliate(id) ON DELETE CASCADE,
          amount numeric NOT NULL,
          currency_code text NOT NULL DEFAULT 'usd',
          method text NOT NULL DEFAULT 'bank_transfer',
          status text NOT NULL DEFAULT 'pending',
          reference text NULL,
          notes text NULL,
          metadata jsonb NULL,
          created_at timestamptz NOT NULL DEFAULT NOW(),
          updated_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );
    })();
  }

  await ensureTablesPromise;
}

export async function ensureAffiliateSchema() {
  await ensureAffiliateTables();
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function generateAffiliateCode(firstName: string, lastName: string) {
  const base = `${firstName}${lastName}`.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const prefix = (base || "AFF").slice(0, 8);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}${suffix}`;
}

export async function getAffiliateByEmail(email: string) {
  await ensureAffiliateTables();
  return await queryOne<AffiliateRecord>(
    `SELECT id, code, first_name, last_name, email, commission_rate, status, total_earnings, paid_out, metadata
     FROM affiliate
     WHERE lower(email) = lower($1)
     LIMIT 1`,
    [email]
  );
}

export async function getAffiliateByCode(code: string) {
  await ensureAffiliateTables();
  return await queryOne<AffiliateRecord>(
    `SELECT id, code, first_name, last_name, email, commission_rate, status, total_earnings, paid_out, metadata
     FROM affiliate
     WHERE lower(code) = lower($1)
     LIMIT 1`,
    [code]
  );
}

export async function createAffiliateApplication(input: {
  firstName: string;
  lastName: string;
  email: string;
  notes?: string;
}) {
  await ensureAffiliateTables();
  const existing = await getAffiliateByEmail(input.email);
  if (existing) return existing;

  const code = generateAffiliateCode(input.firstName, input.lastName);
  await execute(
    `INSERT INTO affiliate
      (id, code, first_name, last_name, email, commission_rate, status, total_earnings, paid_out, metadata, created_at, updated_at)
     VALUES
      ($1, $2, $3, $4, $5, 10, 'pending', 0, 0, $6::jsonb, NOW(), NOW())`,
    [
      randomUUID(),
      code,
      input.firstName,
      input.lastName,
      input.email,
      JSON.stringify({
        application_notes: input.notes || "",
        source: "storefront-application",
      }),
    ]
  );

  const created = await getAffiliateByEmail(input.email);
  if (!created) throw new Error("Failed to create affiliate application");
  return created;
}

export async function listAffiliateSales(affiliateId: string, limit = 50) {
  await ensureAffiliateTables();
  return await query<AffiliateSaleRecord>(
    `SELECT id, affiliate_id, order_id, order_total, commission_amount, currency_code, status, metadata, created_at
     FROM affiliate_sale
     WHERE affiliate_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [affiliateId, limit]
  );
}

export async function listAffiliatePayouts(affiliateId: string, limit = 20) {
  await ensureAffiliateTables();
  return await query<AffiliatePayoutRecord>(
    `SELECT id, affiliate_id, amount, currency_code, method, status, reference, notes, metadata, created_at
     FROM affiliate_payout
     WHERE affiliate_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [affiliateId, limit]
  );
}

export async function get30DayEarningsSeries(affiliateId: string) {
  await ensureAffiliateTables();
  const rows = await query<{ day: string; amount: string }>(
    `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
            COALESCE(SUM(commission_amount), 0)::text AS amount
     FROM affiliate_sale
     WHERE affiliate_id = $1
       AND status = 'approved'
       AND created_at >= NOW() - INTERVAL '30 days'
     GROUP BY 1
     ORDER BY 1 ASC`,
    [affiliateId]
  );

  const map = new Map(rows.map((r) => [r.day, toNumber(r.amount)]));
  const points: Array<{ day: string; amount: number }> = [];
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    points.push({ day: key, amount: map.get(key) ?? 0 });
  }
  return points;
}

export function computeAvailableBalance(affiliate: AffiliateRecord, payouts: AffiliatePayoutRecord[]) {
  const total = toNumber(affiliate.total_earnings);
  const paidOut = toNumber(affiliate.paid_out);
  const pending = payouts
    .filter((p) => p.status === "pending" || p.status === "processing")
    .reduce((sum, payout) => sum + toNumber(payout.amount), 0);
  return Math.max(0, total - paidOut - pending);
}

export async function createCommissionFromOrder(input: {
  affiliateCode: string;
  orderId: string;
  orderTotal: number;
  currencyCode?: string;
  metadata?: Record<string, unknown>;
}) {
  await ensureAffiliateTables();
  const affiliate = await getAffiliateByCode(input.affiliateCode);
  if (!affiliate || affiliate.status !== "active") return null;

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM affiliate_sale WHERE order_id = $1 AND affiliate_id = $2 LIMIT 1`,
    [input.orderId, affiliate.id]
  );
  if (existing) return affiliate;

  const commissionAmount = Number(
    ((input.orderTotal * affiliate.commission_rate) / 100).toFixed(2)
  );

  await execute(
    `INSERT INTO affiliate_sale
      (id, affiliate_id, order_id, order_total, commission_amount, currency_code, status, metadata, created_at, updated_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, 'approved', $7::jsonb, NOW(), NOW())`,
    [
      randomUUID(),
      affiliate.id,
      input.orderId,
      input.orderTotal,
      commissionAmount,
      input.currencyCode || "usd",
      JSON.stringify(input.metadata || {}),
    ]
  );

  await execute(
    `UPDATE affiliate
     SET total_earnings = COALESCE(total_earnings, 0) + $1,
         updated_at = NOW()
     WHERE id = $2`,
    [commissionAmount, affiliate.id]
  );

  return await getAffiliateByCode(input.affiliateCode);
}

export async function requestAffiliatePayout(input: {
  affiliate: AffiliateRecord;
  amount: number;
  method: PayoutMethod;
  notes?: string;
  details?: Record<string, unknown>;
}) {
  await ensureAffiliateTables();
  const payouts = await listAffiliatePayouts(input.affiliate.id, 100);
  const available = computeAvailableBalance(input.affiliate, payouts);

  if (input.amount < MIN_PAYOUT_THRESHOLD) {
    throw new Error(`Minimum payout amount is $${MIN_PAYOUT_THRESHOLD}`);
  }
  if (input.amount > available) {
    throw new Error("Requested payout exceeds available balance");
  }

  await execute(
    `INSERT INTO affiliate_payout
      (id, affiliate_id, amount, currency_code, method, status, notes, metadata, created_at, updated_at)
     VALUES
      ($1, $2, $3, 'usd', $4, 'pending', $5, $6::jsonb, NOW(), NOW())`,
    [
      randomUUID(),
      input.affiliate.id,
      input.amount,
      input.method,
      input.notes || null,
      JSON.stringify(input.details || {}),
    ]
  );
}

export function getPayoutThreshold() {
  return MIN_PAYOUT_THRESHOLD;
}
