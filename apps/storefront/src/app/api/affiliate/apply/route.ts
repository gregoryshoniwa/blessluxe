import { NextRequest, NextResponse } from "next/server";
import { createAffiliateApplication } from "@/lib/affiliate";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const firstName = String(body.firstName || "").trim();
    const lastName = String(body.lastName || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const notes = String(body.notes || "").trim();
    const acceptedTerms = Boolean(body.acceptedTerms);

    if (!firstName || !lastName || !email) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    if (!acceptedTerms) {
      return NextResponse.json(
        { error: "You must accept the terms and conditions." },
        { status: 400 }
      );
    }

    const affiliate = await createAffiliateApplication({
      firstName,
      lastName,
      email,
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
