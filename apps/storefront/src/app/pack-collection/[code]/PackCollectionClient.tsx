"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

type Props = {
  collectionCode: string;
  packTitle: string;
  sizeLabel: string;
  slotStatus: string;
  campaignStatus: string;
  campaignPublicCode: string;
  affiliateCode: string | null;
  packPageHref: string | null;
  productThumbnailUrl: string | null;
  productShopHandle: string | null;
};

function humanizeStatus(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function PackCollectionClient({
  collectionCode,
  packTitle,
  sizeLabel,
  slotStatus,
  campaignStatus,
  campaignPublicCode,
  affiliateCode,
  packPageHref,
  productThumbnailUrl,
  productShopHandle,
}: Props) {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(collectionCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const hasProductImage = Boolean(productThumbnailUrl);

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
      <p className="text-center text-xs uppercase tracking-[0.25em] text-black/45">BLESSLUXE · Group pack</p>
      <h1 className="font-display text-3xl sm:text-4xl text-center mt-4 text-[var(--theme-text)] leading-tight">
        Your collection code
      </h1>
      <p className="text-center text-sm text-black/55 mt-3 max-w-md mx-auto leading-relaxed">
        Show this page or the code below when collecting your item or confirming your slot with the host or store team.
      </p>

      <div
        className={`mt-10 grid gap-8 items-stretch ${hasProductImage ? "md:grid-cols-[minmax(0,1fr)_minmax(260px,380px)]" : ""}`}
      >
        <div className={`min-w-0 ${hasProductImage ? "" : "max-w-lg mx-auto w-full"}`}>
      <div className="rounded-2xl border-2 border-theme-primary/50 bg-white/90 shadow-lg overflow-hidden h-full flex flex-col">
        <div className="bg-gradient-to-br from-amber-50/90 via-white to-[var(--cream)] px-6 py-8 sm:px-8">
          <p className="text-xs uppercase tracking-[0.2em] text-theme-primary font-semibold">Code</p>
          <p className="font-mono text-2xl sm:text-3xl font-bold tracking-[0.12em] text-[var(--theme-text)] mt-2 break-all">
            {collectionCode}
          </p>
          <button
            type="button"
            onClick={() => void copyCode()}
            className="mt-5 w-full sm:w-auto rounded-xl border-2 border-theme-primary bg-theme-primary/10 px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.12em] text-black/80 hover:bg-theme-primary/20 transition-colors"
          >
            {copied ? "Copied" : "Copy code"}
          </button>
        </div>

        <dl className="divide-y divide-black/10 px-6 sm:px-8 py-2 text-sm">
          <div className="flex justify-between gap-4 py-3.5">
            <dt className="text-black/50 shrink-0">Pack</dt>
            <dd className="font-medium text-right text-[var(--theme-text)]">{packTitle}</dd>
          </div>
          <div className="flex justify-between gap-4 py-3.5">
            <dt className="text-black/50 shrink-0">Your size</dt>
            <dd className="font-semibold text-right">{sizeLabel}</dd>
          </div>
          <div className="flex justify-between gap-4 py-3.5">
            <dt className="text-black/50 shrink-0">Payment status</dt>
            <dd className="text-right">
              <span className="inline-block rounded-full bg-black/[0.06] px-3 py-0.5 text-xs font-medium uppercase tracking-wide">
                {humanizeStatus(slotStatus)}
              </span>
            </dd>
          </div>
          <div className="flex justify-between gap-4 py-3.5">
            <dt className="text-black/50 shrink-0">Pack campaign</dt>
            <dd className="text-right">
              <span className="inline-block rounded-full bg-theme-primary/15 px-3 py-0.5 text-xs font-medium text-black/80">
                {humanizeStatus(campaignStatus)}
              </span>
            </dd>
          </div>
          {affiliateCode ? (
            <div className="flex justify-between gap-4 py-3.5">
              <dt className="text-black/50 shrink-0">Shop</dt>
              <dd className="font-mono text-xs text-right break-all">{affiliateCode}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4 py-3.5">
            <dt className="text-black/50 shrink-0">Reference</dt>
            <dd className="font-mono text-xs text-black/65 text-right break-all">{campaignPublicCode}</dd>
          </div>
        </dl>
      </div>
        </div>

        {hasProductImage && productThumbnailUrl ? (
          <div className="flex flex-col min-w-0">
            <div className="rounded-2xl border-2 border-theme-primary/50 bg-white/90 shadow-lg overflow-hidden flex flex-col h-full">
              <p className="text-xs uppercase tracking-[0.2em] text-theme-primary font-semibold px-5 pt-5 sm:px-6">
                Your item
              </p>
              <div className="relative mx-4 sm:mx-6 mt-3 mb-4 aspect-[3/4] max-h-[min(520px,55vh)] rounded-2xl overflow-hidden border border-black/10 bg-black/[0.04]">
                <Image
                  src={productThumbnailUrl}
                  alt={packTitle}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 380px"
                  priority
                />
              </div>
              {productShopHandle ? (
                <div className="mt-auto px-5 pb-5 sm:px-6 text-center border-t border-black/10 pt-4">
                  <Link
                    href={`/shop/${encodeURIComponent(productShopHandle)}`}
                    className="text-sm font-medium text-theme-primary hover:underline"
                  >
                    View product details →
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {packPageHref ? (
        <div className="mt-8 text-center">
          <Link
            href={packPageHref}
            className="inline-flex items-center justify-center rounded-xl bg-black px-6 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-white hover:bg-black/85 transition-colors"
          >
            Open live pack status
          </Link>
          <p className="text-xs text-black/45 mt-3">See progress and updates for the whole group.</p>
        </div>
      ) : (
        <p className="text-xs text-center text-black/45 mt-8">
          Keep this code private. It identifies your paid size in this wholesale pack.
        </p>
      )}

      <p className="text-center mt-10">
        <Link href="/shop" className="text-sm text-theme-primary font-medium hover:underline">
          ← Continue shopping
        </Link>
      </p>
    </div>
  );
}
