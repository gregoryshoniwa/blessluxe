import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import { createAffiliateMediaAsset, getAffiliateByCode } from "@/lib/affiliate";
import { uploadImageAsset } from "@/lib/media-upload";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer?.id) {
      return NextResponse.json({ error: "Login required." }, { status: 401 });
    }

    const body = await req.json();
    const imageData = String(body.imageData || "").trim();
    const folder = String(body.folder || "blessluxe/affiliate").trim();
    const code = String(body.code || "").trim();
    const persistSelfie = Boolean(body.persistSelfie);
    if (!imageData) {
      return NextResponse.json({ error: "imageData is required." }, { status: 400 });
    }

    const uploaded = await uploadImageAsset({
      dataUrlOrRemoteUrl: imageData,
      folder,
    });

    let mediaId: string | null = null;
    if (persistSelfie && code) {
      const affiliate = await getAffiliateByCode(code);
      if (
        affiliate &&
        customer.email &&
        String(affiliate.email).toLowerCase() === String(customer.email).toLowerCase()
      ) {
        mediaId = await createAffiliateMediaAsset({
          affiliateId: String(affiliate.id),
          customerId: String(customer.id),
          source: "selfie-upload",
          originalUrl: uploaded.url,
          metadata: {
            folder,
            from: "photo-studio-step-1",
          },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      url: uploaded.url,
      provider: uploaded.provider,
      warning: uploaded.warning,
      mediaId,
    });
  } catch (error) {
    console.error("[API /affiliate/social/upload] error:", error);
    return NextResponse.json({ error: "Failed to upload image." }, { status: 500 });
  }
}

