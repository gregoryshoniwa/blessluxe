import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Users, Check, Lock } from "lucide-react";
import {
  getInternalBackendUrl,
  getStoreMedusaFetchHeaders,
  MEDUSA_BACKEND_URL,
} from "@/lib/medusa";

export const dynamic = "force-dynamic";

interface Slot {
  id: string;
  variant_id: string;
  size_label: string;
  status: string;
  customer_id: string | null;
  product_id: string;
  variant_title: string;
}

interface CampaignDetail {
  id: string;
  public_code: string;
  title: string | null;
  status: string;
  pack_title: string;
  pack_handle: string;
  pack_description: string | null;
  product_id: string | null;
  slots: Slot[];
}

async function loadCampaign(code: string): Promise<CampaignDetail | null> {
  try {
    const url = new URL(
      `/store/pack-campaigns/by-code/${encodeURIComponent(code)}`,
      getInternalBackendUrl()
    );
    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: { ...getStoreMedusaFetchHeaders(), connection: "close" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { campaign?: CampaignDetail };
    return json.campaign || null;
  } catch {
    return null;
  }
}

interface PackProduct {
  id: string;
  title: string;
  handle: string;
  thumbnail: string | null;
}
interface PackDetail {
  products: PackProduct[];
}

async function loadPackProducts(handle: string): Promise<PackDetail | null> {
  try {
    const url = new URL(
      `/store/packs/${encodeURIComponent(handle)}`,
      getInternalBackendUrl()
    );
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

export default async function PackCampaignPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const upper = code.toUpperCase();
  const campaign = await loadCampaign(upper);
  if (!campaign) notFound();
  const pack = await loadPackProducts(campaign.pack_handle);
  const productById = new Map<string, PackProduct>();
  for (const p of pack?.products || []) {
    productById.set(p.id, { ...p, thumbnail: publicImage(p.thumbnail) });
  }

  const claimedCount = campaign.slots.filter((s) =>
    ["paid", "reserved", "fulfilled"].includes(s.status)
  ).length;
  const totalSlots = campaign.slots.length;
  const ratio = totalSlots > 0 ? Math.round((claimedCount / totalSlots) * 100) : 0;

  return (
    <main className="min-h-screen bg-cream/40">
      <div className="max-w-[1100px] mx-auto px-[5%] py-8">
        <nav className="flex items-center gap-2 text-sm text-black/60 mb-4" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-gold-dark transition-colors">Home</Link>
          <ChevronRight className="w-4 h-4" />
          <Link href="/shop/packs" className="hover:text-gold-dark transition-colors">Packs</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-gold-dark font-medium">Group buy</span>
        </nav>

        <header className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-gold-dark" />
            <span className="text-[10px] font-semibold tracking-widest uppercase text-gold-dark">
              Group buy · {campaign.public_code}
            </span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl text-black mb-2">
            {campaign.title || campaign.pack_title}
          </h1>
          {campaign.pack_description && (
            <p className="text-black/65 text-sm max-w-2xl">{campaign.pack_description}</p>
          )}

          {/* Progress bar */}
          <div className="mt-5">
            <div className="flex items-baseline justify-between text-xs text-black/65 mb-1.5">
              <span>
                {claimedCount} of {totalSlots} slot{totalSlots === 1 ? "" : "s"} claimed
              </span>
              <span className="font-mono">{ratio}%</span>
            </div>
            <div className="h-1.5 w-full bg-black/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gold transition-all"
                style={{ width: `${ratio}%` }}
              />
            </div>
            {campaign.status !== "open" && campaign.status !== "filling" && (
              <p className="mt-2 text-xs text-black/55">
                Status:{" "}
                <span className="font-semibold uppercase tracking-widest">
                  {campaign.status}
                </span>
              </p>
            )}
          </div>
        </header>

        {/* Group by product, then list each variant slot */}
        <div className="space-y-6">
          {Array.from(
            campaign.slots.reduce<Map<string, Slot[]>>((acc, slot) => {
              const arr = acc.get(slot.product_id) || [];
              arr.push(slot);
              acc.set(slot.product_id, arr);
              return acc;
            }, new Map())
          ).map(([productId, slots]) => {
            const product = productById.get(productId);
            return (
              <section
                key={productId}
                className="bg-white border border-black/10 overflow-hidden"
              >
                {product && (
                  <div className="flex items-center gap-4 px-5 py-4 border-b border-black/10">
                    <div className="w-16 h-16 bg-cream/60 flex-shrink-0">
                      {product.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.thumbnail}
                          alt={product.title}
                          className="w-full h-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/shop/${encodeURIComponent(product.handle)}`}
                        className="font-display text-lg text-black hover:text-gold-dark transition-colors"
                      >
                        {product.title}
                      </Link>
                    </div>
                  </div>
                )}
                <ul className="divide-y divide-black/10">
                  {slots.map((slot) => {
                    const isClaimed = ["paid", "reserved", "fulfilled"].includes(slot.status);
                    return (
                      <li
                        key={slot.id}
                        className="flex items-center gap-4 px-5 py-3"
                      >
                        <span className="text-base font-semibold tracking-widest uppercase w-20">
                          {slot.size_label}
                        </span>
                        <span className="flex-1 text-xs text-black/55">
                          {isClaimed
                            ? "Taken by another customer"
                            : "Available — first come, first served"}
                        </span>
                        {isClaimed ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-widest uppercase text-black/55">
                            {slot.status === "paid" ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <Lock className="w-3 h-3" />
                            )}
                            {slot.status}
                          </span>
                        ) : product ? (
                          <Link
                            href={`/shop/${encodeURIComponent(product.handle)}`}
                            className="bg-gold text-white px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark transition-colors"
                          >
                            Claim
                          </Link>
                        ) : (
                          <span className="text-xs italic text-black/45">
                            Product unavailable
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        <div className="mt-10 rounded-sm bg-cream/60 border border-black/10 p-5 text-sm text-black/65">
          <p className="font-display text-base text-black mb-1">How a group buy works</p>
          <ol className="list-decimal list-inside space-y-1 text-xs text-black/65">
            <li>Each friend clicks <strong>Claim</strong> on the size they want.</li>
            <li>Once every slot is claimed, the pack auto-confirms.</li>
            <li>One coordinated shipment goes to the host; each customer collects their piece by sub-code.</li>
            <li>The host earns Bits for every slot filled.</li>
          </ol>
        </div>
      </div>
    </main>
  );
}
