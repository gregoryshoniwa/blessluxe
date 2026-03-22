"use client";

import Link from "next/link";
import { ProductCard } from "./ProductCard";
import { useFeaturedProducts } from "@/hooks/useProducts";

type FeaturedBadge = "new" | "sale" | "hot" | "trending" | "bestseller";

export function FeaturedProducts() {
  const { data: products, isLoading } = useFeaturedProducts(8);
  const normalizeProductImageUrl = (value: string | null | undefined) => {
    const input = String(value || "").trim();
    if (!input) return null;
    const publicBase = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "").replace(/\/+$/, "");
    if (input.startsWith("/")) {
      return publicBase ? `${publicBase}${input}` : input;
    }
    if (publicBase && input.startsWith("http://medusa:9000")) {
      return `${publicBase}${input.slice("http://medusa:9000".length)}`;
    }
    if (publicBase && input.startsWith("https://medusa:9000")) {
      return `${publicBase}${input.slice("https://medusa:9000".length)}`;
    }
    return input;
  };
  const toNumber = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  const getBadgeInfoFromTags = (values: string[]) => {
    if (values.some((tag) => tag.includes("sale"))) return { badge: "sale" as const, locked: true };
    if (values.some((tag) => tag.includes("hot"))) return { badge: "hot" as const, locked: true };
    if (values.some((tag) => tag.includes("new"))) return { badge: "new" as const, locked: true };
    if (values.some((tag) => tag.includes("trending"))) return { badge: "trending" as const, locked: false };
    if (values.some((tag) => tag.includes("bestseller") || tag.includes("best-seller"))) {
      return { badge: "bestseller" as const, locked: false };
    }
    return { badge: null, locked: false };
  };
  const curatedBadgeCycle: FeaturedBadge[] = ["hot", "sale", "new", "trending", "bestseller"];
  const rebalanceBadges = <
    T extends {
      badge: FeaturedBadge | null;
      badgeLocked: boolean;
    },
  >(
    items: T[]
  ) => {
    const counts = new Map<FeaturedBadge, number>(curatedBadgeCycle.map((badge) => [badge, 0] as const));
    return items.map((item, index) => {
      let finalBadge = item.badge;
      if (!item.badgeLocked || !finalBadge) {
        const minCount = Math.min(...curatedBadgeCycle.map((badge) => counts.get(badge) || 0));
        const leastUsed = curatedBadgeCycle.filter((badge) => (counts.get(badge) || 0) === minCount);
        const rotated = curatedBadgeCycle[index % curatedBadgeCycle.length];
        const preferred = item.badge && leastUsed.includes(item.badge) ? item.badge : null;
        finalBadge = preferred || (leastUsed.includes(rotated) ? rotated : leastUsed[0]);
      }
      if (finalBadge) counts.set(finalBadge, (counts.get(finalBadge) || 0) + 1);
      return { ...item, badge: finalBadge };
    });
  };

  const mappedBase = (products || []).map((p) => {
    const firstVariant = p.variants?.[0] as Record<string, unknown> | undefined;
    const calcPrice = firstVariant?.calculated_price as Record<string, unknown> | undefined;
    const prices = firstVariant?.prices as Array<{ amount: number }> | undefined;
    const price = toNumber(calcPrice?.calculated_amount) || toNumber(prices?.[0]?.amount);
    const originalAmount = toNumber(calcPrice?.original_amount);
    const metadata = ((p as unknown as Record<string, unknown>).metadata || {}) as Record<string, unknown>;
    const metadataCompareCents = toNumber(metadata.compare_at_price_cents);
    const metadataCompare = toNumber(metadata.compare_at_price);
    const tags = (p.tags || []).map((t) => String(t.value || "").toLowerCase());
    const badgeInfo = getBadgeInfoFromTags(tags);
    const compareFromMetadata = metadataCompareCents > 0 ? metadataCompareCents : metadataCompare * 100;
    const fallbackCompare =
      price > 0 && (badgeInfo.badge === "sale" || badgeInfo.badge === "hot")
        ? Math.round(price * 1.2)
        : 0;
    const compareAtPrice = originalAmount > price ? originalAmount : compareFromMetadata || fallbackCompare || 0;
    const sizes = Array.from(
      new Set(
        (p.variants || [])
          .flatMap((variant) => String(variant.title || "").split(" / ").map((part) => part.trim()))
          .filter((part) => ["XS", "S", "M", "L", "XL", "XXL", "30", "32", "34", "36", "38", "40"].includes(part))
      )
    );

    return {
      id: p.id,
      title: p.title,
      handle: p.handle,
      price,
      compareAtPrice: compareAtPrice > price ? compareAtPrice : undefined,
      thumbnail: normalizeProductImageUrl(p.thumbnail || p.images?.[0]?.url || null),
      badge: badgeInfo.badge,
      badgeLocked: badgeInfo.locked,
      colors: [] as string[],
      sizes,
    };
  });
  const mapped = rebalanceBadges(mappedBase).map((p) => {
    const { badgeLocked: _badgeLocked, ...product } = p;
    return product;
  });

  return (
    <section className="py-16 md:py-24 px-[5%] bg-white">
      <div className="text-center mb-12 md:mb-16">
        <p className="font-script text-2xl text-gold mb-3">Curated for You</p>
        <h2 className="font-display text-2xl md:text-3xl tracking-widest uppercase">
          New Arrivals
        </h2>
        <div className="w-20 h-0.5 bg-gold mx-auto mt-5" />
      </div>

      {isLoading ? (
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-[3/4] bg-cream-dark rounded-lg mb-4" />
              <div className="h-4 bg-cream-dark rounded w-3/4 mb-2" />
              <div className="h-4 bg-cream-dark rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {mapped.map((product) => (
            <ProductCard
              key={product.id}
              id={product.id}
              title={product.title}
              handle={product.handle}
              price={product.price}
              compareAtPrice={product.compareAtPrice}
              thumbnail={product.thumbnail}
              badge={product.badge}
              colors={product.colors}
              sizes={product.sizes}
            />
          ))}
        </div>
      )}

      <div className="text-center mt-12">
        <Link
          href="/shop"
          className="inline-block border-2 border-gold text-gold px-10 py-3 text-sm font-semibold tracking-widest uppercase hover:bg-gold hover:text-white transition-colors"
        >
          View All
        </Link>
      </div>
    </section>
  );
}
