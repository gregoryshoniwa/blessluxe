import { NextResponse } from "next/server";
import { MEDUSA_BACKEND_URL, getStoreMedusaFetchHeaders } from "@/lib/medusa";

export const dynamic = "force-dynamic";

interface FlatCategory {
  id: string;
  name: string;
  handle: string;
  description: string | null;
  parent_category_id: string | null;
}

interface BackendCatalogue {
  id: string;
  name: string;
  handle: string;
  description: string | null;
  is_active?: boolean;
}

interface BackendHeading {
  id: string;
  name: string;
  handle: string;
  description: string | null;
  is_active?: boolean;
  catalogues?: BackendCatalogue[];
}

/**
 * Returns the navigation hierarchy in the legacy "category" shape so existing
 * storefront components (ProductGrid, FiltersPanel, etc.) keep working without
 * changes. Headings become root categories; catalogues become children whose
 * `parent_category_id` is the heading id.
 *
 * Source of truth is the shop backend (`/store/headings`).
 */
export async function GET() {
  try {
    // Server-side fetch: rewrite localhost → 127.0.0.1 to dodge Node 18+ ECONNRESET
    // when the global fetch resolves "localhost" to ::1 (IPv6) but Express's
    // dual-stack socket renegotiates connections in a way Node's fetch dislikes.
    const internalBase = MEDUSA_BACKEND_URL.replace(
      /^http:\/\/localhost(:|$)/i,
      "http://127.0.0.1$1"
    );
    const url = new URL("/store/headings", internalBase);
    const res = await fetch(url.toString(), {
      headers: { ...getStoreMedusaFetchHeaders(), connection: "close" },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ categories: [] }, { status: 200 });
    const payload = (await res.json()) as { headings?: BackendHeading[] };
    const headings = (payload.headings ?? []).filter((h) => h.is_active !== false);

    const categories: FlatCategory[] = [];
    for (const h of headings) {
      categories.push({
        id: h.id,
        name: h.name,
        handle: h.handle,
        description: h.description,
        parent_category_id: null,
      });
      for (const c of h.catalogues || []) {
        if (c.is_active === false) continue;
        categories.push({
          id: c.id,
          name: c.name,
          handle: c.handle,
          description: c.description,
          parent_category_id: h.id,
        });
      }
    }

    return NextResponse.json({ categories });
  } catch (error) {
    console.error("[API /catalog/categories] error:", error);
    return NextResponse.json({ categories: [] }, { status: 200 });
  }
}
