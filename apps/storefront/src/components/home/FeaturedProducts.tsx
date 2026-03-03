"use client";

import Link from "next/link";
import { ProductCard } from "./ProductCard";
import { useFeaturedProducts } from "@/hooks/useProducts";

export function FeaturedProducts() {
  const { data: products, isLoading } = useFeaturedProducts(8);

  const mapped = (products || []).map((p) => {
    const firstVariant = p.variants?.[0] as Record<string, unknown> | undefined;
    const calcPrice = firstVariant?.calculated_price as Record<string, unknown> | undefined;
    const prices = firstVariant?.prices as Array<{ amount: number }> | undefined;
    const price = (calcPrice?.calculated_amount as number) ?? prices?.[0]?.amount ?? 0;
    const tags = (p.tags || []).map((t) => t.value);
    const badge = tags.includes("new")
      ? ("new" as const)
      : tags.includes("sale")
        ? ("sale" as const)
        : null;

    return {
      id: p.id,
      title: p.title,
      handle: p.handle,
      price,
      thumbnail: p.thumbnail,
      badge,
      colors: [] as string[],
    };
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
              thumbnail={product.thumbnail}
              badge={product.badge}
              colors={product.colors}
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
