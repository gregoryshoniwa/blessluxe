"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Layers } from "lucide-react";

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
  products: PackProduct[];
}

export function PacksCatalogueClient({
  initialPacks,
  initialQuery,
}: {
  initialPacks: PackRow[];
  initialQuery: string;
}) {
  const [search, setSearch] = useState(initialQuery);

  // Client-side filter — initial data is server-fetched but the box stays
  // responsive without a roundtrip on every keystroke.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialPacks;
    return initialPacks.filter((p) => {
      if (p.title.toLowerCase().includes(q)) return true;
      if (p.description?.toLowerCase().includes(q)) return true;
      return (p.products || []).some((pr) => pr.title.toLowerCase().includes(q));
    });
  }, [initialPacks, search]);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-black/40 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search packs by name, product, or keyword…"
            className="w-full bg-white border border-black/10 pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:border-gold transition-colors"
          />
        </div>
        <p className="text-xs uppercase tracking-[0.2em] text-black/55">
          {filtered.length} pack{filtered.length === 1 ? "" : "s"}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-black/50 italic">
          {initialPacks.length === 0
            ? "No packs are published yet."
            : `No packs match "${search}".`}
        </div>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 sm:gap-4">
          {filtered.map((p) => (
            <PackCard key={p.id} pack={p} />
          ))}
        </ul>
      )}
    </>
  );
}

function PackCard({ pack }: { pack: PackRow }) {
  const products = pack.products || [];
  const isMerge = pack.pack_kind === "merge";

  return (
    <li>
      <Link
        href={`/shop/packs/${encodeURIComponent(pack.handle)}`}
        className="group block bg-white border border-black/10 hover:border-gold hover:shadow-md transition-all overflow-hidden"
      >
        {/* Image area — single product = one image, merge = 2x2 mosaic */}
        <div className="aspect-square bg-cream/60 relative">
          {isMerge && products.length >= 2 ? (
            <div className="absolute inset-0 grid grid-cols-2 gap-px bg-black/5">
              {products.slice(0, 4).map((pr) => (
                <div key={pr.id} className="bg-cream/60 relative overflow-hidden">
                  {pr.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pr.thumbnail}
                      alt={pr.title}
                      className="w-full h-full object-cover"
                    />
                  ) : null}
                </div>
              ))}
              {products.length > 4 && (
                <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] font-semibold tracking-wider uppercase px-1.5 py-0.5">
                  +{products.length - 4}
                </span>
              )}
            </div>
          ) : products[0]?.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={products[0].thumbnail}
              alt={products[0].title}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : null}

          {isMerge && (
            <span className="absolute top-1.5 left-1.5 bg-gold-dark text-white text-[9px] font-semibold tracking-wider uppercase px-1.5 py-0.5 flex items-center gap-1">
              <Layers className="w-2.5 h-2.5" />
              Merge
            </span>
          )}
        </div>

        <div className="p-2.5 sm:p-3">
          <h2 className="font-display text-sm leading-tight text-black group-hover:text-gold-dark transition-colors line-clamp-2">
            {pack.title}
          </h2>
          <p className="text-[11px] text-black/55 mt-1 line-clamp-1">
            {products.length} product{products.length === 1 ? "" : "s"}
            {isMerge ? " · multi-product" : " · all sizes"}
          </p>
        </div>
      </Link>
    </li>
  );
}
