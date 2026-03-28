import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import { getAffiliateByCode } from "@/lib/affiliate";
import { createPackCampaignWithSlots, getPackDefinitionById } from "@/lib/packs";
import { buildPdpVariantRows } from "@/lib/medusa-pdp";
import { getStoreMedusaFetchHeaders } from "@/lib/medusa";

export const dynamic = "force-dynamic";

function medusaBases() {
  const configured = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/+$/, "");
  return Array.from(new Set([configured, "http://medusa:9000", "http://host.docker.internal:9000", "http://localhost:9000"]));
}

async function getDefaultRegionId(base: string): Promise<string> {
  try {
    const url = new URL("/store/regions", base);
    url.searchParams.set("limit", "1");
    const res = await fetch(url.toString(), { cache: "no-store", headers: getStoreMedusaFetchHeaders() });
    if (!res.ok) return "";
    const j = (await res.json()) as { regions?: Array<{ id?: string }> };
    return String(j.regions?.[0]?.id || "");
  } catch {
    return "";
  }
}

async function fetchProductById(productId: string): Promise<Record<string, unknown> | null> {
  for (const base of medusaBases()) {
    try {
      const regionId = await getDefaultRegionId(base);
      const url = new URL(`/store/products/${encodeURIComponent(productId)}`, base);
      url.searchParams.set(
        "fields",
        "*variants,*variants.id,*variants.options,*variants.title,*variants.calculated_price,*variants.prices"
      );
      if (regionId) url.searchParams.set("region_id", regionId);
      const res = await fetch(url.toString(), { cache: "no-store", headers: getStoreMedusaFetchHeaders() });
      if (!res.ok) continue;
      const j = (await res.json()) as { product?: Record<string, unknown> };
      if (j.product) return j.product;
    } catch {
      // next
    }
  }
  return null;
}

/**
 * Create a group-buy campaign for an affiliate (requires logged-in customer = affiliate owner).
 * Body: { affiliate_code: string, pack_definition_id: string }
 */
export async function POST(req: NextRequest) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer?.email) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const body = (await req.json()) as { affiliate_code?: string; pack_definition_id?: string };
    const affiliateCode = String(body.affiliate_code || "").trim();
    const packDefinitionId = String(body.pack_definition_id || "").trim();
    if (!affiliateCode || !packDefinitionId) {
      return NextResponse.json({ error: "affiliate_code and pack_definition_id are required." }, { status: 400 });
    }

    const affiliate = await getAffiliateByCode(affiliateCode);
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found." }, { status: 404 });
    }
    if (String(affiliate.email || "").toLowerCase() !== String(customer.email || "").toLowerCase()) {
      return NextResponse.json({ error: "Not allowed for this affiliate account." }, { status: 403 });
    }
    if (affiliate.status !== "active") {
      return NextResponse.json({ error: "Affiliate account is not active." }, { status: 403 });
    }

    const def = await getPackDefinitionById(packDefinitionId);
    if (!def) {
      return NextResponse.json({ error: "Pack definition not found." }, { status: 404 });
    }

    const product = await fetchProductById(def.product_id);
    if (!product) {
      return NextResponse.json({ error: "Could not load product from Medusa." }, { status: 502 });
    }

    const rows = buildPdpVariantRows(product).map((r) => ({
      variant_id: r.id,
      size_label: r.size,
    }));
    if (rows.length === 0) {
      return NextResponse.json({ error: "Product has no variants for pack slots." }, { status: 400 });
    }

    const { campaign, slots } = await createPackCampaignWithSlots({
      packDefinitionId: def.id,
      affiliateId: affiliate.id,
      variantRows: rows,
    });

    return NextResponse.json({ campaign, slots, public_code: campaign.public_code });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create campaign.";
    console.error("[API /pack-campaigns] POST", e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
