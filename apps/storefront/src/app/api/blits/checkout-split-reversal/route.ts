import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import { adjustCustomerBlitsWithClient, ensureBlitsSchema } from "@/lib/blits";
import { withTransaction } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Credits Blits back after a split checkout when the cash leg failed after Blits were debited.
 * Idempotent: safe to retry with the same `idempotencyKey` as `/api/blits/checkout-pay`.
 */
export async function POST(req: NextRequest) {
  try {
    const customer = await getCurrentCustomer();
    const customerId = customer?.id != null ? String(customer.id) : "";
    if (!customerId) {
      return NextResponse.json({ error: "Login required." }, { status: 401 });
    }

    const body = await req.json();
    const idempotencyKey = String(body.idempotencyKey ?? "").trim();
    if (!idempotencyKey) {
      return NextResponse.json({ error: "idempotencyKey is required." }, { status: 400 });
    }

    await ensureBlitsSchema();

    const out = await withTransaction(async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock((hashtext($1::text))::bigint)`, [idempotencyKey]);

      const del = await client.query<{ response_json: unknown }>(
        `DELETE FROM blits_checkout_idempotency
         WHERE idempotency_key = $1 AND customer_id = $2
         RETURNING response_json`,
        [idempotencyKey, customerId]
      );

      const row = del.rows[0];
      if (row?.response_json) {
        const parsed =
          typeof row.response_json === "string" ? JSON.parse(row.response_json) : row.response_json;
        const charged = Number((parsed as { blitsCharged?: number }).blitsCharged);
        if (!Number.isFinite(charged) || charged <= 0) {
          throw new Error("INVALID_CHECKOUT_RECORD");
        }
        await adjustCustomerBlitsWithClient(client, customerId, BigInt(Math.floor(charged)), "checkout_split_refund", {
          idempotency_key: idempotencyKey,
          reason: "cash_leg_failed",
          original_blits_charged: charged,
        });
        return { ok: true as const, blitsRefunded: charged, alreadyReversed: false as const };
      }

      const existingRefund = await client.query<{ id: string }>(
        `SELECT id FROM blits_ledger
         WHERE customer_id = $1
           AND kind = 'checkout_split_refund'
           AND metadata->>'idempotency_key' = $2
         LIMIT 1`,
        [customerId, idempotencyKey]
      );
      if (existingRefund.rows[0]) {
        return { ok: true as const, blitsRefunded: 0, alreadyReversed: true as const };
      }

      return { ok: false as const, error: "not_found" as const };
    });

    if (!out.ok) {
      return NextResponse.json(
        { error: "No pending Blits debit found for this key. It may have already been reversed." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      blitsRefunded: out.blitsRefunded,
      alreadyReversed: out.alreadyReversed,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg === "INVALID_CHECKOUT_RECORD") {
      return NextResponse.json({ error: "Invalid checkout record." }, { status: 500 });
    }
    console.error("[API /blits/checkout-split-reversal] error:", error);
    return NextResponse.json({ error: "Reversal failed." }, { status: 500 });
  }
}
