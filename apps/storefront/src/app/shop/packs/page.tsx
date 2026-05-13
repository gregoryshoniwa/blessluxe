import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getInternalBackendUrl, getStoreMedusaFetchHeaders, MEDUSA_BACKEND_URL } from "@/lib/medusa";
import { PacksCatalogueClient } from "@/components/packs/PacksCatalogueClient";

export const dynamic = "force-dynamic";

interface PackProduct {
  id: string;
  title: string;
  handle: string;
  thumbnail: string | null;
}

interface PackRow {
  id: string;
  title: string;
  handle: string;
  description: string | null;
  pack_kind: "single" | "merge";
  created_at: string;
  products: PackProduct[] | null;
}

async function loadPacks(q: string | null): Promise<PackRow[]> {
  try {
    const url = new URL("/store/packs", getInternalBackendUrl());
    if (q) url.searchParams.set("q", q);
    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: { ...getStoreMedusaFetchHeaders(), connection: "close" },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { packs?: PackRow[] };
    return json.packs || [];
  } catch {
    return [];
  }
}

function publicImage(value: string | null | undefined): string | null {
  const input = String(value || "").trim();
  if (!input) return null;
  const publicBase = MEDUSA_BACKEND_URL.replace(/\/+$/, "");
  if (input.startsWith("/")) return `${publicBase}${input}`;
  return input;
}

export default async function PacksCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() || null;
  const raw = await loadPacks(q);
  const packs = raw.map((p) => ({
    ...p,
    products: (p.products || []).map((pr) => ({
      ...pr,
      thumbnail: publicImage(pr.thumbnail),
    })),
  }));

  return (
    <main className="min-h-screen bg-cream/40">
      <div className="max-w-[1400px] mx-auto px-[5%] py-8">
        <nav className="flex items-center gap-2 text-sm text-black/60 mb-4" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-gold-dark transition-colors">Home</Link>
          <ChevronRight className="w-4 h-4" />
          <Link href="/shop" className="hover:text-gold-dark transition-colors">Shop</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-gold-dark font-medium">Packs</span>
        </nav>
        <h1 className="font-display text-4xl md:text-5xl text-black mb-2">Wholesale packs</h1>
        <p className="text-black/70 max-w-2xl">
          Bundle multiple pieces into one drop. Buy the full pack yourself, or host a group buy
          and let friends each claim a size — the order processes when the pack is complete.
        </p>
      </div>

      <div className="max-w-[1400px] mx-auto px-[5%] pb-16">
        <PacksCatalogueClient initialPacks={packs} initialQuery={q || ""} />
      </div>
    </main>
  );
}
