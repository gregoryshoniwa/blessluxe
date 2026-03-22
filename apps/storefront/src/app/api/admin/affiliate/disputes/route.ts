import { NextRequest, NextResponse } from "next/server";
import { execute, query } from "@/lib/db";
import { ensureAffiliateSchema } from "@/lib/affiliate";
import { ensureBlitsSchema } from "@/lib/blits";
import { requireAdminRequest } from "@/lib/admin-auth";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const denyResponse = await requireAdminRequest(req);
    if (denyResponse) return denyResponse;

    await ensureAffiliateSchema();
    await ensureBlitsSchema();

    const rows = await query<Record<string, unknown>>(
      `SELECT d.id, d.affiliate_id, d.customer_email, d.order_ref, d.subject, d.body, d.status, d.admin_notes,
              d.created_at, a.code, a.email AS affiliate_email
       FROM affiliate_dispute d
       LEFT JOIN affiliate a ON a.id = d.affiliate_id
       ORDER BY d.created_at DESC
       LIMIT 200`
    );

    return NextResponse.json({ disputes: rows });
  } catch (error) {
    console.error("[API /admin/affiliate/disputes] GET error:", error);
    return NextResponse.json({ error: "Failed to load disputes." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const denyResponse = await requireAdminRequest(req);
    if (denyResponse) return denyResponse;

    await ensureAffiliateSchema();
    await ensureBlitsSchema();

    const body = await req.json();
    const affiliateId = String(body.affiliate_id || "").trim();
    const subject = String(body.subject || "").trim();
    const disputeBody = String(body.body || "").trim();
    const customerEmail = body.customer_email ? String(body.customer_email) : null;
    const orderRef = body.order_ref ? String(body.order_ref) : null;
    if (!affiliateId || !subject || !disputeBody) {
      return NextResponse.json({ error: "affiliate_id, subject, and body are required." }, { status: 400 });
    }

    const id = randomUUID();
    await execute(
      `INSERT INTO affiliate_dispute (id, affiliate_id, customer_email, order_ref, subject, body, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'open', NOW(), NOW())`,
      [id, affiliateId, customerEmail, orderRef, subject, disputeBody]
    );

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("[API /admin/affiliate/disputes] POST error:", error);
    return NextResponse.json({ error: "Failed to create dispute." }, { status: 500 });
  }
}
