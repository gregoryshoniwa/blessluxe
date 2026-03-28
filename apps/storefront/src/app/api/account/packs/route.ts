import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import { getPackDefinitionById, listCampaignsForCustomer } from "@/lib/packs";

export const dynamic = "force-dynamic";

/** Customer: packs / slots they participate in (storefront customer id). */
export async function GET() {
  try {
    const customer = await getCurrentCustomer();
    const customerId = customer?.id;
    if (typeof customerId !== "string" || !customerId) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const rows = await listCampaignsForCustomer(customerId);
    const enriched = await Promise.all(
      rows.map(async (r) => {
        const def = await getPackDefinitionById(r.pack_definition_id);
        return {
          ...r,
          pack_title: def?.title ?? null,
        };
      })
    );

    return NextResponse.json({ participations: enriched });
  } catch (e) {
    console.error("[API /account/packs] GET", e);
    return NextResponse.json({ error: "Failed to load packs." }, { status: 500 });
  }
}
