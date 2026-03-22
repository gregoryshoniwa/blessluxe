import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import { ensureBlitsSchema, performPhotoGiftBlits } from "@/lib/blits";
import { getAffiliateByCode, getAffiliateSocialPostById } from "@/lib/affiliate";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const customer = await getCurrentCustomer();
    const customerId = customer?.id != null ? String(customer.id) : "";
    if (!customerId) {
      return NextResponse.json({ error: "Login required." }, { status: 401 });
    }

    const body = await req.json();
    const affiliateCode = String(body.affiliate_code || body.affiliateCode || "").trim();
    const giftTypeId = String(body.gift_type_id || body.giftTypeId || "").trim();
    const postIdRaw = body.post_id ?? body.postId;
    const postId = postIdRaw != null && String(postIdRaw).trim() !== "" ? String(postIdRaw).trim() : null;

    if (!affiliateCode || !giftTypeId) {
      return NextResponse.json({ error: "affiliate_code and gift_type_id are required." }, { status: 400 });
    }

    const affiliate = await getAffiliateByCode(affiliateCode);
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found." }, { status: 404 });
    }

    await ensureBlitsSchema();
    const gt = await queryOne<{ id: string; cost_blits: string }>(
      `SELECT id, cost_blits FROM blits_gift_type WHERE id = $1 AND active = true`,
      [giftTypeId]
    );
    if (!gt) {
      return NextResponse.json({ error: "Gift type not found." }, { status: 404 });
    }

    if (postId) {
      const post = await getAffiliateSocialPostById(postId);
      if (!post || String(post.affiliate_id) !== affiliate.id) {
        return NextResponse.json({ error: "Invalid post for this affiliate." }, { status: 400 });
      }
    }

    const cost = Number(gt.cost_blits);
    const { balanceAfter } = await performPhotoGiftBlits({
      customerId,
      affiliateId: String(affiliate.id),
      postId,
      giftTypeId: String(gt.id),
      costBlits: cost,
    });

    return NextResponse.json({ ok: true, balanceAfter: balanceAfter.toString() });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg === "INSUFFICIENT_BLITS") {
      return NextResponse.json({ error: "Insufficient Blits balance." }, { status: 400 });
    }
    console.error("[API /blits/gift] error:", error);
    return NextResponse.json({ error: "Gift failed." }, { status: 500 });
  }
}
