import { NextRequest, NextResponse } from "next/server";
import { getPackSlotByCollectionCode } from "@/lib/packs";

export const dynamic = "force-dynamic";

/** Verify a pack collection code (pickup / tracking). No auth — keep codes private. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const row = await getPackSlotByCollectionCode(decodeURIComponent(code));
    if (!row) {
      return NextResponse.json({ error: "Code not found." }, { status: 404 });
    }
    return NextResponse.json({
      collection_code: row.collection_code,
      pack_title: row.pack_title,
      size_label: row.size_label,
      slot_status: row.status,
      campaign_status: row.campaign_status,
      campaign_public_code: row.campaign_public_code,
      affiliate_code: row.affiliate_code,
    });
  } catch (e) {
    console.error("[API /pack-collection] GET", e);
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }
}
