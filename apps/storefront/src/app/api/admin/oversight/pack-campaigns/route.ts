import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const deny = await requireAdminRequest(req);
    if (deny) return deny;

    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    const status = (req.nextUrl.searchParams.get("status") || "").trim();
    const limit = Math.min(300, Math.max(10, Number(req.nextUrl.searchParams.get("limit") || 150)));

    const conditions: string[] = ["c.deleted_at IS NULL"];
    const params: unknown[] = [];
    let p = 1;

    if (q) {
      conditions.push(
        `(c.id ILIKE $${p} OR c.public_code ILIKE $${p} OR d.title ILIKE $${p} OR COALESCE(a.code,'') ILIKE $${p} OR COALESCE(a.email,'') ILIKE $${p})`
      );
      params.push(`%${q}%`);
      p += 1;
    }
    if (status) {
      conditions.push(`c.status = $${p}`);
      params.push(status);
      p += 1;
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const campaigns = await query<{
      id: string;
      public_code: string;
      status: string;
      pack_definition_id: string;
      pack_title: string;
      affiliate_id: string | null;
      affiliate_code: string | null;
      affiliate_email: string | null;
      gift_countdown_ends_at: string | null;
      gift_blits_prize: string | null;
      gift_allocation_type: string | null;
      created_at: string;
      updated_at: string;
      slot_count: string;
      paid_count: string;
      reserved_count: string;
    }>(
      `SELECT c.id, c.public_code, c.status, c.pack_definition_id, d.title AS pack_title,
              c.affiliate_id, a.code AS affiliate_code, a.email AS affiliate_email,
              c.gift_countdown_ends_at::text, c.gift_blits_prize::text, c.gift_allocation_type,
              c.created_at::text, c.updated_at::text,
              (SELECT COUNT(*)::text FROM pack_slot s WHERE s.pack_campaign_id = c.id AND s.deleted_at IS NULL) AS slot_count,
              (SELECT COUNT(*)::text FROM pack_slot s WHERE s.pack_campaign_id = c.id AND s.status = 'paid' AND s.deleted_at IS NULL) AS paid_count,
              (SELECT COUNT(*)::text FROM pack_slot s WHERE s.pack_campaign_id = c.id AND s.status = 'reserved' AND s.deleted_at IS NULL) AS reserved_count
       FROM pack_campaign c
       INNER JOIN pack_definition d ON d.id = c.pack_definition_id AND d.deleted_at IS NULL
       LEFT JOIN affiliate a ON a.id = c.affiliate_id
       ${where}
       ORDER BY c.updated_at DESC
       LIMIT ${limit}`,
      params
    );

    return NextResponse.json({ campaigns });
  } catch (e) {
    console.error("[admin/oversight/pack-campaigns]", e);
    return NextResponse.json({ error: "Failed to load pack campaigns." }, { status: 500 });
  }
}
