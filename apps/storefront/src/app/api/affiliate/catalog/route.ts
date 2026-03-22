import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import {
  addAffiliateStoreProduct,
  getAffiliateByCode,
  listAffiliateStoreProducts,
  removeAffiliateStoreProduct,
} from "@/lib/affiliate";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
type AudienceFilter = "women" | "men" | "children";

interface CategoryRow {
  id: string;
  handle: string;
  parent_category_id: string | null;
}

interface ProductCategoryLinkRow {
  product_id: string;
}

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000";
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function getServerMedusaBaseCandidates() {
  const configured = trimTrailingSlash(getBaseUrl());
  const candidates = [configured, "http://medusa:9000", "http://host.docker.internal:9000", "http://localhost:9000"];
  return Array.from(new Set(candidates.filter(Boolean)));
}

function getPublicMedusaBaseUrl() {
  return trimTrailingSlash(process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000");
}

function getHeaders(withPublishableKey: boolean): Record<string, string> {
  const h: Record<string, string> = { accept: "application/json" };
  const key = (process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || "").trim();
  if (withPublishableKey && key) h["x-publishable-api-key"] = key;
  return h;
}

function normalizeProducts(rows: Array<Record<string, unknown>>) {
  const publicBase = getPublicMedusaBaseUrl();
  const toPublicUrl = (value: string) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
    if (trimmed.startsWith("/")) return `${publicBase}${trimmed}`;
    return `${publicBase}/${trimmed}`;
  };

  return rows.map((product) => {
    const images = Array.isArray(product.images) ? (product.images as Array<Record<string, unknown>>) : [];
    const firstImage = toPublicUrl(String(images[0]?.url || ""));
    const thumb = toPublicUrl(String(product.thumbnail || ""));
    return {
      ...product,
      image_url: thumb || firstImage || "",
      thumbnail: thumb || firstImage || "",
      images: images.map((image) => ({
        ...image,
        url: toPublicUrl(String(image.url || "")),
      })),
    };
  });
}

function matchesAudienceCategoryNode(
  node: Record<string, unknown> | null | undefined,
  audience: AudienceFilter,
  depth = 0
): boolean {
  if (!node || depth > 4) return false;
  const handle = String(node.handle || "")
    .trim()
    .toLowerCase();
  const name = String(node.name || "")
    .trim()
    .toLowerCase();
  if (handle === audience || handle.startsWith(`${audience}-`) || name === audience) {
    return true;
  }
  const parent = node.parent_category as Record<string, unknown> | undefined;
  return matchesAudienceCategoryNode(parent, audience, depth + 1);
}

function filterProductsByAudience(
  products: Array<Record<string, unknown>>,
  audience?: AudienceFilter,
  audienceCategoryIds?: Set<string>,
  audienceProductIds?: Set<string>
) {
  if (!audience) return products;
  if (audienceProductIds && audienceProductIds.size > 0) {
    const idMatches = products.filter((product) =>
      audienceProductIds.has(String(product.id || ""))
    );
    if (idMatches.length > 0) return idMatches;
  }
  if (audienceCategoryIds && audienceCategoryIds.size > 0) {
    const categoryMatches = products.filter((product) => {
      const categories = Array.isArray(product.categories)
        ? (product.categories as Array<Record<string, unknown>>)
        : [];
      return categories.some((category) => audienceCategoryIds.has(String(category.id || "")));
    });
    if (categoryMatches.length > 0) return categoryMatches;
  }
  const strictMatches = products.filter((product) => {
    const categories = Array.isArray(product.categories)
      ? (product.categories as Array<Record<string, unknown>>)
      : [];
    return categories.some((category) => matchesAudienceCategoryNode(category, audience));
  });
  if (strictMatches.length > 0) return strictMatches;

  const fallbackKeywordsByAudience: Record<AudienceFilter, string[]> = {
    women: ["women", "woman", "female", "ladies", "lady", "girls", "girl"],
    men: ["men", "man", "male", "mens", "boys", "boy"],
    children: ["children", "child", "kids", "kid", "toddlers", "toddler", "youth", "junior", "baby"],
  };
  const fallbackKeywords = fallbackKeywordsByAudience[audience];
  const fallbackMatches = products.filter((product) => {
    const categories = Array.isArray(product.categories)
      ? (product.categories as Array<Record<string, unknown>>)
      : [];
    const searchable = [
      String(product.title || ""),
      String(product.handle || ""),
      String(product.description || ""),
      ...categories.map((category) => String(category.name || "")),
      ...categories.map((category) => String(category.handle || "")),
    ]
      .join(" ")
      .toLowerCase();
    return fallbackKeywords.some((keyword) => searchable.includes(keyword));
  });
  return fallbackMatches.length > 0 ? fallbackMatches : products;
}

async function getAudienceCategoryIds(
  audience?: AudienceFilter
): Promise<Set<string> | undefined> {
  if (!audience) return undefined;
  try {
    const rows = await query<CategoryRow>(
      `SELECT id, handle, parent_category_id
       FROM product_category
       WHERE deleted_at IS NULL`
    );
    const byParent = new Map<string, CategoryRow[]>();
    for (const row of rows) {
      if (!row.parent_category_id) continue;
      const list = byParent.get(row.parent_category_id) ?? [];
      list.push(row);
      byParent.set(row.parent_category_id, list);
    }
    const root = rows.find((row) => String(row.handle || "").toLowerCase() === audience);
    if (!root) return undefined;
    // Match shop audience behavior: root + direct children categories.
    const ids = new Set<string>([root.id]);
    for (const child of byParent.get(root.id) || []) {
      ids.add(child.id);
    }
    return ids;
  } catch {
    return undefined;
  }
}

async function fetchProductsFromMedusa(input: {
  q: string;
  limit: number;
  audience?: AudienceFilter;
  audienceCategoryIds?: Set<string>;
  audienceProductIds?: Set<string>;
}) {
  const attempts = [true, false];
  const bases = getServerMedusaBaseCandidates();
  const buildCategoryParams = (url: URL) => {
    if (!input.audienceCategoryIds?.size) return;
    for (const categoryId of input.audienceCategoryIds) {
      // Medusa store endpoints commonly accept array filters in bracket form.
      url.searchParams.append("category_id[]", categoryId);
    }
  };
  for (const base of bases) {
    for (const withKey of attempts) {
      try {
        const url = new URL("/store/products", base);
        const fetchLimit = input.audience ? Math.max(input.limit, 50) : input.limit;
        url.searchParams.set("limit", String(fetchLimit));
        if (input.q) url.searchParams.set("q", input.q);
        buildCategoryParams(url);
        const response = await fetch(url.toString(), {
          cache: "no-store",
          headers: getHeaders(withKey),
        });
        if (response.ok) {
          const payload = (await response.json()) as { products?: Array<Record<string, unknown>> };
          const normalized = normalizeProducts(payload.products || []);
          const filtered = filterProductsByAudience(
            normalized,
            input.audience,
            input.audienceCategoryIds,
            input.audienceProductIds
          );
          if (filtered.length > 0 || !input.audienceCategoryIds?.size) {
            return filtered.slice(0, input.limit);
          }
        }
      } catch {
        // Try next host candidate.
      }
    }
  }

  // Broad fallback: fetch without q and filter server-side for compatibility.
  for (const base of bases) {
    for (const withKey of attempts) {
      try {
        const url = new URL("/store/products", base);
        // Broad fallback: fetch a larger pool and filter in-process.
        url.searchParams.set("limit", String(Math.max(input.limit * 8, 500)));
        const response = await fetch(url.toString(), {
          cache: "no-store",
          headers: getHeaders(withKey),
        });
        if (!response.ok) continue;
        const payload = (await response.json()) as { products?: Array<Record<string, unknown>> };
        const products = filterProductsByAudience(
          normalizeProducts(payload.products || []),
          input.audience,
          input.audienceCategoryIds,
          input.audienceProductIds
        );
        const q = input.q.toLowerCase();
        if (!q) return products.slice(0, input.limit);
        return products
          .filter((product) => {
            const title = String(product.title || "").toLowerCase();
            const handle = String(product.handle || "").toLowerCase();
            const description = String(product.description || "").toLowerCase();
            return title.includes(q) || handle.includes(q) || description.includes(q);
          })
          .slice(0, input.limit);
      } catch {
        // Try next host candidate.
      }
    }
  }

  throw new Error("Failed to fetch products from Medusa.");
}

async function getAudienceProductIds(
  audienceCategoryIds?: Set<string>
): Promise<Set<string> | undefined> {
  if (!audienceCategoryIds || audienceCategoryIds.size === 0) return undefined;
  try {
    const ids = Array.from(audienceCategoryIds);
    const links = await query<ProductCategoryLinkRow>(
      `SELECT DISTINCT product_id
       FROM product_category_product
       WHERE product_category_id = ANY($1::text[])`,
      [ids]
    );
    return new Set(links.map((row) => String(row.product_id || "")).filter(Boolean));
  } catch {
    return undefined;
  }
}

export async function GET(req: NextRequest) {
  try {
    const code = String(req.nextUrl.searchParams.get("code") || "").trim();
    if (!code) {
      return NextResponse.json({ error: "Affiliate code is required." }, { status: 400 });
    }
    const affiliate = await getAffiliateByCode(code);
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found." }, { status: 404 });
    }

    const mode = String(req.nextUrl.searchParams.get("mode") || "saved").trim();
    if (mode === "search") {
      const q = String(req.nextUrl.searchParams.get("q") || "").trim();
      const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit") || 20), 1), 50);
      const audienceRaw = String(req.nextUrl.searchParams.get("audience") || "")
        .trim()
        .toLowerCase();
      const audience: AudienceFilter | undefined =
        audienceRaw === "women" || audienceRaw === "men" || audienceRaw === "children"
          ? audienceRaw
          : undefined;
      const audienceCategoryIds = await getAudienceCategoryIds(audience);
      const audienceProductIds = await getAudienceProductIds(audienceCategoryIds);
      const products = await fetchProductsFromMedusa({
        q,
        limit,
        audience,
        audienceCategoryIds,
        audienceProductIds,
      });
      return NextResponse.json({ products });
    }

    const products = await listAffiliateStoreProducts(String(affiliate.id));
    return NextResponse.json({ products });
  } catch (error) {
    console.error("[API /affiliate/catalog] GET error:", error);
    return NextResponse.json({ error: "Failed to load affiliate catalog." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer?.email) {
      return NextResponse.json({ error: "Login required." }, { status: 401 });
    }
    const body = await req.json();
    const code = String(body.code || "").trim();
    const affiliate = await getAffiliateByCode(code);
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found." }, { status: 404 });
    }
    if (String(affiliate.email).toLowerCase() !== String(customer.email).toLowerCase()) {
      return NextResponse.json({ error: "Only owner can manage catalog." }, { status: 403 });
    }

    await addAffiliateStoreProduct({
      affiliateId: String(affiliate.id),
      productId: String(body.productId || "").trim(),
      productHandle: String(body.productHandle || "").trim(),
      productTitle: String(body.productTitle || "").trim(),
      productUrl: String(body.productUrl || "").trim(),
      imageUrl: String(body.imageUrl || "").trim() || undefined,
      variantId: String(body.variantId || "").trim() || undefined,
      variantTitle: String(body.variantTitle || "").trim() || undefined,
      priceAmount:
        typeof body.priceAmount === "number" && Number.isFinite(body.priceAmount)
          ? body.priceAmount
          : undefined,
      currencyCode: String(body.currencyCode || "").trim() || undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /affiliate/catalog] POST error:", error);
    return NextResponse.json({ error: "Failed to add product." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer?.email) {
      return NextResponse.json({ error: "Login required." }, { status: 401 });
    }
    const code = String(req.nextUrl.searchParams.get("code") || "").trim();
    const productId = String(req.nextUrl.searchParams.get("productId") || "").trim();
    if (!code || !productId) {
      return NextResponse.json({ error: "code and productId are required." }, { status: 400 });
    }
    const affiliate = await getAffiliateByCode(code);
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found." }, { status: 404 });
    }
    if (String(affiliate.email).toLowerCase() !== String(customer.email).toLowerCase()) {
      return NextResponse.json({ error: "Only owner can manage catalog." }, { status: 403 });
    }

    await removeAffiliateStoreProduct(String(affiliate.id), productId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /affiliate/catalog] DELETE error:", error);
    return NextResponse.json({ error: "Failed to remove product." }, { status: 500 });
  }
}

