import { NextRequest, NextResponse } from "next/server";
import { getShopCustomerToken } from "@/lib/customer-account";
import { shopFetch } from "@/lib/shop-backend-client";

export const dynamic = "force-dynamic";

interface HostBody {
  pack_definition_id?: string;
  title?: string;
  expires_at?: string;
}

interface HostResponse {
  campaign: Record<string, unknown>;
  public_code: string;
}

export async function POST(req: NextRequest) {
  const token = await getShopCustomerToken();
  if (!token) {
    return NextResponse.json(
      { error: "Sign in to host a pack" },
      { status: 401 }
    );
  }
  const body = (await req.json()) as HostBody;
  if (!body.pack_definition_id) {
    return NextResponse.json(
      { error: "pack_definition_id required" },
      { status: 400 }
    );
  }
  const res = await shopFetch<HostResponse>("/store/pack-campaigns/host", {
    method: "POST",
    bearer: token,
    body: {
      pack_definition_id: body.pack_definition_id,
      title: body.title,
      expires_at: body.expires_at,
    },
  });
  if (!res.ok || !res.data) {
    return NextResponse.json(
      { error: res.error || "Failed to host pack" },
      { status: res.status || 500 }
    );
  }
  return NextResponse.json(res.data);
}
