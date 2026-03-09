import { NextRequest, NextResponse } from "next/server";
import { getAffiliateByCode, getAffiliateByEmail, listAffiliateSales } from "@/lib/affiliate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const email = req.nextUrl.searchParams.get("email");
    const code = req.nextUrl.searchParams.get("code");

    const affiliate =
      (email && (await getAffiliateByEmail(email))) ||
      (code && (await getAffiliateByCode(code))) ||
      null;

    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found." }, { status: 404 });
    }

    const sales = await listAffiliateSales(affiliate.id, 100);
    return NextResponse.json({ sales });
  } catch (error) {
    console.error("[API /affiliate/sales] error:", error);
    return NextResponse.json({ error: "Failed to fetch affiliate sales." }, { status: 500 });
  }
}
