import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { listPublishedPackDefinitions } from "@/lib/packs";
import { fetchStoreProductThumbAndHandle } from "@/lib/medusa";

export const dynamic = "force-dynamic";

export default async function PacksCatalogPage() {
  let rows: Awaited<ReturnType<typeof listPublishedPackDefinitions>> = [];
  try {
    rows = await listPublishedPackDefinitions();
  } catch {
    rows = [];
  }

  const enriched = await Promise.all(
    rows.map(async (r) => {
      const { thumb, handle } = await fetchStoreProductThumbAndHandle(r.product_id);
      return { ...r, thumb, productHandle: handle };
    })
  );

  return (
    <main className="min-h-screen theme-transition" style={{ backgroundColor: "var(--theme-background)" }}>
      <div
        className="theme-transition"
        style={{ background: `linear-gradient(to bottom, var(--theme-background-dark), var(--theme-background))` }}
      >
        <div className="max-w-[1400px] mx-auto px-[5%] py-8">
          <nav className="flex items-center gap-2 text-sm text-black/60 mb-4" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-theme-primary theme-transition">
              Home
            </Link>
            <ChevronRight className="w-4 h-4" />
            <Link href="/shop" className="hover:text-theme-primary theme-transition">
              Shop
            </Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-theme-primary font-medium theme-transition">Packs</span>
          </nav>
          <h1 className="font-display text-4xl md:text-5xl text-black mb-2">Wholesale packs</h1>
          <p className="text-black/70 max-w-2xl">
            Buy every size in one checkout. Share a pack on your affiliate page so friends can claim individual sizes —
            the order processes when the pack is complete.
          </p>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-[5%] py-10">
        {enriched.length === 0 ? (
          <div className="max-w-xl space-y-4 rounded-2xl border border-black/10 bg-white/80 p-6 text-black/70">
            <p className="text-black/80">
              No wholesale packs are published yet. This page reads from the same database as the storefront (table{" "}
              <code className="text-xs bg-black/[0.06] px-1 py-0.5 rounded">pack_definition</code>, status{" "}
              <code className="text-xs bg-black/[0.06] px-1 py-0.5 rounded">published</code>).
            </p>
            <p className="text-sm font-medium text-black/85">To show packs here (local dev):</p>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>Start Postgres: <code className="text-xs bg-black/[0.06] px-1 rounded">docker compose up -d postgres</code></li>
              <li>
                Apply Medusa migrations (creates pack tables):{" "}
                <code className="text-xs bg-black/[0.06] px-1 rounded">pnpm --filter @blessluxe/backend db:migrate</code>
              </li>
              <li>
                Seed the catalog + sample pack:{" "}
                <code className="text-xs bg-black/[0.06] px-1 rounded">pnpm --filter @blessluxe/backend seed</code>
                <span className="text-black/55"> — the seed creates a sample definition (handle ends with </span>
                <code className="text-xs bg-black/[0.06] px-1 rounded">-wholesale-pack</code>
                <span className="text-black/55">).</span>
              </li>
              <li>
                Point the storefront at the same DB as Medusa: set{" "}
                <code className="text-xs bg-black/[0.06] px-1 rounded">DATABASE_URL</code> or{" "}
                <code className="text-xs bg-black/[0.06] px-1 rounded">AI_DATABASE_URL</code> in{" "}
                <code className="text-xs bg-black/[0.06] px-1 rounded">apps/storefront/.env.local</code> to match{" "}
                <code className="text-xs bg-black/[0.06] px-1 rounded">backend/medusa/.env</code>{" "}
                <code className="text-xs bg-black/[0.06] px-1 rounded">DATABASE_URL</code>, then refresh this page.
              </li>
            </ol>
            <p className="text-xs text-black/50">
              If migrations ran but seed skipped pack creation, check the seed log for “Pack seed skipped” — run migrate
              first, then seed again.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4 md:gap-5">
            {enriched.map((p) => {
              const href = p.productHandle ? `/shop/${encodeURIComponent(p.productHandle)}` : "/shop";
              return (
                <li key={p.id}>
                  <Link
                    href={href}
                    className="group flex h-full flex-col rounded-xl border border-theme-primary/20 overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="relative aspect-[3/4] bg-theme-background-dark shrink-0">
                      {p.thumb ? (
                        <Image
                          src={p.thumb}
                          alt={p.title}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, (max-width: 1536px) 25vw, 20vw"
                        />
                      ) : null}
                    </div>
                    <div className="flex flex-1 flex-col p-3 sm:p-3.5">
                      <h2 className="font-display text-sm sm:text-base leading-snug text-black group-hover:text-theme-primary transition-colors line-clamp-2">
                        {p.title}
                      </h2>
                      <p className="text-xs sm:text-sm text-black/60 mt-1 line-clamp-2 flex-1">
                        {p.description || "Full pack — all sizes"}
                      </p>
                      <span className="inline-block mt-2 text-xs sm:text-sm font-medium text-theme-primary">
                        View pack →
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
