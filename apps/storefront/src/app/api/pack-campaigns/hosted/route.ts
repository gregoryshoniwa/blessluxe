import { NextResponse } from "next/server";
import { getShopCustomerToken } from "@/lib/customer-account";
import { shopFetch } from "@/lib/shop-backend-client";

export const dynamic = "force-dynamic";

interface HostedCampaign {
  id: string;
  public_code: string;
  title: string | null;
  status: string;
  created_at: string;
  expires_at: string | null;
  pack_title: string;
  pack_handle: string;
  product_id: string;
  slot_count: number;
  claimed_count: number;
}

export async function GET() {
  const token = await getShopCustomerToken();
  if (!token) return NextResponse.json({ campaigns: [] });
  const res = await shopFetch<{ campaigns: HostedCampaign[] }>(
    "/store/pack-campaigns/hosted",
    { bearer: token }
  );
  if (!res.ok || !res.data) return NextResponse.json({ campaigns: [] });
  return NextResponse.json(res.data);
}
