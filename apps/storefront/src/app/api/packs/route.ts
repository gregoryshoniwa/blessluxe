import { NextResponse } from "next/server";
import { listPublishedPackDefinitions } from "@/lib/packs";
import { fetchStoreProductThumbAndHandle } from "@/lib/medusa";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await listPublishedPackDefinitions();
    const packs = await Promise.all(
      rows.map(async (p) => {
        const { thumb, handle } = await fetchStoreProductThumbAndHandle(p.product_id);
        return {
          ...p,
          thumbnail_url: thumb,
          product_handle: handle,
        };
      })
    );
    return NextResponse.json({ packs });
  } catch (e) {
    console.error("[API /packs] GET", e);
    return NextResponse.json({ error: "Failed to load packs." }, { status: 500 });
  }
}
