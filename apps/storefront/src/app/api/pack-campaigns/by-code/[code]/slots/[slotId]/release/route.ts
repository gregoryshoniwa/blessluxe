import { NextRequest, NextResponse } from "next/server";
import { getShopCustomerToken } from "@/lib/customer-account";
import { shopFetch } from "@/lib/shop-backend-client";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ code: string; slotId: string }> }
) {
  const token = await getShopCustomerToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { code, slotId } = await ctx.params;
  const res = await shopFetch<{ ok?: boolean; error?: string }>(
    `/store/pack-campaigns/${encodeURIComponent(code)}/slots/${encodeURIComponent(slotId)}/release`,
    { method: "POST", bearer: token }
  );
  if (!res.ok) {
    return NextResponse.json(
      { error: res.error || "Failed to release" },
      { status: res.status || 500 }
    );
  }
  return NextResponse.json(res.data || { ok: true });
}
