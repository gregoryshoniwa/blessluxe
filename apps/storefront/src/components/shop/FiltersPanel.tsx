"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, SlidersHorizontal, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useShopFilters } from "@/hooks/useShopFilters";
import { useCategories } from "@/hooks/useProducts";
const AUDIENCE_PREFIX_PATTERN = /^(women|men|children)[-\s_]+/i;

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
  const { data: backendCategories } = useCategories();
  const {
    filters,
    toggleSize,
    toggleColor,
    setCategory,
    setPriceRange,
    clearFilters,
    hasActiveFilters,
  } = useShopFilters();
  const categories = useMemo(() => {
    if (!backendCategories || backendCategories.length === 0) {
      return [{ id: "all", label: "All Products", value: null }];
    }

    const byId = new Map(backendCategories.map((category) => [category.id, category]));
    const byHandle = new Map(backendCategories.map((category) => [category.handle, category]));
    const childrenByParent = new Map<string, typeof backendCategories>();

    for (const category of backendCategories) {
      if (!category.parent_category_id) continue;
      const siblings = childrenByParent.get(category.parent_category_id) ?? [];
      siblings.push(category);
      childrenByParent.set(category.parent_category_id, siblings);
    }

    const getRootCategory = (categoryId: string) => {
      let current = byId.get(categoryId);
      let safety = 0;

      while (current?.parent_category_id && safety < 10) {
        const parent = byId.get(current.parent_category_id);
        if (!parent) break;
        current = parent;
        safety += 1;
      }

      return current;
    };

    const selectedCategory = filters.category ? byHandle.get(filters.category) : undefined;
    const selectedRoot = selectedCategory ? getRootCategory(selectedCategory.id) : undefined;

    const rootCategories = selectedRoot
      ? [selectedRoot]
      : backendCategories
          .filter((category) => !category.parent_category_id)
          .sort((a, b) => a.name.localeCompare(b.name));

    const collectDescendants = (rootId: string) => {
      const queue = [...(childrenByParent.get(rootId) ?? [])];
      const descendants: typeof backendCategories = [];

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) continue;
        descendants.push(current);
        const children = childrenByParent.get(current.id);
        if (children?.length) queue.push(...children);
      }

      return descendants.sort((a, b) => a.name.localeCompare(b.name));
    };

    const scopedEntries = rootCategories.flatMap((root) => {
      const descendants = collectDescendants(root.id);
      const preferredByCanonicalHandle = new Map<string, (typeof descendants)[number]>();
      const audienceHandle = root.handle.toLowerCase();
      const isAudienceRoot = ["women", "men", "children"].includes(audienceHandle);

      for (const category of descendants) {
        const canonicalHandle = category.handle.replace(AUDIENCE_PREFIX_PATTERN, "");
        const existing = preferredByCanonicalHandle.get(canonicalHandle);
        if (!existing) {
          preferredByCanonicalHandle.set(canonicalHandle, category);
          continue;
        }

        if (
          isAudienceRoot &&
          category.handle.toLowerCase().startsWith(`${audienceHandle}-`) &&
          !existing.handle.toLowerCase().startsWith(`${audienceHandle}-`)
        ) {
          preferredByCanonicalHandle.set(canonicalHandle, category);
        }
      }
      const dedupedDescendants = Array.from(preferredByCanonicalHandle.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      const normalizeLabel = (input: string) =>
        input
          .replace(new RegExp(`^${audienceHandle}[-\\s_]+`, "i"), "")
          .replace(AUDIENCE_PREFIX_PATTERN, "")
          .replace(/[-_]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .replace(/\b\w/g, (char) => char.toUpperCase());

      if (dedupedDescendants.length === 0) {
        return [{ id: root.id, label: root.name, value: root.handle }];
      }

      return [
        { id: `root-${root.id}`, label: `All ${root.name}`, value: root.handle },
        ...dedupedDescendants.map((category) => ({
          id: category.id,
          label: normalizeLabel(category.name || category.handle),
          value: category.handle,
        })),
      ];
    });

    if (selectedRoot) {
      return scopedEntries;
    }

    return [{ id: "all", label: "All Products", value: null }, ...scopedEntries];
  }, [backendCategories, filters.category]);

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
