import { NextRequest, NextResponse } from "next/server";
import { getShopCustomerToken } from "@/lib/customer-account";
import { shopFetch } from "@/lib/shop-backend-client";

export const dynamic = "force-dynamic";

interface ReserveResponse {
  slot?: Record<string, unknown>;
  error?: string;
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ code: string; slotId: string }> }
) {
  const token = await getShopCustomerToken();
  if (!token) {
    return NextResponse.json(
      { error: "Sign in to claim a slot" },
      { status: 401 }
    );
  }
  const { code, slotId } = await ctx.params;
  const res = await shopFetch<ReserveResponse>(
    `/store/pack-campaigns/${encodeURIComponent(code)}/slots/${encodeURIComponent(slotId)}/reserve`,
    { method: "POST", bearer: token }
  );
  if (!res.ok || !res.data) {
    return NextResponse.json(
      { error: res.error || "Failed to reserve" },
      { status: res.status || 500 }
    );
  }
  return NextResponse.json(res.data);
}
