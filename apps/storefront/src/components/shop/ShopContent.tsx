"use client";

import { useState } from "react";
import { FiltersPanel } from "./FiltersPanel";
import { ProductGrid } from "./ProductGrid";

export function ShopContent() {
  const [isMobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  return (
    <div className="max-w-[1400px] mx-auto px-[5%] py-8">
      <div className="flex gap-8">
        {/* Filters Sidebar */}
        <FiltersPanel
          isMobileOpen={isMobileFiltersOpen}
          onCloseMobile={() => setMobileFiltersOpen(false)}
        />

        {/* Product Grid */}
        <ProductGrid onOpenFilters={() => setMobileFiltersOpen(true)} />
      </div>
    </div>
  );
}
