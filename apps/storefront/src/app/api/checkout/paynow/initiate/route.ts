import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer, getShopCustomerToken } from "@/lib/customer-account";
import { shopFetch } from "@/lib/shop-backend-client";

export const dynamic = "force-dynamic";

interface InitiateBody {
  items: Array<{
    variant_id: string;
    quantity: number;
    unit_price: number;
    pack_slot_id?: string;
    metadata?: Record<string, unknown>;
  }>;
  email?: string;
  currency_code?: string;
  shipping_total?: number;
  tax_total?: number;
  discount_total?: number;
  shipping_address?: Record<string, unknown>;
  billing_address?: Record<string, unknown>;
  region_id?: string;
  auth_phone?: string;
  auth_name?: string;
}

interface InitiateResponse {
  browser_url: string;
  poll_url: string;
  reference: string;
  session_id: string;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as InitiateBody;
  const token = await getShopCustomerToken();
  const customer = await getCurrentCustomer();
  const email = body.email || (customer?.email as string | undefined) || "";

  if (!body.items || body.items.length === 0) {
    return NextResponse.json({ error: "items required" }, { status: 400 });
  }
  if (!email) {
    return NextResponse.json(
      { error: "Email required to checkout with Paynow" },
      { status: 400 }
    );
  }

  const res = await shopFetch<InitiateResponse>("/store/payments/paynow/initiate", {
    method: "POST",
    bearer: token || undefined,
    body: { ...body, email },
  });
  if (!res.ok || !res.data) {
    return NextResponse.json(
      { error: res.error || "Failed to initiate Paynow checkout" },
      { status: res.status || 502 }
    );
  }
  return NextResponse.json(res.data);
}
