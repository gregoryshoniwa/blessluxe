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
  if (!token) return NextResponse.json({ packages: [] });
  const res = await shopFetch<{ packages: PackageRow[] }>("/store/packages", {
    bearer: token,
  });
  if (!res.ok || !res.data) return NextResponse.json({ packages: [] });
  return NextResponse.json({ packages: res.data.packages });
}
