import { ExecArgs, IProductModuleService } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

type CategoryLike = {
  id: string;
  name: string;
  handle: string;
  parent_category_id?: string | null;
};

export default async function setupCategoryHierarchy({ container }: ExecArgs) {
  const productService: IProductModuleService = container.resolve(Modules.PRODUCT);
  const service = productService as unknown as {
    listProductCategories: (...args: unknown[]) => Promise<CategoryLike[]>;
    createProductCategories: (data: Array<Record<string, unknown>>) => Promise<CategoryLike[]>;
    updateProductCategories?: (id: string, data: Record<string, unknown>) => Promise<unknown>;
    updateProductCategory?: (id: string, data: Record<string, unknown>) => Promise<unknown>;
  };

  const updateCategoryParent = async (id: string, parentCategoryId: string | null) => {
    const payload = { parent_category_id: parentCategoryId };
    if (typeof service.updateProductCategories === "function") {
      await service.updateProductCategories(id, payload);
      return;
    }
    if (typeof service.updateProductCategory === "function") {
      await service.updateProductCategory(id, payload);
      return;
    }
    throw new Error(
      "Could not find product category update method on ProductModuleService."
    );
  };

  const categories = await service.listProductCategories(
    {},
    { take: 500 } as unknown as Record<string, unknown>
  );
  const map = new Map(categories.map((category) => [category.handle, category]));

  const ensureCategory = async (handle: string, name: string): Promise<CategoryLike> => {
    const existing = map.get(handle);
    if (existing) {
      return existing;
    }

    let created: CategoryLike[] = [];
    try {
      created = await service.createProductCategories([
        {
          name,
          handle,
        },
      ]);
    } catch {
      const fallback = await service.listProductCategories(
        { handle } as unknown as Record<string, unknown>,
        { take: 1 } as unknown as Record<string, unknown>
      );
      if (fallback[0]) {
        map.set(handle, fallback[0]);
        return fallback[0];
      }
      throw new Error(`Failed to create category: ${handle}`);
    }

    const category = created[0];
    if (!category) {
      throw new Error(`Failed to create category: ${handle}`);
    }

    map.set(category.handle, category);
    return category;
  };

  const setParent = async (childHandle: string, parentHandle: string) => {
    const child = map.get(childHandle);
    const parent = map.get(parentHandle);
    if (!child || !parent) {
      return;
    }
    if (child.parent_category_id !== parent.id) {
      await updateCategoryParent(child.id, parent.id);
      map.set(childHandle, { ...child, parent_category_id: parent.id });
    }
  };

  await ensureCategory("women", "Women");
  await ensureCategory("men", "Men");
  await ensureCategory("children", "Children");
  await ensureCategory("sale", "Sale");

  for (const handle of [
    "dresses",
    "tops",
    "bottoms",
    "outerwear",
    "women-accessories",
    "women-shoes",
    "women-bags",
    "women-jewelry",
    "accessories",
    "shoes",
    "bags",
    "jewelry",
  ]) {
    await ensureCategory(handle, handle.replace(/-/g, " "));
  }

  for (const [handle, name] of [
    ["suits", "Suits & Blazers"],
    ["shirts", "Shirts"],
    ["trousers", "Trousers"],
    ["knitwear", "Knitwear"],
    ["men-accessories", "Men Accessories"],
    ["men-shoes", "Men Shoes"],
    ["men-bags", "Men Bags"],
  ] as const) {
    await ensureCategory(handle, name);
  }

  for (const [handle, name] of [
    ["girls", "Girls"],
    ["boys", "Boys"],
    ["baby", "Baby"],
    ["children-accessories", "Children Accessories"],
    ["children-shoes", "Children Shoes"],
  ] as const) {
    await ensureCategory(handle, name);
  }

  for (const handle of [
    "dresses",
    "tops",
    "bottoms",
    "outerwear",
    "women-accessories",
    "women-shoes",
    "women-bags",
    "women-jewelry",
    // Keep legacy generic handles under women for backward compatibility.
    "accessories",
    "shoes",
    "bags",
    "jewelry",
  ]) {
    await setParent(handle, "women");
  }

  for (const handle of [
    "suits",
    "shirts",
    "trousers",
    "knitwear",
    "men-accessories",
    "men-shoes",
    "men-bags",
  ]) {
    await setParent(handle, "men");
  }

  for (const handle of [
    "girls",
    "boys",
    "baby",
    "children-accessories",
    "children-shoes",
  ]) {
    await setParent(handle, "children");
  }

  const finalCategories = await service.listProductCategories(
    {},
    { take: 500 } as unknown as Record<string, unknown>
  );
  console.log(
    `Category hierarchy ready. Total categories: ${finalCategories.length}.`
  );
}

