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

    const affiliateId = String(req.nextUrl.searchParams.get("affiliate_id") || "").trim();
    if (!affiliateId) {
      return NextResponse.json({ error: "affiliate_id is required." }, { status: 400 });
    }

    const rows = await query<Record<string, unknown>>(
      `SELECT m.id, m.affiliate_id, m.from_admin, m.body, m.read_at, m.created_at, a.code, a.email
       FROM affiliate_admin_message m
       INNER JOIN affiliate a ON a.id = m.affiliate_id
       WHERE m.affiliate_id = $1
       ORDER BY m.created_at DESC
       LIMIT 200`,
      [affiliateId]
    );

    return NextResponse.json({ messages: rows });
  } catch (error) {
    console.error("[API /admin/affiliate/messages] GET error:", error);
    return NextResponse.json({ error: "Failed to load messages." }, { status: 500 });
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
    const text = String(body.body || "").trim();
    if (!affiliateId || !text) {
      return NextResponse.json({ error: "affiliate_id and body are required." }, { status: 400 });
    }

    const id = randomUUID();
    await execute(
      `INSERT INTO affiliate_admin_message (id, affiliate_id, from_admin, body, created_at)
       VALUES ($1, $2, true, $3, NOW())`,
      [id, affiliateId, text]
    );

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("[API /admin/affiliate/messages] POST error:", error);
    return NextResponse.json({ error: "Failed to send message." }, { status: 500 });
  }
}
