import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import { getAffiliateByCode } from "@/lib/affiliate";
import { getPackDefinitionById, listCampaignsForAffiliate } from "@/lib/packs";
import { fetchStoreProductThumbAndHandle } from "@/lib/medusa";

export const dynamic = "force-dynamic";

/**
 * List pack campaigns for the authenticated affiliate (`code` query must match their shop).
 */
export async function GET(req: NextRequest) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer?.email) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const code = String(req.nextUrl.searchParams.get("code") || "").trim();
    if (!code) {
      return NextResponse.json({ error: "code query parameter is required." }, { status: 400 });
    }

    const affiliate = await getAffiliateByCode(code);
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found." }, { status: 404 });
    }
    if (String(affiliate.email || "").toLowerCase() !== String(customer.email || "").toLowerCase()) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const campaigns = await listCampaignsForAffiliate(affiliate.id);
    const enriched = await Promise.all(
      campaigns.map(async (c) => {
        const def = await getPackDefinitionById(c.pack_definition_id);
        let thumbnail_url: string | null = null;
        let product_handle: string | null = null;
        if (def?.product_id) {
          const media = await fetchStoreProductThumbAndHandle(def.product_id);
          thumbnail_url = media.thumb;
          product_handle = media.handle;
        }
        return {
          ...c,
          pack_title: def?.title ?? null,
          pack_handle: def?.handle ?? null,
          thumbnail_url,
          product_handle,
        };
      })
    );

    return NextResponse.json({ campaigns: enriched });
  } catch (e) {
    console.error("[API /affiliate/pack-campaigns] GET", e);
    return NextResponse.json({ error: "Failed to load campaigns." }, { status: 500 });
  }
}
