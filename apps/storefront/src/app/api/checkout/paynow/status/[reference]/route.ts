import { NextRequest, NextResponse } from "next/server";
import { shopFetch } from "@/lib/shop-backend-client";

export const dynamic = "force-dynamic";

interface StatusResponse {
  session?: {
    reference: string;
    status: "pending" | "paid" | "failed" | "cancelled";
    provider_status: string | null;
    order_id: string | null;
  };
  error?: string;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ reference: string }> }
) {
  const { reference } = await ctx.params;
  const res = await shopFetch<StatusResponse>(
    `/store/payments/paynow/status/${encodeURIComponent(reference)}`
  );
  if (!res.ok || !res.data) {
    return NextResponse.json(
      { error: res.error || "Failed" },
      { status: res.status || 500 }
    );
  }
  return NextResponse.json(res.data);
}
