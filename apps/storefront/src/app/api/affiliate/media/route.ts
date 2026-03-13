import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import { getAffiliateByCode, listAffiliateMediaAssets } from "@/lib/affiliate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer?.email) {
      return NextResponse.json({ error: "Login required." }, { status: 401 });
    }
    const code = String(req.nextUrl.searchParams.get("code") || "").trim();
    if (!code) {
      return NextResponse.json({ error: "Affiliate code is required." }, { status: 400 });
    }
    const affiliate = await getAffiliateByCode(code);
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found." }, { status: 404 });
    }
    if (String(affiliate.email).toLowerCase() !== String(customer.email).toLowerCase()) {
      return NextResponse.json({ error: "Only owner can view media." }, { status: 403 });
    }
    const media = await listAffiliateMediaAssets(String(affiliate.id));
    return NextResponse.json({ media });
  } catch (error) {
    console.error("[API /affiliate/media] GET error:", error);
    return NextResponse.json({ error: "Failed to load media." }, { status: 500 });
  }
}

