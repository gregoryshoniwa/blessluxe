import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Layers } from "lucide-react";
import {
  getInternalBackendUrl,
  getStoreMedusaFetchHeaders,
  MEDUSA_BACKEND_URL,
} from "@/lib/medusa";
import { HostPackButton } from "@/components/packs/HostPackButton";

export const dynamic = "force-dynamic";

interface Variant {
  id: string;
  title: string;
  sku: string | null;
  inventory_quantity: number;
  prices: Array<{ currency_code: string; amount: number }> | null;
}

interface PackProductDetail {
  id: string;
  title: string;
  handle: string;
  thumbnail: string | null;
  description: string | null;
  position: number;
  variants: Variant[] | null;
}

interface PackDetail {
  id: string;
  title: string;
  handle: string;
  description: string | null;
  pack_kind: "single" | "merge";
  status: string;
  created_at: string;
  products: PackProductDetail[];
}

async function loadPack(handle: string): Promise<PackDetail | null> {
  try {
    const url = new URL(`/store/packs/${encodeURIComponent(handle)}`, getInternalBackendUrl());
    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: { ...getStoreMedusaFetchHeaders(), connection: "close" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { pack?: PackDetail };
    return json.pack || null;
  } catch {
    return null;
  }
}

function publicImage(value: string | null | undefined): string | null {
  const input = String(value || "").trim();
  if (!input) return null;
  const publicBase = MEDUSA_BACKEND_URL.replace(/\/+$/, "");
  if (input.startsWith("/")) return `${publicBase}${input}`;
  return input;
}

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
  }).format(amount / 100);
}

export default async function PackDetailPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const pack = await loadPack(handle);
  if (!pack) notFound();

  const products = pack.products.map((p) => ({
    ...p,
    thumbnail: publicImage(p.thumbnail),
  }));
  const totalVariants = products.reduce(
    (n, p) => n + (p.variants?.length || 0),
    0
  );
  const totalCents = products.reduce(
    (sum, p) =>
      sum +
      (p.variants || []).reduce((vs, v) => {
        const usd = (v.prices || []).find((pr) => pr.currency_code === "usd");
        const first = (v.prices || [])[0];
        return vs + Number(usd?.amount || first?.amount || 0);
      }, 0),
    0
  );
  const currency =
    products[0]?.variants?.[0]?.prices?.find((p) => p.currency_code === "usd")
      ?.currency_code ||
    products[0]?.variants?.[0]?.prices?.[0]?.currency_code ||
    "usd";

  return (
    <main className="min-h-screen bg-cream/40">
      <div className="max-w-[1100px] mx-auto px-[5%] py-8">
        <nav className="flex items-center gap-2 text-sm text-black/60 mb-4" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-gold-dark transition-colors">Home</Link>
          <ChevronRight className="w-4 h-4" />
          <Link href="/shop/packs" className="hover:text-gold-dark transition-colors">Packs</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-gold-dark font-medium">{pack.title}</span>
        </nav>

        <header className="flex flex-wrap items-end justify-between gap-6 mb-10">
          <div className="flex-1 min-w-[260px]">
            <div className="flex items-center gap-2 mb-2">
              {pack.pack_kind === "merge" && (
                <span className="inline-flex items-center gap-1 bg-gold-dark text-white text-[10px] font-semibold tracking-widest uppercase px-2 py-1">
                  <Layers className="w-3 h-3" />
                  Merge pack
                </span>
              )}
              <span className="text-[10px] font-semibold tracking-widest uppercase text-black/55">
                {products.length} product{products.length === 1 ? "" : "s"} · {totalVariants} slots
              </span>
            </div>
            <h1 className="font-display text-4xl md:text-5xl text-black mb-2">{pack.title}</h1>
            {pack.description && (
              <p className="text-black/70 max-w-xl text-sm leading-relaxed">{pack.description}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-black/55">
              Full-pack price
            </p>
            <p className="font-display text-3xl text-black mt-1">
              {totalCents > 0 ? formatPrice(totalCents, currency) : "—"}
            </p>
          </div>
        </header>

        <div className="mb-10">
          <HostPackButton
            packDefinitionId={pack.id}
            packTitle={pack.title}
            handle={pack.handle}
          />
        </div>

        <div className="space-y-10">
          {products.map((p) => (
            <section
              key={p.id}
              className="bg-white border border-black/10 overflow-hidden grid md:grid-cols-[280px_1fr]"
            >
              <Link
                href={`/shop/${encodeURIComponent(p.handle)}`}
                className="aspect-square md:aspect-auto bg-cream/60 relative block"
              >
                {p.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.thumbnail}
                    alt={p.title}
                    className="w-full h-full object-cover"
                  />
                ) : null}
              </Link>
              <div className="p-5 md:p-6">
                <Link
                  href={`/shop/${encodeURIComponent(p.handle)}`}
                  className="font-display text-2xl text-black hover:text-gold-dark transition-colors"
                >
                  {p.title}
                </Link>
                {p.description && (
                  <p className="text-sm text-black/65 mt-1.5 line-clamp-2">
                    {p.description}
                  </p>
                )}
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {(p.variants || []).map((v) => {
                    const usd = (v.prices || []).find((pr) => pr.currency_code === "usd");
                    const first = (v.prices || [])[0];
                    const display = usd || first;
                    return (
                      <div
                        key={v.id}
                        className="border border-black/10 p-2.5 text-center"
                      >
                        <p className="text-xs font-semibold tracking-widest uppercase">
                          {v.title}
                        </p>
                        {display && (
                          <p className="text-xs text-black/65 mt-0.5">
                            {formatPrice(Number(display.amount), display.currency_code)}
                          </p>
                        )}
                        <p className="text-[10px] text-black/45 mt-0.5">
                          {v.inventory_quantity > 0
                            ? `${v.inventory_quantity} in stock`
                            : "Out of stock"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
