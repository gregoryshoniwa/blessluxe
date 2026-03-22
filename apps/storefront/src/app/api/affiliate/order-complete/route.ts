import { NextRequest, NextResponse } from "next/server";
import { createCommissionsFromAttributedLineItems } from "@/lib/affiliate";
import { AFFILIATE_COMMISSION_COOKIE } from "@/lib/affiliate-attribution";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const orderId = String(body.orderId || "").trim();
    const currencyCode = String(body.currencyCode || "usd").toLowerCase();
    const rawLines = Array.isArray(body.lineItems) ? body.lineItems : [];
    const affiliateCommissionCookieRef = String(
      req.cookies.get(AFFILIATE_COMMISSION_COOKIE)?.value || ""
    ).trim();

    const lineItems = rawLines.map((row: Record<string, unknown>) => ({
      affiliateCode: row.affiliateCode ? String(row.affiliateCode).trim() : undefined,
      quantity: Number(row.quantity) || 0,
      unitPrice: Number(row.unitPrice) || 0,
    }));

    const hasAttributedLines = lineItems.some(
      (l: { affiliateCode?: string; quantity: number; unitPrice: number }) =>
        Boolean(l.affiliateCode) && l.quantity > 0 && Number.isFinite(l.unitPrice) && l.unitPrice > 0
    );

    if (!orderId || !hasAttributedLines) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    await createCommissionsFromAttributedLineItems({
      orderId,
      currencyCode,
      lineItems,
      affiliateCommissionCookieRef: affiliateCommissionCookieRef || undefined,
      metadata: {
        source: "storefront-checkout",
        affiliate_commission_cookie: affiliateCommissionCookieRef || null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /affiliate/order-complete] error:", error);
    return NextResponse.json({ error: "Failed to track affiliate commission." }, { status: 500 });
  }
}
