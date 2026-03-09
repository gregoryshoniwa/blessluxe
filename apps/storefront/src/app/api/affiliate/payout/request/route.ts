import { NextRequest, NextResponse } from "next/server";
import { getAffiliateByCode, getAffiliateByEmail, requestAffiliatePayout } from "@/lib/affiliate";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email || "").trim();
    const code = String(body.code || "").trim();
    const amount = Number(body.amount || 0);
    const method = String(body.method || "bank_transfer") as
      | "bank_transfer"
      | "paypal"
      | "stripe";
    const notes = String(body.notes || "").trim();
    const details = (body.details || {}) as Record<string, unknown>;

    const affiliate =
      (email && (await getAffiliateByEmail(email))) ||
      (code && (await getAffiliateByCode(code))) ||
      null;
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found." }, { status: 404 });
    }
    if (affiliate.status !== "active") {
      return NextResponse.json(
        { error: "Affiliate account must be active before requesting payout." },
        { status: 400 }
      );
    }
    if (!["bank_transfer", "paypal", "stripe"].includes(method)) {
      return NextResponse.json({ error: "Invalid payout method." }, { status: 400 });
    }

    await requestAffiliatePayout({
      affiliate,
      amount,
      method,
      notes,
      details,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to request payout.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
