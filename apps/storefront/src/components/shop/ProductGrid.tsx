"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { SlidersHorizontal, Grid3X3, LayoutList, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useShopFilters } from "@/hooks/useShopFilters";
import { ProductCard } from "@/components/home/ProductCard";
import { useProducts, useCategories } from "@/hooks/useProducts";

const sortOptions = [
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "name-asc", label: "Name: A-Z" },
  { value: "name-desc", label: "Name: Z-A" },
];

interface ProductGridProps {
  onOpenFilters: () => void;
}

export function ProductGrid({ onOpenFilters }: ProductGridProps) {
  const { filters, setSort } = useShopFilters();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [visibleCount, setVisibleCount] = useState(12);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data: categories } = useCategories();
  const categoryIds = useMemo(() => {
    if (!filters.category || !categories) return undefined;
    const match = categories.find((c) => c.handle === filters.category);
    if (!match) return undefined;

    const childIds = categories
      .filter((category) => category.parent_category_id === match.id)
      .map((category) => category.id);

    return [match.id, ...childIds];
  }, [filters.category, categories]);

  const { data: rawProducts, isLoading } = useProducts({
    limit: 50,
    category_id: categoryIds,
  });

  const mappedProducts = useMemo(() => {
    return (rawProducts || []).map((p) => {
      const firstVariant = p.variants?.[0] as Record<string, unknown> | undefined;
      const calcPrice = firstVariant?.calculated_price as Record<string, unknown> | undefined;
      const price = (calcPrice?.calculated_amount as number) ?? (firstVariant?.prices as Array<{amount: number}>)?.[0]?.amount ?? 0;
      const tags = (p.tags || []).map((t) => t.value);
      const badge = tags.includes("new")
        ? ("new" as const)
        : tags.includes("sale")
          ? ("sale" as const)
          : null;

      const sizes = p.variants
        ?.flatMap((v) => v.title?.split(" / ") || [])
        .filter((s) => ["XS", "S", "M", "L", "XL"].includes(s));

      return {
        id: p.id,
        title: p.title,
        handle: p.handle,
        price,
        thumbnail: p.thumbnail,
        badge,
        colors: [] as string[],
        sizes: [...new Set(sizes)],
      };
    });
  }, [rawProducts]);

  const filteredProducts = useMemo(() => {
    let result = [...mappedProducts];

    if (filters.sizes.length > 0) {
      result = result.filter((p) =>
        filters.sizes.some((s) => p.sizes.includes(s))
      );
    }

    if (filters.minPrice !== null) {
      result = result.filter((p) => p.price / 100 >= filters.minPrice!);
    }
    if (filters.maxPrice !== null) {
      result = result.filter((p) => p.price / 100 <= filters.maxPrice!);
    }

    switch (filters.sort) {
      case "price-asc":
        result.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        result.sort((a, b) => b.price - a.price);
        break;
      case "name-asc":
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "name-desc":
        result.sort((a, b) => b.title.localeCompare(a.title));
        break;
      default:
        break;
    }

    return result;
  }, [mappedProducts, filters]);

  const visibleProducts = filteredProducts.slice(0, visibleCount);
  const hasMore = visibleCount < filteredProducts.length;

  const handleLoadMore = () => {
    setLoadingMore(true);
    setTimeout(() => {
      setVisibleCount((prev) => prev + 6);
      setLoadingMore(false);
    }, 300);
  };

  return (
    <div className="flex-1">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-theme-primary/20 theme-transition">
        <div className="flex items-center gap-4">
          <button
            onClick={onOpenFilters}
            className="lg:hidden flex items-center gap-2 px-4 py-2 border border-theme-primary/30 rounded-lg hover:border-theme-primary theme-transition"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="text-sm font-medium">Filters</span>
          </button>

          <p className="text-sm text-black/60">
            Showing{" "}
            <span className="font-semibold text-black">{visibleProducts.length}</span>{" "}
            of{" "}
            <span className="font-semibold text-black">{filteredProducts.length}</span>{" "}
            products
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <select
              value={filters.sort}
              onChange={(e) => setSort(e.target.value)}
              className="appearance-none bg-transparent border border-theme-primary/30 rounded-lg px-4 py-2 pr-10 text-sm focus:outline-none focus:border-theme-primary cursor-pointer theme-transition"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-black/50" />
          </div>

          <div className="hidden sm:flex items-center border border-theme-primary/30 rounded-lg overflow-hidden theme-transition">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-2 transition-colors",
                viewMode === "grid" ? "bg-theme-primary text-white" : "hover:bg-theme-primary/10"
              )}
              aria-label="Grid view"
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-2 transition-colors",
                viewMode === "list" ? "bg-theme-primary text-white" : "hover:bg-theme-primary/10"
              )}
              aria-label="List view"
            >
              <LayoutList className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-[3/4] bg-cream-dark rounded-lg mb-4" />
              <div className="h-4 bg-cream-dark rounded w-3/4 mb-2" />
              <div className="h-4 bg-cream-dark rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-lg text-black/60 mb-4">No products match your filters</p>
          <button
            onClick={() => window.location.href = "/shop"}
            className="text-theme-primary hover:underline theme-transition"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <>
          <div
            className={cn(
              "grid gap-6",
              viewMode === "grid"
                ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                : "grid-cols-1"
            )}
          >
            {visibleProducts.map((product, index) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <ProductCard
                  id={product.id}
                  title={product.title}
                  handle={product.handle}
                  price={product.price}
                  thumbnail={product.thumbnail}
                  badge={product.badge}
                  colors={product.colors}
                />
              </motion.div>
            ))}
          </div>

          {loadingMore && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[3/4] bg-cream-dark rounded-lg mb-4" />
                  <div className="h-4 bg-cream-dark rounded w-3/4 mb-2" />
                  <div className="h-4 bg-cream-dark rounded w-1/2" />
                </div>
              ))}
            </div>
          )}

          {hasMore && !loadingMore && (
            <div className="text-center mt-12">
              <button
                onClick={handleLoadMore}
                className="inline-flex items-center gap-2 px-8 py-3 bg-theme-primary text-white font-semibold rounded-full hover:bg-theme-primary-dark theme-transition"
              >
                Load More Products
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
