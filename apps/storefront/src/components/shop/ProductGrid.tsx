"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { SlidersHorizontal, Grid3X3, LayoutList, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useShopFilters } from "@/hooks/useShopFilters";
import { ProductCard } from "@/components/home/ProductCard";

// Mock products data
const mockProducts = [
  {
    id: "1",
    title: "Silk Wrap Dress",
    handle: "silk-wrap-dress",
    price: 28900,
    compareAtPrice: null,
    thumbnail: null,
    badge: "new" as const,
    colors: ["#000000", "#800020", "#001F3F"],
    category: "dresses",
    sizes: ["XS", "S", "M", "L"],
  },
  {
    id: "2",
    title: "Cashmere Cardigan",
    handle: "cashmere-cardigan",
    price: 34500,
    compareAtPrice: 45000,
    thumbnail: null,
    badge: "sale" as const,
    colors: ["#F5F5DC", "#556B2F"],
    category: "tops",
    sizes: ["S", "M", "L", "XL"],
  },
  {
    id: "3",
    title: "Tailored Wool Blazer",
    handle: "tailored-wool-blazer",
    price: 42900,
    compareAtPrice: null,
    thumbnail: null,
    badge: null,
    colors: ["#000000", "#001F3F"],
    category: "outerwear",
    sizes: ["S", "M", "L"],
  },
  {
    id: "4",
    title: "High-Waist Trousers",
    handle: "high-waist-trousers",
    price: 18900,
    compareAtPrice: null,
    thumbnail: null,
    badge: "new" as const,
    colors: ["#000000", "#F5F5DC"],
    category: "bottoms",
    sizes: ["XS", "S", "M", "L", "XL"],
  },
  {
    id: "5",
    title: "Pleated Midi Skirt",
    handle: "pleated-midi-skirt",
    price: 22500,
    compareAtPrice: 29900,
    thumbnail: null,
    badge: "sale" as const,
    colors: ["#C9A84C", "#000000"],
    category: "bottoms",
    sizes: ["XS", "S", "M"],
  },
  {
    id: "6",
    title: "Linen Blouse",
    handle: "linen-blouse",
    price: 15900,
    compareAtPrice: null,
    thumbnail: null,
    badge: null,
    colors: ["#FFFFFF", "#F5E6E0"],
    category: "tops",
    sizes: ["S", "M", "L", "XL"],
  },
  {
    id: "7",
    title: "Velvet Evening Gown",
    handle: "velvet-evening-gown",
    price: 58900,
    compareAtPrice: null,
    thumbnail: null,
    badge: "new" as const,
    colors: ["#800020", "#000000"],
    category: "dresses",
    sizes: ["XS", "S", "M"],
  },
  {
    id: "8",
    title: "Leather Belt",
    handle: "leather-belt",
    price: 8900,
    compareAtPrice: null,
    thumbnail: null,
    badge: null,
    colors: ["#000000", "#8B4513"],
    category: "accessories",
    sizes: ["S", "M", "L"],
  },
  {
    id: "9",
    title: "Wool Overcoat",
    handle: "wool-overcoat",
    price: 65900,
    compareAtPrice: 79900,
    thumbnail: null,
    badge: "sale" as const,
    colors: ["#556B2F", "#000000"],
    category: "outerwear",
    sizes: ["M", "L", "XL"],
  },
  {
    id: "10",
    title: "Silk Scarf",
    handle: "silk-scarf",
    price: 12500,
    compareAtPrice: null,
    thumbnail: null,
    badge: null,
    colors: ["#C9A84C", "#F5E6E0", "#001F3F"],
    category: "accessories",
    sizes: [],
  },
  {
    id: "11",
    title: "Cotton Poplin Shirt",
    handle: "cotton-poplin-shirt",
    price: 13500,
    compareAtPrice: null,
    thumbnail: null,
    badge: "new" as const,
    colors: ["#FFFFFF", "#000000"],
    category: "men",
    sizes: ["S", "M", "L", "XL", "XXL"],
  },
  {
    id: "12",
    title: "Kids Knit Sweater",
    handle: "kids-knit-sweater",
    price: 6900,
    compareAtPrice: null,
    thumbnail: null,
    badge: null,
    colors: ["#F5E6E0", "#001F3F"],
    category: "children",
    sizes: ["XS", "S", "M"],
  },
];

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
  const [visibleCount, setVisibleCount] = useState(9);
  const [isLoading, setIsLoading] = useState(false);

  // Filter and sort products
  const filteredProducts = useMemo(() => {
    let result = [...mockProducts];

    // Category filter
    if (filters.category) {
      result = result.filter(
        (p) =>
          p.category === filters.category ||
          (filters.category === "women" &&
            ["dresses", "tops", "bottoms", "outerwear"].includes(p.category)) ||
          (filters.category === "men" && p.category === "men") ||
          (filters.category === "children" && p.category === "children")
      );
    }

    // Size filter
    if (filters.sizes.length > 0) {
      result = result.filter((p) =>
        filters.sizes.some((s) => p.sizes.includes(s))
      );
    }

    // Price filter
    if (filters.minPrice !== null) {
      result = result.filter((p) => p.price / 100 >= filters.minPrice!);
    }
    if (filters.maxPrice !== null) {
      result = result.filter((p) => p.price / 100 <= filters.maxPrice!);
    }

    // Color filter
    if (filters.colors.length > 0) {
      const colorMap: Record<string, string> = {
        black: "#000000",
        white: "#FFFFFF",
        cream: "#F5F5DC",
        navy: "#001F3F",
        burgundy: "#800020",
        gold: "#C9A84C",
        blush: "#F5E6E0",
        olive: "#556B2F",
      };
      result = result.filter((p) =>
        filters.colors.some((c) => p.colors.includes(colorMap[c]))
      );
    }

    // Sorting
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
        // newest - keep original order
        break;
    }

    return result;
  }, [filters]);

  const visibleProducts = filteredProducts.slice(0, visibleCount);
  const hasMore = visibleCount < filteredProducts.length;

  const handleLoadMore = () => {
    setIsLoading(true);
    // Simulate loading delay
    setTimeout(() => {
      setVisibleCount((prev) => prev + 6);
      setIsLoading(false);
    }, 500);
  };

  return (
    <div className="flex-1">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-gold/10">
        {/* Left side */}
        <div className="flex items-center gap-4">
          {/* Mobile filter toggle */}
          <button
            onClick={onOpenFilters}
            className="lg:hidden flex items-center gap-2 px-4 py-2 border border-gold/20 rounded-lg hover:border-gold transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="text-sm font-medium">Filters</span>
          </button>

          {/* Product count */}
          <p className="text-sm text-black/60">
            Showing{" "}
            <span className="font-semibold text-black">
              {visibleProducts.length}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-black">
              {filteredProducts.length}
            </span>{" "}
            products
          </p>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          {/* Sort dropdown */}
          <div className="relative">
            <select
              value={filters.sort}
              onChange={(e) => setSort(e.target.value)}
              className="appearance-none bg-transparent border border-gold/20 rounded-lg px-4 py-2 pr-10 text-sm focus:outline-none focus:border-gold cursor-pointer"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-black/50" />
          </div>

          {/* View mode toggle */}
          <div className="hidden sm:flex items-center border border-gold/20 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-2 transition-colors",
                viewMode === "grid" ? "bg-gold text-white" : "hover:bg-gold/10"
              )}
              aria-label="Grid view"
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-2 transition-colors",
                viewMode === "list" ? "bg-gold text-white" : "hover:bg-gold/10"
              )}
              aria-label="List view"
            >
              <LayoutList className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Product Grid */}
      {filteredProducts.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-lg text-black/60 mb-4">
            No products match your filters
          </p>
          <button
            onClick={() => window.location.href = "/shop"}
            className="text-gold hover:underline"
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
                  compareAtPrice={product.compareAtPrice ?? undefined}
                  thumbnail={product.thumbnail}
                  badge={product.badge}
                  colors={product.colors}
                />
              </motion.div>
            ))}
          </div>

          {/* Loading skeletons */}
          {isLoading && (
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

          {/* Load More Button */}
          {hasMore && !isLoading && (
            <div className="text-center mt-12">
              <button
                onClick={handleLoadMore}
                className="inline-flex items-center gap-2 px-8 py-3 bg-gold text-white font-semibold rounded-full hover:bg-gold-dark transition-colors"
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
