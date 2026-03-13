import { NextRequest, NextResponse } from "next/server";
import { getAffiliateByCode, toggleAffiliateFollow } from "@/lib/affiliate";
import { getCurrentCustomer } from "@/lib/customer-account";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer?.id) {
      return NextResponse.json({ error: "Login required to follow affiliates." }, { status: 401 });
    }

    const body = await req.json();
    const code = String(body.code || "").trim();
    if (!code) {
      return NextResponse.json({ error: "Affiliate code is required." }, { status: 400 });
    }

    const affiliate = await getAffiliateByCode(code);
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found." }, { status: 404 });
    }

    const result = await toggleAffiliateFollow(affiliate.id, String(customer.id));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[API /affiliate/social/follow] error:", error);
    return NextResponse.json({ error: "Failed to toggle follow." }, { status: 500 });
  }
}

