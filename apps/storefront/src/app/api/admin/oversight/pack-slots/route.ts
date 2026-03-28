import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const deny = await requireAdminRequest(req);
    if (deny) return deny;

    const campaignId = (req.nextUrl.searchParams.get("campaign_id") || "").trim();
    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    const limit = Math.min(400, Math.max(20, Number(req.nextUrl.searchParams.get("limit") || 200)));

    const conditions: string[] = ["s.deleted_at IS NULL", "c.deleted_at IS NULL"];
    const params: unknown[] = [];
    let p = 1;

    if (campaignId) {
      conditions.push(`s.pack_campaign_id = $${p}`);
      params.push(campaignId);
      p += 1;
    }
    if (q) {
      conditions.push(
        `(s.collection_code ILIKE $${p} OR s.order_id ILIKE $${p} OR s.id ILIKE $${p}
          OR c.public_code ILIKE $${p} OR COALESCE(ca.email,'') ILIKE $${p})`
      );
      params.push(`%${q}%`);
      p += 1;
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const slots = await query<{
      id: string;
      pack_campaign_id: string;
      variant_id: string;
      size_label: string;
      status: string;
      customer_id: string | null;
      order_id: string | null;
      line_item_id: string | null;
      collection_code: string | null;
      metadata: unknown;
      created_at: string;
      updated_at: string;
      campaign_public_code: string;
      campaign_status: string;
      pack_title: string;
      affiliate_code: string | null;
      storefront_email: string | null;
    }>(
      `SELECT s.id, s.pack_campaign_id, s.variant_id, s.size_label, s.status, s.customer_id, s.order_id, s.line_item_id,
              s.collection_code, s.metadata, s.created_at::text, s.updated_at::text,
              c.public_code AS campaign_public_code, c.status AS campaign_status,
              d.title AS pack_title, a.code AS affiliate_code,
              ca.email AS storefront_email
       FROM pack_slot s
       INNER JOIN pack_campaign c ON c.id = s.pack_campaign_id
       INNER JOIN pack_definition d ON d.id = c.pack_definition_id AND d.deleted_at IS NULL
       LEFT JOIN affiliate a ON a.id = c.affiliate_id
       LEFT JOIN customer_account ca ON ca.id = COALESCE(
         NULLIF(trim(s.metadata->>'storefront_customer_id'), ''),
         CASE
           WHEN s.customer_id IS NOT NULL AND s.customer_id !~ '^cus_'
           THEN s.customer_id
           ELSE NULL
         END
       )
       ${where}
       ORDER BY s.updated_at DESC
       LIMIT ${limit}`,
      params
    );

    return NextResponse.json({ slots });
  } catch (e) {
    console.error("[admin/oversight/pack-slots]", e);
    return NextResponse.json({ error: "Failed to load pack slots." }, { status: 500 });
  }
}
