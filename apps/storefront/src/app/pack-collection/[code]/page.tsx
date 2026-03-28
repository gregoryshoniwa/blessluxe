import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchStoreProductThumbAndHandle } from "@/lib/medusa";
import { getPackSlotByCollectionCode } from "@/lib/packs";
import { PackCollectionClient } from "./PackCollectionClient";

type PageProps = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const raw = decodeURIComponent(code || "").trim();
  if (!raw) return { title: "Collection code | BLESSLUXE" };

  const row = await getPackSlotByCollectionCode(raw);
  if (!row) {
    return { title: "Code not found | BLESSLUXE", robots: { index: false, follow: false } };
  }

  const title = `${row.collection_code} · ${row.pack_title}`;
  return {
    title: `${title} | BLESSLUXE`,
    description: `Your BLESSLUXE group pack item: ${row.pack_title}, size ${row.size_label}.`,
    robots: { index: false, follow: false },
  };
}

export default async function PackCollectionPage({ params }: PageProps) {
  const { code } = await params;
  const raw = decodeURIComponent(code || "").trim();
  if (!raw) notFound();

  const row = await getPackSlotByCollectionCode(raw);
  if (!row) notFound();

  const aff = row.affiliate_code?.trim() || null;
  const publicCode = row.campaign_public_code?.trim() || "";
  const packPageHref =
    aff && publicCode ? `/affiliate/shop/${encodeURIComponent(aff)}/pack/${encodeURIComponent(publicCode)}` : null;

  let productThumbnailUrl: string | null = null;
  let productShopHandle: string | null = null;
  const pid = row.product_id?.trim();
  if (pid) {
    const media = await fetchStoreProductThumbAndHandle(pid);
    productThumbnailUrl = media.thumb;
    productShopHandle = media.handle;
  }

  return (
    <PackCollectionClient
      collectionCode={row.collection_code || raw}
      packTitle={row.pack_title}
      sizeLabel={row.size_label}
      slotStatus={row.status}
      campaignStatus={row.campaign_status}
      campaignPublicCode={publicCode}
      affiliateCode={aff}
      packPageHref={packPageHref}
      productThumbnailUrl={productThumbnailUrl}
      productShopHandle={productShopHandle}
    />
  );
}
