import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import {
  adjustCustomerBlitsWithClient,
  computeCheckoutUsdAndBlits,
  ensureBlitsSchema,
  getPlatformBlitsSettings,
} from "@/lib/blits";
import { queryOne, withTransaction } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Deducts Blits toward the order (subtotal after Blits discount + shipping).
 * Omit `blitsToUse` to charge the full order in Blits (legacy "Pay with Blits").
 * Send `blitsToUse` (positive integer) for partial wallet + card/mobile split.
 *
 * Optional `Idempotency-Key` header or `idempotencyKey` in body: duplicate requests return the same
 * JSON without double-charging (use when the client retries after network errors).
 */
export async function POST(req: NextRequest) {
  try {
    const customer = await getCurrentCustomer();
    const customerId = customer?.id != null ? String(customer.id) : "";
    if (!customerId) {
      return NextResponse.json({ error: "Login required." }, { status: 401 });
    }

    const body = await req.json();
    const subtotalUsd = Number(body.subtotalUsd ?? body.subtotal_usd);
    const shippingUsd = Number(body.shippingUsd ?? body.shipping_usd);
    if (!Number.isFinite(subtotalUsd) || !Number.isFinite(shippingUsd) || subtotalUsd < 0 || shippingUsd < 0) {
      return NextResponse.json({ error: "Invalid totals." }, { status: 400 });
    }

    const settings = await getPlatformBlitsSettings();
    if (!settings) {
      return NextResponse.json({ error: "Blits not configured." }, { status: 500 });
    }

    const usdToBlits = Number(settings.usd_to_blits_per_dollar);
    const disc = Number(settings.product_discount_percent_paying_blits);
    const { payableUsd, blitsRequired } = computeCheckoutUsdAndBlits({
      subtotalUsd,
      shippingUsd,
      productDiscountPercent: disc,
      usdToBlitsPerDollar: usdToBlits,
    });

    if (payableUsd <= 0) {
      return NextResponse.json({ error: "Order total must be greater than zero." }, { status: 400 });
    }

    const requestedRaw = body.blitsToUse ?? body.blits_to_use;
    const partialIntent = requestedRaw != null && requestedRaw !== "";

    const idempotencyKeyRaw = req.headers.get("Idempotency-Key")?.trim() || String(body.idempotencyKey ?? "").trim();
    const idempotencyKey = idempotencyKeyRaw || null;

    // Pre-validate (friendly errors before hitting the wallet transaction).
    await ensureBlitsSchema();
    const walletRow = await queryOne<{ balance_blits: string }>(
      `SELECT balance_blits FROM customer_blits_wallet WHERE customer_id = $1`,
      [customerId]
    );
    const balanceBlits = walletRow ? BigInt(String(walletRow.balance_blits)) : BigInt(0);

    let blitsToCharge: bigint;

    if (partialIntent) {
      const req = Math.floor(Number(requestedRaw));
      if (!Number.isFinite(req) || req < 0) {
        return NextResponse.json({ error: "Invalid blitsToUse." }, { status: 400 });
      }
      if (req === 0) {
        return NextResponse.json(
          { error: "Use card-only checkout when not applying Blits." },
          { status: 400 }
        );
      }
      blitsToCharge = BigInt(Math.min(req, blitsRequired));
      if (blitsToCharge > balanceBlits) {
        blitsToCharge = balanceBlits;
      }
      if (blitsToCharge === BigInt(0)) {
        return NextResponse.json({ error: "Insufficient Blits." }, { status: 400 });
      }
    } else {
      blitsToCharge = BigInt(blitsRequired);
      if (blitsToCharge > balanceBlits) {
        return NextResponse.json({ error: "Insufficient Blits for this order." }, { status: 400 });
      }
    }

    const blitsNum = Number(blitsToCharge);
    const usdFromBlits = usdToBlits > 0 ? blitsNum / usdToBlits : 0;
    let remainderUsd = Math.round((payableUsd - usdFromBlits) * 1e6) / 1e6;
    if (remainderUsd < 0) remainderUsd = 0;

    const baseMetadata = {
      payable_usd: payableUsd,
      subtotal_usd: subtotalUsd,
      shipping_usd: shippingUsd,
      blits: blitsNum,
      blits_required_full_order: blitsRequired,
      usd_from_blits: usdFromBlits,
      remainder_usd: remainderUsd,
      partial: blitsNum < blitsRequired,
      ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    };

    const result = await withTransaction(async (client) => {
      if (idempotencyKey) {
        await client.query(`SELECT pg_advisory_xact_lock((hashtext($1::text))::bigint)`, [idempotencyKey]);
        const existing = await client.query<{ response_json: unknown }>(
          `SELECT response_json FROM blits_checkout_idempotency WHERE idempotency_key = $1 AND customer_id = $2`,
          [idempotencyKey, customerId]
        );
        const row = existing.rows[0];
        if (row?.response_json) {
          const parsed =
            typeof row.response_json === "string" ? JSON.parse(row.response_json) : row.response_json;
          return { kind: "cached" as const, body: parsed as Record<string, unknown> };
        }
      }

      const { balanceAfter, ledgerId } = await adjustCustomerBlitsWithClient(
        client,
        customerId,
        BigInt(-blitsNum),
        "checkout_payment",
        baseMetadata
      );

      const responseJson = {
        ok: true,
        blitsCharged: blitsNum,
        payableUsd,
        remainderUsd,
        usdFromBlits,
        balanceAfter: balanceAfter.toString(),
        ...(idempotencyKey ? { idempotencyKey } : {}),
      };

      if (idempotencyKey) {
        await client.query(
          `INSERT INTO blits_checkout_idempotency (idempotency_key, customer_id, response_json, ledger_id)
           VALUES ($1, $2, $3::jsonb, $4)`,
          [idempotencyKey, customerId, JSON.stringify(responseJson), ledgerId]
        );
      }

      return { kind: "fresh" as const, body: responseJson };
    });

    return NextResponse.json(result.body);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg === "INSUFFICIENT_BLITS") {
      return NextResponse.json({ error: "Insufficient Blits for this order." }, { status: 400 });
    }
    console.error("[API /blits/checkout-pay] error:", error);
    return NextResponse.json({ error: "Payment failed." }, { status: 500 });
  }
}
