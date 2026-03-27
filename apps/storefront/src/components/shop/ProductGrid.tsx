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
  const COLOR_HEX_BY_LABEL: Record<string, string> = {
    black: "#111827",
    white: "#F9FAFB",
    cream: "#F5F5DC",
    ivory: "#FFFFF0",
    navy: "#1E3A8A",
    blue: "#2563EB",
    red: "#B91C1C",
    burgundy: "#7F1D1D",
    green: "#166534",
    olive: "#556B2F",
    pink: "#EC4899",
    blush: "#F9A8D4",
    gold: "#D4AF37",
    silver: "#9CA3AF",
    gray: "#6B7280",
    grey: "#6B7280",
    brown: "#92400E",
    beige: "#D6D3C9",
    camel: "#C19A6B",
  };
  const normalizeColorId = (value: string) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  const looksLikeSize = (value: string) => {
    const token = String(value || "").trim().toUpperCase();
    if (!token) return false;
    if (["XS", "S", "M", "L", "XL", "XXL", "XXXL"].includes(token)) return true;
    if (/^\d{2}$/.test(token)) return true;
    if (/^\d{1,2}(Y|M)$/.test(token)) return true;
    return false;
  };
  const readOptionValues = (option: Record<string, unknown>) => {
    const values = Array.isArray(option.values) ? option.values : [];
    return values
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object") {
          return String((entry as Record<string, unknown>).value || "");
        }
        return "";
      })
      .map((value) => value.trim())
      .filter(Boolean);
  };

  const mappedProducts = useMemo(() => {
    return (rawProducts || []).map((p) => {
      const record = p as unknown as Record<string, unknown>;
      const firstVariant = p.variants?.[0] as Record<string, unknown> | undefined;
      const calcPrice = firstVariant?.calculated_price as Record<string, unknown> | undefined;
      const price = (calcPrice?.calculated_amount as number) ?? (firstVariant?.prices as Array<{amount: number}>)?.[0]?.amount ?? 0;
      const tags = (p.tags || []).map((t) => t.value);
      const badge = tags.includes("new")
        ? ("new" as const)
        : tags.includes("sale")
          ? ("sale" as const)
          : null;
      const options = Array.isArray(record.options)
        ? (record.options as Array<Record<string, unknown>>)
        : [];
      const sizeSet = new Set<string>();
      const colorIdSet = new Set<string>();
      const colorHexSet = new Set<string>();

      for (const option of options) {
        const title = String(option.title || "").toLowerCase();
        const optionValues = readOptionValues(option);
        if (title.includes("size")) {
          for (const value of optionValues) {
            if (looksLikeSize(value)) sizeSet.add(value.toUpperCase());
          }
        }
        if (title.includes("color")) {
          for (const value of optionValues) {
            const colorId = normalizeColorId(value);
            if (!colorId) continue;
            colorIdSet.add(colorId);
            colorHexSet.add(COLOR_HEX_BY_LABEL[colorId] || "#9CA3AF");
          }
        }
      }

      for (const variant of p.variants || []) {
        const parts = String(variant.title || "")
          .split(" / ")
          .map((part) => part.trim())
          .filter(Boolean);
        for (const part of parts) {
          if (looksLikeSize(part)) {
            sizeSet.add(part.toUpperCase());
            continue;
          }
          const colorId = normalizeColorId(part);
          if (colorId) {
            colorIdSet.add(colorId);
            colorHexSet.add(COLOR_HEX_BY_LABEL[colorId] || "#9CA3AF");
          }
        }
      }

      const variantRows = Array.isArray(p.variants) ? p.variants : [];
      const variantQuantities = variantRows
        .map((variant) => Number((variant as unknown as Record<string, unknown>).inventory_quantity))
        .filter((n) => Number.isFinite(n) && n >= 0);
      const aggregateQty =
        variantQuantities.length > 0
          ? variantQuantities.reduce((sum, n) => sum + n, 0)
          : undefined;
      const stockMeta =
        aggregateQty == null
          ? { stockLabel: undefined, stockTone: undefined }
          : aggregateQty <= 0
            ? { stockLabel: "Out of stock", stockTone: "out" as const }
            : aggregateQty <= 2
              ? { stockLabel: `Only ${aggregateQty} left`, stockTone: "critical" as const }
              : aggregateQty <= 5
                ? { stockLabel: `${aggregateQty} left`, stockTone: "low" as const }
                : { stockLabel: "In stock", stockTone: "in" as const };

      return {
        id: p.id,
        title: p.title,
        handle: p.handle,
        price,
        thumbnail: normalizeProductImageUrl(p.thumbnail || p.images?.[0]?.url || null),
        badge,
        colorIds: Array.from(colorIdSet),
        colors: Array.from(colorHexSet),
        sizes: Array.from(sizeSet),
        stockLabel: stockMeta.stockLabel,
        stockTone: stockMeta.stockTone,
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
    if (filters.colors.length > 0) {
      result = result.filter((p) =>
        filters.colors.some((color) => p.colorIds.includes(color))
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
                  sizes={product.sizes}
                  stockLabel={product.stockLabel}
                  stockTone={product.stockTone}
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
