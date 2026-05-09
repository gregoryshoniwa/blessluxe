"use client";

import { useMemo } from "react";
import { useHeadings, type Heading, type Catalogue } from "./useProducts";

interface NavMenuItem {
  href: string;
  label: string;
  icon?: string;
}

interface NavMenuSection {
  title: string;
  items: NavMenuItem[];
}

interface NavLink {
  label: string;
  href: string;
  categoryHandle?: string;
  isSale?: boolean;
  submenu?: {
    featured: NavMenuSection;
    categories: NavMenuSection;
    occasions: NavMenuSection;
    accessories: NavMenuSection;
  };
}

const ACCESSORY_PATTERN = /(accessor|shoe|bag|watch|belt|jewel|scarf)/i;

function shopHref(handle: string, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ category: handle, ...extra });
  return `/shop?${params.toString()}`;
}

function buildSubmenuFromCatalogues(
  heading: Heading,
  catalogues: Catalogue[]
): NavLink["submenu"] {
  const accessoryCatalogues = catalogues.filter(
    (c) => ACCESSORY_PATTERN.test(c.name) || ACCESSORY_PATTERN.test(c.handle)
  );
  const nonAccessoryCatalogues = catalogues.filter(
    (c) => !ACCESSORY_PATTERN.test(c.name) && !ACCESSORY_PATTERN.test(c.handle)
  );
  const categoryItems = nonAccessoryCatalogues.slice(0, 6);
  const occasionItems = nonAccessoryCatalogues.slice(6, 11);

  const headingHref = shopHref(heading.handle);

  return {
    featured: {
      title: "Featured",
      items: [
        {
          href: shopHref(heading.handle, { sort: "newest" }),
          label: "New Arrivals",
          icon: "✨",
        },
        {
          href: shopHref(heading.handle, { sort: "bestsellers" }),
          label: "Bestsellers",
        },
        {
          href: headingHref,
          label: `All ${heading.name}`,
        },
      ],
    },
    categories: {
      title: "Categories",
      items:
        categoryItems.length > 0
          ? categoryItems.map((c) => ({
              href: shopHref(c.handle),
              label: c.name,
            }))
          : [{ href: headingHref, label: "All Products" }],
    },
    occasions: {
      title: "Shop by Type",
      items:
        occasionItems.length > 0
          ? occasionItems.map((c) => ({
              href: shopHref(c.handle),
              label: c.name,
            }))
          : [{ href: headingHref, label: "Explore All" }],
    },
    accessories: {
      title: "Accessories",
      items:
        accessoryCatalogues.length > 0
          ? accessoryCatalogues.slice(0, 6).map((c) => ({
              href: shopHref(c.handle),
              label: c.name,
            }))
          : [{ href: headingHref, label: "More" }],
    },
  };
}

export function useNavigation() {
  const { data: headings, isLoading } = useHeadings();

  const navLinks = useMemo<NavLink[]>(() => {
    const list = (headings ?? []).filter((h) => h.is_active);

    if (list.length === 0) {
      return [
        { label: "Shop", href: "/shop" },
        { label: "Sale", href: "/shop?sale=true", isSale: true },
      ];
    }

    return list
      .slice()
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
      .map<NavLink>((heading) => {
        const catalogues = (heading.catalogues || [])
          .filter((c) => c.is_active)
          .slice()
          .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

        if (heading.is_sale) {
          return {
            label: heading.name,
            href: shopHref(heading.handle, { sale: "true" }),
            isSale: true,
            categoryHandle: heading.handle,
          };
        }

        return {
          label: heading.name,
          href: shopHref(heading.handle),
          categoryHandle: heading.handle,
          submenu: buildSubmenuFromCatalogues(heading, catalogues),
        };
      });
  }, [headings]);

  return { navLinks, isLoading };
}
