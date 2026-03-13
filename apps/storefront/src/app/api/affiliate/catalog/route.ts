import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import {
  addAffiliateStoreProduct,
  getAffiliateByCode,
  listAffiliateStoreProducts,
  removeAffiliateStoreProduct,
} from "@/lib/affiliate";

export const dynamic = "force-dynamic";

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

function getHeaders(withPublishableKey: boolean) {
  const key = (process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || "").trim();
  if (withPublishableKey && key) {
    return {
      "x-publishable-api-key": key,
      accept: "application/json",
    };
  }
  return { accept: "application/json" };
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

async function fetchProductsFromMedusa(input: { q: string; limit: number }) {
  const attempts = [true, false];
  const bases = getServerMedusaBaseCandidates();
  for (const base of bases) {
    for (const withKey of attempts) {
      try {
        const url = new URL("/store/products", base);
        url.searchParams.set("limit", String(input.limit));
        if (input.q) url.searchParams.set("q", input.q);
        const response = await fetch(url.toString(), {
          cache: "no-store",
          headers: getHeaders(withKey),
        });
        if (response.ok) {
          const payload = (await response.json()) as { products?: Array<Record<string, unknown>> };
          return normalizeProducts(payload.products || []);
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
        url.searchParams.set("limit", String(Math.max(input.limit, 120)));
        const response = await fetch(url.toString(), {
          cache: "no-store",
          headers: getHeaders(withKey),
        });
        if (!response.ok) continue;
        const payload = (await response.json()) as { products?: Array<Record<string, unknown>> };
        const products = normalizeProducts(payload.products || []);
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
      const products = await fetchProductsFromMedusa({ q, limit });
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

