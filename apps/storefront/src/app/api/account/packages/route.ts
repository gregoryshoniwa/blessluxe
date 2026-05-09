import { NextResponse } from "next/server";
import { getCurrentCustomer, getShopCustomerToken } from "@/lib/customer-account";
import { shopFetch } from "@/lib/shop-backend-client";

export const dynamic = "force-dynamic";

interface PackageRow {
  id: string;
  package_code: string;
  status: string;
  is_pack: boolean;
  carrier: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
  order_number: string;
  total: number;
  currency_code: string;
}

export async function GET() {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ packages: [] }, { status: 200 });
  const token = await getShopCustomerToken();
  // Pass email so the shop backend can match packages whose customer_id was
  // never linked (storefront and shop backend use separate auth tokens, so
  // historical packages often have customer_id = NULL with only the email).
  const email = (customer.email || "").trim().toLowerCase();
  const path = email
    ? `/store/packages?email=${encodeURIComponent(email)}`
    : "/store/packages";
  const res = await shopFetch<{ packages: PackageRow[] }>(path, {
    bearer: token || undefined,
  });
  if (!res.ok || !res.data) return NextResponse.json({ packages: [] });
  return NextResponse.json({ packages: res.data.packages });
}
