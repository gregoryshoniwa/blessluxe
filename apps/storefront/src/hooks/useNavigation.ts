"use client";

import { useMemo } from "react";
import { useCategories } from "./useProducts";

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

function toTitleCase(input: string) {
  return input
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const ACCESSORY_PATTERN = /(accessor|shoe|bag|watch|belt|jewel|scarf)/i;
const MEN_PATTERN = /(men|suit|shirt|trouser|knitwear|blazer)/i;
const CHILDREN_PATTERN = /(child|kid|boy|girl|baby|teen)/i;
const AUDIENCE_PREFIX_PATTERN = /^(women|men|children)[-\s_]+/i;

function normalizeLabelForAudience(input: string, audience?: string) {
  const withoutAudiencePrefix = audience
    ? input.replace(new RegExp(`^${audience}[-\\s_]+`, "i"), "")
    : input.replace(AUDIENCE_PREFIX_PATTERN, "");

  return toTitleCase(withoutAudiencePrefix);
}

function dedupeByAudiencePreference<T extends { handle: string; name: string }>(
  categories: T[],
  audience?: string
) {
  const grouped = new Map<string, T[]>();

  for (const category of categories) {
    const canonicalHandle = category.handle.replace(AUDIENCE_PREFIX_PATTERN, "");
    const bucket = grouped.get(canonicalHandle) ?? [];
    bucket.push(category);
    grouped.set(canonicalHandle, bucket);
  }

  const pickPreferred = (items: T[]) => {
    if (!audience) return items[0];
    const preferred = items.find((item) =>
      item.handle.toLowerCase().startsWith(`${audience}-`)
    );
    return preferred ?? items[0];
  };

  return Array.from(grouped.values())
    .map(pickPreferred)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function useNavigation() {
  const { data: categories, isLoading } = useCategories();

  const navLinks = useMemo<NavLink[]>(() => {
    const allCategories = categories ?? [];
    const topLevel = allCategories
      .filter((category) => !category.parent_category_id)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (topLevel.length === 0) {
      return [
        { label: "Shop", href: "/shop" },
        { label: "Sale", href: "/shop?sale=true", isSale: true },
      ];
    }

    const hasAudienceRoots = topLevel.some((category) =>
      ["women", "men", "children"].includes(category.handle)
    );

    const buildLink = (
      label: string,
      baseHandle: string,
      sourceCategories: typeof allCategories
    ): NavLink => {
      const audience = ["women", "men", "children"].includes(baseHandle)
        ? baseHandle
        : undefined;
      const children = dedupeByAudiencePreference(sourceCategories, audience);

      const accessoryChildren = children.filter(
        (category) =>
          ACCESSORY_PATTERN.test(category.name) ||
          ACCESSORY_PATTERN.test(category.handle)
      );
      const nonAccessoryChildren = children.filter(
        (category) =>
          !ACCESSORY_PATTERN.test(category.name) &&
          !ACCESSORY_PATTERN.test(category.handle)
      );
      const occasionChildren = nonAccessoryChildren.slice(6, 11);
      const categoryChildren = nonAccessoryChildren.slice(0, 6);

      const makeItem = (handle: string, itemLabel: string): NavMenuItem => ({
        href: handle === "shop" ? "/shop" : `/shop?category=${handle}`,
        label: normalizeLabelForAudience(itemLabel, audience),
      });

      return {
        label,
        href: baseHandle ? `/shop?category=${baseHandle}` : "/shop",
        categoryHandle: baseHandle || undefined,
        submenu: {
          featured: {
            title: "Featured",
            items: [
              {
                href: baseHandle
                  ? `/shop?category=${baseHandle}&sort=newest`
                  : "/shop?sort=newest",
                label: "New Arrivals",
                icon: "✨",
              },
              makeItem(baseHandle || "shop", "Bestsellers"),
              makeItem(
                baseHandle || "shop",
                `All ${toTitleCase(label || baseHandle || "Products")}`
              ),
            ],
          },
          categories: {
            title: "Categories",
            items:
              categoryChildren.length > 0
                ? categoryChildren.map((child) =>
                    makeItem(child.handle, child.name)
                  )
                : [makeItem(baseHandle || "shop", "All Products")],
          },
          occasions: {
            title: "Shop by Type",
            items:
              occasionChildren.length > 0
                ? occasionChildren.map((child) =>
                    makeItem(child.handle, child.name)
                  )
                : [makeItem(baseHandle || "shop", "Explore All")],
          },
          accessories: {
            title: "Accessories",
            items:
              accessoryChildren.length > 0
                ? accessoryChildren
                    .slice(0, 6)
                    .map((child) => makeItem(child.handle, child.name))
                : [makeItem(baseHandle || "shop", "More")],
          },
        },
      };
    };

    if (!hasAudienceRoots) {
      const womenCategories = allCategories.filter(
        (category) =>
          !MEN_PATTERN.test(`${category.name} ${category.handle}`) &&
          !CHILDREN_PATTERN.test(`${category.name} ${category.handle}`)
      );
      const menCategories = allCategories.filter((category) =>
        MEN_PATTERN.test(`${category.name} ${category.handle}`)
      );
      const childrenCategories = allCategories.filter((category) =>
        CHILDREN_PATTERN.test(`${category.name} ${category.handle}`)
      );

      return [
        buildLink(
          "Women",
          womenCategories[0]?.handle ?? topLevel[0]?.handle ?? "",
          womenCategories.length > 0 ? womenCategories : topLevel
        ),
        buildLink(
          "Men",
          menCategories[0]?.handle ?? "",
          menCategories.length > 0 ? menCategories : []
        ),
        buildLink(
          "Children",
          childrenCategories[0]?.handle ?? "",
          childrenCategories.length > 0 ? childrenCategories : []
        ),
        { label: "Sale", href: "/shop?sale=true", isSale: true },
      ];
    }

    const orderedTopLevel = [
      ...["women", "men", "children", "sale"]
        .map((handle) => topLevel.find((category) => category.handle === handle))
        .filter((category): category is NonNullable<typeof category> => !!category),
      ...topLevel.filter(
        (category) => !["women", "men", "children", "sale"].includes(category.handle)
      ),
    ];

    const dynamicLinks: NavLink[] = orderedTopLevel.map((top) => {
      const children = allCategories.filter(
        (category) => category.parent_category_id === top.id
      );

      return buildLink(
        toTitleCase(top.name || top.handle),
        top.handle,
        children.length > 0 ? children : [top]
      );
    });

    const hasSale = dynamicLinks.some((link) => link.categoryHandle === "sale");
    if (!hasSale) {
      dynamicLinks.push({
        label: "Sale",
        href: "/shop?sale=true",
        isSale: true,
      });
    }

    return dynamicLinks;
  }, [categories]);

  return { navLinks, isLoading };
}

