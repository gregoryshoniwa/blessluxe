"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Heart, ShoppingBag, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFeaturedProducts } from "@/hooks/useProducts";

type HotBadge = "HOT" | "SALE" | "TRENDING" | "NEW" | "BESTSELLER";

export function HotPicks() {
  const { data: products } = useFeaturedProducts(8);
  const normalizeProductImageUrl = (value: string | null | undefined) => {
    const input = String(value || "").trim();
    if (!input) return "";
    const publicBase = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "").replace(/\/+$/, "");
    if (input.startsWith("/")) return publicBase ? `${publicBase}${input}` : input;
    if (publicBase && input.startsWith("http://medusa:9000")) {
      return `${publicBase}${input.slice("http://medusa:9000".length)}`;
    }
    if (publicBase && input.startsWith("https://medusa:9000")) {
      return `${publicBase}${input.slice("https://medusa:9000".length)}`;
    }
    return input;
  };
  const formatPrice = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  const toNumber = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  const getBadgeInfoFromTags = (values: string[]): { badge: HotBadge | null; locked: boolean } => {
    if (values.some((tag) => tag.includes("sale"))) return { badge: "SALE", locked: true };
    if (values.some((tag) => tag.includes("hot"))) return { badge: "HOT", locked: true };
    if (values.some((tag) => tag.includes("new"))) return { badge: "NEW", locked: true };
    if (values.some((tag) => tag.includes("trending"))) return { badge: "TRENDING", locked: false };
    if (values.some((tag) => tag.includes("bestseller") || tag.includes("best-seller"))) {
      return { badge: "BESTSELLER", locked: false };
    }
    return { badge: null, locked: false };
  };
  const curatedBadgeCycle: HotBadge[] = ["HOT", "SALE", "TRENDING", "NEW", "BESTSELLER"];
  const rebalanceBadges = <
    T extends {
      badge: HotBadge | null;
      badgeLocked: boolean;
    },
  >(
    items: T[]
  ) => {
    const counts = new Map<HotBadge, number>(
      curatedBadgeCycle.map((badge) => [badge, 0] as const)
    );
    return items.map((item, index) => {
      let finalBadge = item.badge;
      if (!item.badgeLocked || !finalBadge) {
        const currentCounts = curatedBadgeCycle.map((badge) => counts.get(badge) || 0);
        const minCount = Math.min(...currentCounts);
        const leastUsed = curatedBadgeCycle.filter((badge) => (counts.get(badge) || 0) === minCount);
        const rotated = curatedBadgeCycle[index % curatedBadgeCycle.length];
        const preferred = item.badge && leastUsed.includes(item.badge) ? item.badge : null;
        finalBadge = preferred || (leastUsed.includes(rotated) ? rotated : leastUsed[0]);
      }
      if (finalBadge) counts.set(finalBadge, (counts.get(finalBadge) || 0) + 1);
      return { ...item, badge: finalBadge };
    });
  };
  const parseColorsFromMetadata = (metadata: Record<string, unknown> | undefined) => {
    const raw = metadata?.trending_colors;
    if (Array.isArray(raw)) {
      return raw.map((v) => String(v)).slice(0, 4);
    }
    if (typeof raw === "string" && raw.trim()) {
      return raw
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .slice(0, 4);
    }
    return [];
  };

  const hotProductsBase =
    (products || []).map((p, index) => {
      const firstVariant = p.variants?.[0] as Record<string, unknown> | undefined;
      const calcPrice = firstVariant?.calculated_price as Record<string, unknown> | undefined;
      const prices = firstVariant?.prices as Array<{ amount: number }> | undefined;
      const amount = Number(calcPrice?.calculated_amount || prices?.[0]?.amount || 0);
      const originalAmount = Number(calcPrice?.original_amount || amount || 0);
      const metadata = ((p as unknown as Record<string, unknown>).metadata || {}) as Record<string, unknown>;
      const tags = (p.tags || []).map((t) => String(t.value || "").toLowerCase());
      const badgeInfo = getBadgeInfoFromTags(tags);
      const optionColorValues =
        (p.variants || [])
          .flatMap((variant) => String(variant.title || "").split(" / ").map((part) => part.trim()))
          .filter((part) => /black|white|cream|gold|red|green|blue|pink|beige|brown|gray|grey|ivory|navy/i.test(part))
          .slice(0, 3);
      const basePrice = amount > 0 ? Number((amount / 100).toFixed(2)) : 0;
      const metadataCompareCents = toNumber(metadata.compare_at_price_cents);
      const metadataCompare = toNumber(metadata.compare_at_price);
      const realCompareFromCalc = originalAmount > amount && amount > 0 ? Number((originalAmount / 100).toFixed(2)) : 0;
      const compareFromMetadata = metadataCompareCents > 0 ? metadataCompareCents / 100 : metadataCompare;
      const fallbackCompare =
        basePrice > 0 && (badgeInfo.badge === "HOT" || badgeInfo.badge === "SALE")
          ? Number((basePrice * 1.2).toFixed(2))
          : undefined;
      const originalPrice = realCompareFromCalc || compareFromMetadata || fallbackCompare || undefined;
      const metadataRating = toNumber(metadata.trending_rating || metadata.rating);
      const metadataReviews = toNumber(metadata.trending_reviews || metadata.reviews);
      const metadataColors = parseColorsFromMetadata(metadata);
      const colors =
        metadataColors.length > 0
          ? metadataColors
          : optionColorValues.length > 0
            ? ["#1A1A1A", "#D4AF37", "#F5F5DC"]
            : [];

      return {
        id: p.id,
        name: p.title,
        handle: p.handle || "shop",
        price: basePrice,
        originalPrice,
        image: normalizeProductImageUrl(p.thumbnail || p.images?.[0]?.url || ""),
        badge: badgeInfo.badge,
        badgeLocked: badgeInfo.locked,
        rating: metadataRating > 0 ? metadataRating : 4.8,
        reviews: metadataReviews > 0 ? metadataReviews : 0,
        colors,
      };
    }).filter((p) => p.image) || [];
  const hotProducts = rebalanceBadges(hotProductsBase).map((p) => {
    const { badgeLocked: _badgeLocked, ...product } = p;
    return product;
  });

  return (
    <section className="py-16 md:py-24 px-[5%] bg-gradient-to-b from-cream to-cream-dark/30">
      {/* Header */}
      <div className="text-center mb-12 md:mb-16">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="font-script text-2xl md:text-3xl text-gold mb-3"
        >
          Hot Right Now
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="font-display text-2xl md:text-3xl tracking-widest uppercase"
        >
          Trending Picks
        </motion.h2>
        <motion.div
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="w-20 h-0.5 bg-gold mx-auto mt-5 origin-center"
        />
      </div>

      {/* Products Grid */}
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {hotProducts.map((product, index) => (
          <motion.div
            key={product.id}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.05 }}
            className="group"
          >
            <Link href={`/shop/${product.handle}`} className="block">
              {/* Image Container */}
              <div className="relative aspect-[3/4] mb-4 rounded-lg overflow-hidden bg-cream-dark">
                <div className="absolute inset-0 bg-gradient-to-br from-blush via-cream to-cream-dark" />
                <img
                  src={product.image}
                  alt={product.name}
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />

                {/* Badge */}
                {product.badge && (
                  <span
                    className={cn(
                      "absolute top-3 left-3 px-2.5 py-1 text-xs font-semibold tracking-wide rounded-sm z-10",
                      product.badge === "SALE"
                        ? "bg-red-600 text-white"
                        : product.badge === "HOT"
                        ? "bg-red-500 text-white"
                        : product.badge === "NEW"
                        ? "bg-gold text-white"
                        : product.badge === "TRENDING"
                        ? "bg-black text-white"
                        : "bg-zinc-800 text-white"
                    )}
                  >
                    {product.badge}
                  </span>
                )}

                {/* Quick Actions */}
                <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button
                    className="p-2 bg-white rounded-full shadow-lg hover:bg-gold hover:text-white transition-colors"
                    aria-label="Add to wishlist"
                  >
                    <Heart className="w-4 h-4" />
                  </button>
                  <button
                    className="p-2 bg-white rounded-full shadow-lg hover:bg-gold hover:text-white transition-colors"
                    aria-label="Quick add"
                  >
                    <ShoppingBag className="w-4 h-4" />
                  </button>
                </div>

                {/* Sale badge */}
                {product.originalPrice && (
                  <span className="absolute bottom-3 left-3 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-sm z-10">
                    -{Math.round((1 - product.price / product.originalPrice) * 100)}%
                  </span>
                )}
              </div>

              {/* Product Info */}
              <div className="space-y-2">
                {/* Rating */}
                <div className="flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-gold text-gold" />
                  <span className="text-xs font-medium">{product.rating}</span>
                  {product.reviews > 0 ? (
                    <span className="text-xs text-black/50">({product.reviews})</span>
                  ) : null}
                </div>

                {/* Name */}
                <h3 className="font-display text-sm md:text-base group-hover:text-gold transition-colors line-clamp-1">
                  {product.name}
                </h3>

                {/* Price */}
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-black">
                    {formatPrice(product.price)}
                  </span>
                  {product.originalPrice && (
                    <span className="text-sm text-black/50 line-through">
                      {formatPrice(product.originalPrice)}
                    </span>
                  )}
                </div>

                {/* Color swatches */}
                <div className="flex gap-1.5">
                  {product.colors.slice(0, 4).map((color, i) => (
                    <div
                      key={i}
                      className="w-4 h-4 rounded-full border border-black/10"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
      {hotProducts.length === 0 ? (
        <p className="text-center text-sm text-black/60 mt-4">
          No trending products available yet. Add products in Medusa and tag them (e.g. `hot`, `trending`, `bestseller`).
        </p>
      ) : null}

      {/* View All Link */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="text-center mt-12"
      >
        <Link
          href="/shop"
          className="inline-block bg-gold text-white px-10 py-4 text-sm font-semibold tracking-widest uppercase hover:bg-gold-dark transition-colors"
        >
          View All Trending
        </Link>
      </motion.div>
    </section>
  );
}
