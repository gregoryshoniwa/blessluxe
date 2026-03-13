import { NextRequest, NextResponse } from "next/server";
import { createAffiliateApplication } from "@/lib/affiliate";
import { getCurrentCustomer } from "@/lib/customer-account";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const notes = String(body.notes || "").trim();
    const acceptedTerms = Boolean(body.acceptedTerms);
    const customer = await getCurrentCustomer();

    if (!customer?.email) {
      return NextResponse.json({ error: "Login required." }, { status: 401 });
    }
    if (!acceptedTerms) {
      return NextResponse.json(
        { error: "You must accept the terms and conditions." },
        { status: 400 }
      );
    }

    const fullName = String(customer.full_name || "").trim();
    const inferredFirst = String(customer.first_name || "").trim() || fullName.split(" ")[0] || "Customer";
    const inferredLast =
      String(customer.last_name || "").trim() ||
      fullName.split(" ").slice(1).join(" ").trim() ||
      "User";

    const affiliate = await createAffiliateApplication({
      firstName: inferredFirst,
      lastName: inferredLast,
      email: String(customer.email).trim().toLowerCase(),
      notes,
    });

    return NextResponse.json({
      ok: true,
      affiliate: {
        id: affiliate.id,
        code: affiliate.code,
        email: affiliate.email,
        status: affiliate.status,
      },
    });
  } catch (error) {
    console.error("[API /affiliate/apply] error:", error);
    return NextResponse.json({ error: "Failed to submit application." }, { status: 500 });
  }
}
