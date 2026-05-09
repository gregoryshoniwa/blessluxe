import { NextResponse } from "next/server";
import { getCurrentCustomer, getShopCustomerToken } from "@/lib/customer-account";
import { shopBackendGetCustomerAffiliate } from "@/lib/shop-backend-client";
import { getAffiliateByEmail } from "@/lib/affiliate";

export const dynamic = "force-dynamic";

/**
 * Returns the affiliate record (if any) for the authenticated customer.
 *
 * Source of truth is the shop backend's `shop_affiliate` table — the same row
 * the admin reads/edits. We fall back to the storefront's local `affiliate`
 * table only if the shop backend has no record yet (covers users who applied
 * via the legacy path before the dual-write was wired in).
 */
export async function GET() {
  try {
    const customer = await getCurrentCustomer();
    if (!customer?.email) {
      return NextResponse.json({ affiliate: null }, { status: 200 });
    }

    // Primary: shop backend (admin source of truth).
    const token = await getShopCustomerToken();
    if (token) {
      const res = await shopBackendGetCustomerAffiliate(token);
      if (res.ok && res.data?.affiliate) {
        const a = res.data.affiliate;
        return NextResponse.json({
          affiliate: {
            id: a.id,
            code: a.code,
            email: a.email,
            status: a.status,
            first_name: a.first_name,
            last_name: a.last_name,
          },
        });
      }
    }

    // Fallback: legacy local table (pre-migration applications).
    const local = await getAffiliateByEmail(String(customer.email));
    if (!local) return NextResponse.json({ affiliate: null });
    return NextResponse.json({
      affiliate: {
        id: local.id,
        code: local.code,
        email: local.email,
        status: local.status,
        first_name: local.first_name,
        last_name: local.last_name,
      },
    });
  } catch (err) {
    console.error("[/api/affiliate/me]", err);
    return NextResponse.json({ affiliate: null }, { status: 200 });
  }
}
