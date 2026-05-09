import { NextResponse } from "next/server";
import { shopBackendActiveCampaigns } from "@/lib/shop-backend-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const res = await shopBackendActiveCampaigns();
  if (!res.ok || !res.data) {
    return NextResponse.json({ campaigns: [] }, { status: 200 });
  }
  return NextResponse.json({ campaigns: res.data.campaigns });
}
