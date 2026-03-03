"use client";

import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, SlidersHorizontal, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useShopFilters } from "@/hooks/useShopFilters";

// Category structure with parent relationships
const categoryConfig = {
  women: {
    label: "Women's Collection",
    subcategories: [
      { id: "all-women", label: "All Women's", value: "women" },
      { id: "dresses", label: "Dresses", value: "dresses" },
      { id: "tops", label: "Tops & Blouses", value: "tops" },
      { id: "bottoms", label: "Pants & Skirts", value: "bottoms" },
      { id: "outerwear", label: "Outerwear", value: "outerwear" },
      { id: "accessories", label: "Accessories", value: "accessories" },
    ],
  },
  men: {
    label: "Men's Collection",
    subcategories: [
      { id: "all-men", label: "All Men's", value: "men" },
      { id: "suits", label: "Suits & Blazers", value: "suits" },
      { id: "shirts", label: "Shirts", value: "shirts" },
      { id: "trousers", label: "Trousers", value: "trousers" },
      { id: "knitwear", label: "Knitwear", value: "knitwear" },
      { id: "outerwear-men", label: "Jackets & Coats", value: "outerwear" },
    ],
  },
  children: {
    label: "Children's Collection",
    subcategories: [
      { id: "all-children", label: "All Children's", value: "children" },
      { id: "boys", label: "Boys", value: "boys" },
      { id: "girls", label: "Girls", value: "girls" },
      { id: "baby", label: "Baby", value: "baby" },
      { id: "accessories-kids", label: "Accessories", value: "accessories" },
    ],
  },
  default: {
    label: "All Products",
    subcategories: [
      { id: "all", label: "All Products", value: null },
      { id: "women", label: "Women", value: "women" },
      { id: "men", label: "Men", value: "men" },
      { id: "children", label: "Children", value: "children" },
      { id: "accessories", label: "Accessories", value: "accessories" },
    ],
  },
};

const sizes = ["XS", "S", "M", "L", "XL", "XXL"];

const colors = [
  { id: "black", hex: "#000000", label: "Black" },
  { id: "white", hex: "#FFFFFF", label: "White" },
  { id: "cream", hex: "#F5F5DC", label: "Cream" },
  { id: "navy", hex: "#001F3F", label: "Navy" },
  { id: "burgundy", hex: "#800020", label: "Burgundy" },
  { id: "gold", hex: "#C9A84C", label: "Gold" },
  { id: "blush", hex: "#F5E6E0", label: "Blush" },
  { id: "olive", hex: "#556B2F", label: "Olive" },
];

const priceRanges = [
  { id: "0-50", label: "Under $50", min: 0, max: 50 },
  { id: "50-100", label: "$50 - $100", min: 50, max: 100 },
  { id: "100-200", label: "$100 - $200", min: 100, max: 200 },
  { id: "200-500", label: "$200 - $500", min: 200, max: 500 },
  { id: "500+", label: "$500+", min: 500, max: null },
];

interface FiltersPanelProps {
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export function FiltersPanel({ isMobileOpen, onCloseMobile }: FiltersPanelProps) {
  const searchParams = useSearchParams();
  const currentUrlCategory = searchParams.get("category");
  const parentParam = searchParams.get("parent");
  
  // Determine which category config to use based on URL
  const categories = useMemo(() => {
    let parent: keyof typeof categoryConfig = "default";
    
    // First, check if parent param is provided (for subcategories like outerwear, accessories)
    if (parentParam) {
      if (parentParam === "women") parent = "women";
      else if (parentParam === "men") parent = "men";
      else if (parentParam === "children") parent = "children";
    }
    // Otherwise, check if current URL category is a parent category or belongs to one
    else if (currentUrlCategory === "women" || ["dresses", "tops", "bottoms", "outerwear", "accessories"].includes(currentUrlCategory || "")) {
      parent = "women";
    } else if (currentUrlCategory === "men" || ["suits", "shirts", "trousers", "knitwear", "outerwear", "accessories"].includes(currentUrlCategory || "")) {
      // Note: outerwear/accessories without parent param defaults to first match (women), but with parent=men it will show men's
      parent = "men";
    } else if (currentUrlCategory === "children" || ["boys", "girls", "baby"].includes(currentUrlCategory || "")) {
      parent = "children";
    }
    
    return categoryConfig[parent].subcategories;
  }, [currentUrlCategory, parentParam]);

  const {
    filters,
    toggleSize,
    toggleColor,
    setCategory,
    setPriceRange,
    clearFilters,
    hasActiveFilters,
  } = useShopFilters();

  const [expandedSections, setExpandedSections] = useState<string[]>([
    "category",
    "size",
    "price",
    "color",
  ]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) =>
      prev.includes(section)
        ? prev.filter((s) => s !== section)
        : [...prev, section]
    );
  };

  const isExpanded = (section: string) => expandedSections.includes(section);

  const selectedPriceRange = priceRanges.find(
    (r) =>
      r.min === filters.minPrice &&
      (r.max === filters.maxPrice || (r.max === null && filters.maxPrice === null))
  );

  const FilterContent = () => (
    <div className="space-y-6">
      {/* Clear Filters */}
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="w-full py-2 text-sm text-red-600 hover:text-red-700 font-medium transition-colors"
        >
          Clear All Filters
        </button>
      )}

      {/* Category Filter */}
      <div className="border-b border-gold/10 pb-6">
        <button
          onClick={() => toggleSection("category")}
          className="w-full flex items-center justify-between py-2 text-left"
        >
          <span className="font-display text-lg">Category</span>
          <ChevronDown
            className={cn(
              "w-5 h-5 transition-transform",
              isExpanded("category") && "rotate-180"
            )}
          />
        </button>
        <AnimatePresence>
          {isExpanded("category") && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-3 space-y-2">
                {categories.map((cat) => {
                  // All subcategories now have explicit value property
                  const categoryValue = cat.value;
                  const isSelected = categoryValue === null 
                    ? filters.category === null 
                    : filters.category === categoryValue;
                  
                  return (
                    <label
                      key={cat.id}
                      className="flex items-center gap-3 cursor-pointer group"
                    >
                      <input
                        type="radio"
                        checked={isSelected}
                        onChange={() => setCategory(categoryValue)}
                        className="w-4 h-4 border-2 border-theme-primary/50 text-theme-primary focus:ring-theme-primary theme-transition"
                      />
                      <span className="text-sm hover:text-theme-primary theme-transition">
                        {cat.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Size Filter */}
      <div className="border-b border-theme-primary/20 pb-6 theme-transition">
        <button
          onClick={() => toggleSection("size")}
          className="w-full flex items-center justify-between py-2 text-left"
        >
          <span className="font-display text-lg">Size</span>
          <ChevronDown
            className={cn(
              "w-5 h-5 transition-transform",
              isExpanded("size") && "rotate-180"
            )}
          />
        </button>
        <AnimatePresence>
          {isExpanded("size") && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-3 flex flex-wrap gap-2">
                {sizes.map((size) => (
                  <button
                    key={size}
                    onClick={() => toggleSize(size)}
                    className={cn(
                      "w-10 h-10 rounded-md border-2 text-sm font-medium transition-all theme-transition",
                      filters.sizes.includes(size)
                        ? "bg-theme-primary border-theme-primary text-white"
                        : "border-theme-primary/20 hover:border-theme-primary/50"
                    )}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Price Range Filter */}
      <div className="border-b border-gold/10 pb-6">
        <button
          onClick={() => toggleSection("price")}
          className="w-full flex items-center justify-between py-2 text-left"
        >
          <span className="font-display text-lg">Price Range</span>
          <ChevronDown
            className={cn(
              "w-5 h-5 transition-transform",
              isExpanded("price") && "rotate-180"
            )}
          />
        </button>
        <AnimatePresence>
          {isExpanded("price") && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-3 space-y-2">
                {priceRanges.map((range) => (
                  <label
                    key={range.id}
                    className="flex items-center gap-3 cursor-pointer group"
                  >
                    <input
                      type="radio"
                      name="price"
                      checked={selectedPriceRange?.id === range.id}
                      onChange={() => setPriceRange(range.min, range.max)}
                      className="w-4 h-4 border-2 border-theme-primary/50 text-theme-primary focus:ring-theme-primary theme-transition"
                    />
                    <span className="text-sm hover:text-theme-primary theme-transition">
                      {range.label}
                    </span>
                  </label>
                ))}
                <button
                  onClick={() => setPriceRange(null, null)}
                  className="text-xs text-black/50 hover:text-theme-primary mt-2 theme-transition"
                >
                  Clear price filter
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Color Filter */}
      <div className="pb-6">
        <button
          onClick={() => toggleSection("color")}
          className="w-full flex items-center justify-between py-2 text-left"
        >
          <span className="font-display text-lg">Color</span>
          <ChevronDown
            className={cn(
              "w-5 h-5 transition-transform",
              isExpanded("color") && "rotate-180"
            )}
          />
        </button>
        <AnimatePresence>
          {isExpanded("color") && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-3 flex flex-wrap gap-3">
                {colors.map((color) => (
                  <button
                    key={color.id}
                    onClick={() => toggleColor(color.id)}
                    title={color.label}
                    className={cn(
                      "w-8 h-8 rounded-full border-2 transition-all relative",
                      filters.colors.includes(color.id)
                        ? "border-gold scale-110 ring-2 ring-gold ring-offset-2"
                        : "border-black/10 hover:scale-110"
                    )}
                    style={{ backgroundColor: color.hex }}
                  >
                    {color.id === "white" && (
                      <span className="absolute inset-0 rounded-full border border-black/10" />
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 flex-shrink-0">
        <div className="sticky top-24">
          <h2 className="font-display text-xl mb-6 flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5" />
            Filters
          </h2>
          <FilterContent />
        </div>
      </aside>

      {/* Mobile Drawer Backdrop */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCloseMobile}
            className="fixed inset-0 bg-black/50 z-50 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Mobile Drawer */}
      <motion.aside
        initial={{ x: "-100%" }}
        animate={{ x: isMobileOpen ? 0 : "-100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="fixed top-0 left-0 bottom-0 w-80 max-w-[85vw] bg-cream z-50 lg:hidden overflow-y-auto shadow-2xl"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-xl flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5" />
              Filters
            </h2>
            <button
              onClick={onCloseMobile}
              className="p-2 hover:text-theme-primary theme-transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <FilterContent />
        </div>
      </motion.aside>
    </>
  );
}
