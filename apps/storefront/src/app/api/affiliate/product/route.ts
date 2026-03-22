import { NextRequest, NextResponse } from "next/server";
import { getAffiliateByCode } from "@/lib/affiliate";
import { getStoreMedusaFetchHeaders } from "@/lib/medusa";

export const dynamic = "force-dynamic";

function getMedusaBaseCandidates() {
  const configured = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/+$/, "");
  return Array.from(
    new Set([configured, "http://medusa:9000", "http://host.docker.internal:9000", "http://localhost:9000"])
  );
}

async function getDefaultRegionId(base: string) {
  try {
    const url = new URL("/store/regions", base);
    url.searchParams.set("limit", "1");
    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: getStoreMedusaFetchHeaders(),
    });
    if (!response.ok) return "";
    const payload = (await response.json()) as { regions?: Array<Record<string, unknown>> };
    return String(payload.regions?.[0]?.id || "");
  } catch {
    return "";
  }
}

export async function GET(req: NextRequest) {
  try {
    const code = String(req.nextUrl.searchParams.get("code") || "").trim();
    const handle = String(req.nextUrl.searchParams.get("handle") || "").trim();
    if (!code || !handle) {
      return NextResponse.json({ error: "code and handle are required." }, { status: 400 });
    }
    const affiliate = await getAffiliateByCode(code);
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found." }, { status: 404 });
    }

    for (const base of getMedusaBaseCandidates()) {
      try {
        const regionId = await getDefaultRegionId(base);
        const url = new URL("/store/products", base);
        url.searchParams.set("handle", handle);
        url.searchParams.set("limit", "1");
        if (regionId) url.searchParams.set("region_id", regionId);
        const response = await fetch(url.toString(), {
          cache: "no-store",
          headers: getStoreMedusaFetchHeaders(),
        });
        if (!response.ok) continue;
        const payload = (await response.json()) as { products?: Array<Record<string, unknown>> };
        const product = payload.products?.[0];
        if (!product) continue;
        return NextResponse.json({ product, regionId: regionId || null });
      } catch {
        // try next candidate
      }
    }

    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  } catch (error) {
    console.error("[API /affiliate/product] GET error:", error);
    return NextResponse.json({ error: "Failed to load product." }, { status: 500 });
  }
}

