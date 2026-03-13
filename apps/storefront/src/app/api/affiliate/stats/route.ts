import { NextRequest, NextResponse } from "next/server";
import {
  computeAvailableBalance,
  get30DayEarningsSeries,
  getAffiliateByCode,
  getAffiliateByEmail,
  getPayoutThreshold,
  listAffiliatePayouts,
  listAffiliateSales,
} from "@/lib/affiliate";

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

    const sales = await listAffiliateSales(affiliate.id, 200);
    const payouts = await listAffiliatePayouts(affiliate.id, 30);
    const chart = await get30DayEarningsSeries(affiliate.id);

    const totalSales = sales.reduce((sum, s) => sum + Number(s.order_total || 0), 0);
    const totalEarnings = Number(affiliate.total_earnings || 0);
    const availableBalance = computeAvailableBalance(affiliate, payouts);

    const forwardedHost = req.headers.get("x-forwarded-host");
    const host = forwardedHost || req.headers.get("host") || "localhost:3000";
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const publicOrigin = `${protocol}://${host}`;

    return NextResponse.json({
      affiliate: {
        id: affiliate.id,
        code: affiliate.code,
        name: `${affiliate.first_name} ${affiliate.last_name}`.trim(),
        email: affiliate.email,
        status: affiliate.status,
      },
      stats: {
        totalEarnings,
        availableBalance,
        totalSales,
        commissionRate: affiliate.commission_rate,
        minPayoutThreshold: getPayoutThreshold(),
      },
      chart,
      payoutHistory: payouts,
      link: `${publicOrigin}/affiliate/shop/${affiliate.code}?ref=${affiliate.code}`,
    });
  } catch (error) {
    console.error("[API /affiliate/stats] error:", error);
    return NextResponse.json({ error: "Failed to fetch affiliate stats." }, { status: 500 });
  }
}
