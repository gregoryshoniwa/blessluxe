"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export interface ShopFilters {
  category: string | null;
  sizes: string[];
  minPrice: number | null;
  maxPrice: number | null;
  colors: string[];
  sort: string;
}

const DEFAULT_FILTERS: ShopFilters = {
  category: null,
  sizes: [],
  minPrice: null,
  maxPrice: null,
  colors: [],
  sort: "newest",
};

export function useShopFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Parse filters from URL
  const filters: ShopFilters = useMemo(() => {
    const category = searchParams.get("category");
    const sizes = searchParams.get("size")?.split(",").filter(Boolean) ?? [];
    const minPrice = searchParams.get("minPrice")
      ? Number(searchParams.get("minPrice"))
      : null;
    const maxPrice = searchParams.get("maxPrice")
      ? Number(searchParams.get("maxPrice"))
      : null;
    const colors = searchParams.get("color")?.split(",").filter(Boolean) ?? [];
    const sort = searchParams.get("sort") ?? "newest";

    return { category, sizes, minPrice, maxPrice, colors, sort };
  }, [searchParams]);

  // Update URL with new filters
  const updateFilters = useCallback(
    (newFilters: Partial<ShopFilters>) => {
      const params = new URLSearchParams(searchParams.toString());

      const merged = { ...filters, ...newFilters };

      // Category
      if (merged.category) {
        params.set("category", merged.category);
      } else {
        params.delete("category");
      }

      // Sizes
      if (merged.sizes.length > 0) {
        params.set("size", merged.sizes.join(","));
      } else {
        params.delete("size");
      }

      // Price range
      if (merged.minPrice !== null) {
        params.set("minPrice", String(merged.minPrice));
      } else {
        params.delete("minPrice");
      }
      if (merged.maxPrice !== null) {
        params.set("maxPrice", String(merged.maxPrice));
      } else {
        params.delete("maxPrice");
      }

      // Colors
      if (merged.colors.length > 0) {
        params.set("color", merged.colors.join(","));
      } else {
        params.delete("color");
      }

      // Sort
      if (merged.sort && merged.sort !== "newest") {
        params.set("sort", merged.sort);
      } else {
        params.delete("sort");
      }

      const newUrl = params.toString()
        ? `${pathname}?${params.toString()}`
        : pathname;
      router.push(newUrl, { scroll: false });
    },
    [filters, pathname, router, searchParams]
  );

  // Toggle helpers
  const toggleSize = useCallback(
    (size: string) => {
      const newSizes = filters.sizes.includes(size)
        ? filters.sizes.filter((s) => s !== size)
        : [...filters.sizes, size];
      updateFilters({ sizes: newSizes });
    },
    [filters.sizes, updateFilters]
  );

  const toggleColor = useCallback(
    (color: string) => {
      const newColors = filters.colors.includes(color)
        ? filters.colors.filter((c) => c !== color)
        : [...filters.colors, color];
      updateFilters({ colors: newColors });
    },
    [filters.colors, updateFilters]
  );

  const setCategory = useCallback(
    (category: string | null) => {
      updateFilters({ category });
    },
    [updateFilters]
  );

  const setPriceRange = useCallback(
    (min: number | null, max: number | null) => {
      updateFilters({ minPrice: min, maxPrice: max });
    },
    [updateFilters]
  );

  const setSort = useCallback(
    (sort: string) => {
      updateFilters({ sort });
    },
    [updateFilters]
  );

  const clearFilters = useCallback(() => {
    router.push(pathname, { scroll: false });
  }, [pathname, router]);

  const hasActiveFilters = useMemo(() => {
    return (
      filters.category !== null ||
      filters.sizes.length > 0 ||
      filters.minPrice !== null ||
      filters.maxPrice !== null ||
      filters.colors.length > 0
    );
  }, [filters]);

  return {
    filters,
    updateFilters,
    toggleSize,
    toggleColor,
    setCategory,
    setPriceRange,
    setSort,
    clearFilters,
    hasActiveFilters,
  };
}
