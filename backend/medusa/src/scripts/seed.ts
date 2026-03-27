import {
  ExecArgs,
  IProductModuleService,
  IRegionModuleService,
  ISalesChannelModuleService,
  IStoreModuleService,
  IPricingModuleService,
} from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils";

export default async function seed({ container }: ExecArgs) {
  const storeService: IStoreModuleService = container.resolve(Modules.STORE);
  const regionService: IRegionModuleService = container.resolve(Modules.REGION);
  const salesChannelService: ISalesChannelModuleService = container.resolve(
    Modules.SALES_CHANNEL
  );
  const productService: IProductModuleService = container.resolve(
    Modules.PRODUCT
  );
  const pricingService: IPricingModuleService = container.resolve(
    Modules.PRICING
  );
  const remoteLink = container.resolve(ContainerRegistrationKeys.REMOTE_LINK);

  const [store] = await storeService.listStores();
  if (store) {
    await storeService.updateStores(store.id, {
      name: "BLESSLUXE",
      supported_currencies: [
        { currency_code: "usd", is_default: true },
        { currency_code: "gbp" },
        { currency_code: "eur" },
        { currency_code: "zar" },
      ],
    });
  }

  const [existingChannels] = await salesChannelService.listSalesChannels({ name: "BLESSLUXE Online Store" });
  if (!existingChannels) {
    await salesChannelService.createSalesChannels({
      name: "BLESSLUXE Online Store",
      description: "Premium women's fashion e-commerce",
    });
  }

  const existingRegions = await regionService.listRegions();
  if (existingRegions.length === 0) {
    await regionService.createRegions([
      { name: "United States", currency_code: "usd", countries: ["us"] },
      { name: "United Kingdom", currency_code: "gbp", countries: ["gb"] },
      {
        name: "Europe",
        currency_code: "eur",
        countries: ["de", "fr", "it", "es", "nl"],
      },
      { name: "South Africa", currency_code: "zar", countries: ["za"] },
    ]);
  }

  const requiredCategories = [
    { name: "Women", handle: "women" },
    { name: "Men", handle: "men" },
    { name: "Children", handle: "children" },
    { name: "Sale", handle: "sale" },
    { name: "Dresses", handle: "dresses" },
    { name: "Tops", handle: "tops" },
    { name: "Bottoms", handle: "bottoms" },
    { name: "Outerwear", handle: "outerwear" },
    { name: "Accessories", handle: "accessories" },
    { name: "Shoes", handle: "shoes" },
    { name: "Bags", handle: "bags" },
    { name: "Jewelry", handle: "jewelry" },
    { name: "Women Accessories", handle: "women-accessories" },
    { name: "Women Shoes", handle: "women-shoes" },
    { name: "Women Bags", handle: "women-bags" },
    { name: "Women Jewelry", handle: "women-jewelry" },
    { name: "Suits & Blazers", handle: "suits" },
    { name: "Shirts", handle: "shirts" },
    { name: "Trousers", handle: "trousers" },
    { name: "Knitwear", handle: "knitwear" },
    { name: "Men Accessories", handle: "men-accessories" },
    { name: "Men Shoes", handle: "men-shoes" },
    { name: "Men Bags", handle: "men-bags" },
    { name: "Girls", handle: "girls" },
    { name: "Boys", handle: "boys" },
    { name: "Baby", handle: "baby" },
    { name: "Children Accessories", handle: "children-accessories" },
    { name: "Children Shoes", handle: "children-shoes" },
  ];

  const listAllCategories = async () =>
    await productService.listProductCategories(
      {},
      { take: 500 } as Record<string, unknown>
    );

  let categories = await listAllCategories();

  const ensureCategory = async (name: string, handle: string) => {
    if (categories.some((category: { handle: string }) => category.handle === handle)) {
      return;
    }

    try {
      await productService.createProductCategories([{ name, handle }]);
    } catch {
      // Ignore duplicate-handle races and continue.
    }

    categories = await listAllCategories();
  };

  for (const category of requiredCategories) {
    await ensureCategory(category.name, category.handle);
  }

  const cat = (handle: string) => {
    const found = categories.find(
      (c: { handle: string; id: string }) => c.handle === handle
    );
    return found ? [{ id: found.id }] : [];
  };
  const requiredProductTags = ["hot", "sale", "trending", "new", "bestseller"];
  const listAllTags = async () =>
    await (productService as any).listProductTags(
      {},
      { take: 200 } as Record<string, unknown>
    );
  let allTags = await listAllTags();
  const tagIdByValue = new Map<string, string>();
  for (const tag of allTags) {
    const value = String(tag.value || "").toLowerCase().trim();
    if (value) tagIdByValue.set(value, String(tag.id));
  }
  for (const tagValue of requiredProductTags) {
    if (!tagIdByValue.has(tagValue)) {
      await (productService as any).createProductTags([{ value: tagValue }]);
    }
  }
  allTags = await listAllTags();
  for (const tag of allTags) {
    const value = String(tag.value || "").toLowerCase().trim();
    if (value) tagIdByValue.set(value, String(tag.id));
  }
  const makeTags = (...values: string[]) =>
    values
      .map((value) => tagIdByValue.get(value.toLowerCase().trim()))
      .filter(Boolean)
      .map((id) => ({ id }));

  const sizes = ["XS", "S", "M", "L", "XL"];
  const sizesNoXL = ["XS", "S", "M", "L"];

  const existingProducts = await productService.listProducts();
  if (existingProducts.length >= 10) {
    console.log(`⏭️  ${existingProducts.length} products already exist. Skipping product creation.`);
  } else {

  await (productService as any).createProducts([
    // ═══════════════════ DRESSES (6) ═══════════════════
    {
      title: "Silk Evening Gown",
      handle: "silk-evening-gown",
      description:
        "An exquisite floor-length silk gown perfect for galas and black-tie events. Features a delicate draped neckline and a fitted bodice that flows into a graceful A-line skirt.",
      status: "published",
      categories: cat("dresses"),
      options: [
        { title: "Size", values: sizes },
        { title: "Color", values: ["Champagne Gold", "Midnight Black"] },
      ],
      variants: [
        { title: "Champagne Gold / XS", sku: "SILK-GOWN-GOLD-XS", manage_inventory: false, options: { Size: "XS", Color: "Champagne Gold" } },
        { title: "Champagne Gold / S", sku: "SILK-GOWN-GOLD-S", manage_inventory: false, options: { Size: "S", Color: "Champagne Gold" } },
        { title: "Champagne Gold / M", sku: "SILK-GOWN-GOLD-M", manage_inventory: false, options: { Size: "M", Color: "Champagne Gold" } },
        { title: "Champagne Gold / L", sku: "SILK-GOWN-GOLD-L", manage_inventory: false, options: { Size: "L", Color: "Champagne Gold" } },
        { title: "Midnight Black / S", sku: "SILK-GOWN-BLACK-S", manage_inventory: false, options: { Size: "S", Color: "Midnight Black" } },
        { title: "Midnight Black / M", sku: "SILK-GOWN-BLACK-M", manage_inventory: false, options: { Size: "M", Color: "Midnight Black" } },
        { title: "Midnight Black / L", sku: "SILK-GOWN-BLACK-L", manage_inventory: false, options: { Size: "L", Color: "Midnight Black" } },
      ],
    },
    {
      title: "Floral Midi Wrap Dress",
      handle: "floral-midi-wrap-dress",
      description:
        "A romantic midi wrap dress in a delicate floral print. The flattering wrap silhouette cinches at the waist and flows into an asymmetric hem. Perfect for garden parties and daytime events.",
      status: "published",
      categories: cat("dresses"),
      options: [
        { title: "Size", values: sizes },
        { title: "Color", values: ["Rose Garden", "Lavender Fields", "Ocean Blue"] },
      ],
      variants: [
        { title: "Rose Garden / S", sku: "FLORAL-WRAP-ROSE-S", manage_inventory: false, options: { Size: "S", Color: "Rose Garden" } },
        { title: "Rose Garden / M", sku: "FLORAL-WRAP-ROSE-M", manage_inventory: false, options: { Size: "M", Color: "Rose Garden" } },
        { title: "Rose Garden / L", sku: "FLORAL-WRAP-ROSE-L", manage_inventory: false, options: { Size: "L", Color: "Rose Garden" } },
        { title: "Lavender Fields / S", sku: "FLORAL-WRAP-LAV-S", manage_inventory: false, options: { Size: "S", Color: "Lavender Fields" } },
        { title: "Lavender Fields / M", sku: "FLORAL-WRAP-LAV-M", manage_inventory: false, options: { Size: "M", Color: "Lavender Fields" } },
        { title: "Ocean Blue / M", sku: "FLORAL-WRAP-BLUE-M", manage_inventory: false, options: { Size: "M", Color: "Ocean Blue" } },
        { title: "Ocean Blue / L", sku: "FLORAL-WRAP-BLUE-L", manage_inventory: false, options: { Size: "L", Color: "Ocean Blue" } },
      ],
    },
    {
      title: "Velvet Cocktail Dress",
      handle: "velvet-cocktail-dress",
      description:
        "A show-stopping velvet cocktail dress with a sculpted bodice and flared skirt. The rich fabric catches the light beautifully, making it the perfect choice for holiday parties and date nights.",
      status: "published",
      categories: cat("dresses"),
      options: [
        { title: "Size", values: sizes },
        { title: "Color", values: ["Burgundy", "Emerald Green", "Navy"] },
      ],
      variants: [
        { title: "Burgundy / XS", sku: "VELVET-COCK-BURG-XS", manage_inventory: false, options: { Size: "XS", Color: "Burgundy" } },
        { title: "Burgundy / S", sku: "VELVET-COCK-BURG-S", manage_inventory: false, options: { Size: "S", Color: "Burgundy" } },
        { title: "Burgundy / M", sku: "VELVET-COCK-BURG-M", manage_inventory: false, options: { Size: "M", Color: "Burgundy" } },
        { title: "Emerald Green / S", sku: "VELVET-COCK-EMER-S", manage_inventory: false, options: { Size: "S", Color: "Emerald Green" } },
        { title: "Emerald Green / M", sku: "VELVET-COCK-EMER-M", manage_inventory: false, options: { Size: "M", Color: "Emerald Green" } },
        { title: "Navy / M", sku: "VELVET-COCK-NAVY-M", manage_inventory: false, options: { Size: "M", Color: "Navy" } },
        { title: "Navy / L", sku: "VELVET-COCK-NAVY-L", manage_inventory: false, options: { Size: "L", Color: "Navy" } },
      ],
    },
    {
      title: "Linen Maxi Sundress",
      handle: "linen-maxi-sundress",
      description:
        "Effortlessly elegant linen maxi dress with adjustable spaghetti straps and a tiered skirt. Breathable and lightweight — ideal for resort wear and summer getaways.",
      status: "published",
      categories: cat("dresses"),
      options: [
        { title: "Size", values: sizes },
        { title: "Color", values: ["White", "Terracotta", "Sage"] },
      ],
      variants: [
        { title: "White / S", sku: "LINEN-MAXI-WHT-S", manage_inventory: false, options: { Size: "S", Color: "White" } },
        { title: "White / M", sku: "LINEN-MAXI-WHT-M", manage_inventory: false, options: { Size: "M", Color: "White" } },
        { title: "Terracotta / S", sku: "LINEN-MAXI-TER-S", manage_inventory: false, options: { Size: "S", Color: "Terracotta" } },
        { title: "Terracotta / M", sku: "LINEN-MAXI-TER-M", manage_inventory: false, options: { Size: "M", Color: "Terracotta" } },
        { title: "Sage / M", sku: "LINEN-MAXI-SAGE-M", manage_inventory: false, options: { Size: "M", Color: "Sage" } },
        { title: "Sage / L", sku: "LINEN-MAXI-SAGE-L", manage_inventory: false, options: { Size: "L", Color: "Sage" } },
      ],
    },
    {
      title: "Satin Slip Dress",
      handle: "satin-slip-dress",
      description:
        "A minimalist satin slip dress that embodies understated luxury. The cowl neckline and bias-cut silhouette drape beautifully. Style with heels for evening or sneakers for a modern daytime look.",
      status: "published",
      categories: cat("dresses"),
      options: [
        { title: "Size", values: sizesNoXL },
        { title: "Color", values: ["Champagne", "Black", "Dusty Rose"] },
      ],
      variants: [
        { title: "Champagne / S", sku: "SATIN-SLIP-CHAMP-S", manage_inventory: false, options: { Size: "S", Color: "Champagne" } },
        { title: "Champagne / M", sku: "SATIN-SLIP-CHAMP-M", manage_inventory: false, options: { Size: "M", Color: "Champagne" } },
        { title: "Black / XS", sku: "SATIN-SLIP-BLK-XS", manage_inventory: false, options: { Size: "XS", Color: "Black" } },
        { title: "Black / S", sku: "SATIN-SLIP-BLK-S", manage_inventory: false, options: { Size: "S", Color: "Black" } },
        { title: "Black / M", sku: "SATIN-SLIP-BLK-M", manage_inventory: false, options: { Size: "M", Color: "Black" } },
        { title: "Dusty Rose / S", sku: "SATIN-SLIP-ROSE-S", manage_inventory: false, options: { Size: "S", Color: "Dusty Rose" } },
        { title: "Dusty Rose / M", sku: "SATIN-SLIP-ROSE-M", manage_inventory: false, options: { Size: "M", Color: "Dusty Rose" } },
      ],
    },
    {
      title: "Embroidered Tulle Ball Gown",
      handle: "embroidered-tulle-ball-gown",
      description:
        "A breathtaking ball gown featuring hand-embroidered floral motifs on layers of soft tulle. The fitted corset bodice and full skirt create a fairy-tale silhouette for the most special occasions.",
      status: "published",
      categories: cat("dresses"),
      options: [
        { title: "Size", values: sizes },
        { title: "Color", values: ["Ivory", "Blush"] },
      ],
      variants: [
        { title: "Ivory / XS", sku: "TULLE-BALL-IVORY-XS", manage_inventory: false, options: { Size: "XS", Color: "Ivory" } },
        { title: "Ivory / S", sku: "TULLE-BALL-IVORY-S", manage_inventory: false, options: { Size: "S", Color: "Ivory" } },
        { title: "Ivory / M", sku: "TULLE-BALL-IVORY-M", manage_inventory: false, options: { Size: "M", Color: "Ivory" } },
        { title: "Blush / S", sku: "TULLE-BALL-BLUSH-S", manage_inventory: false, options: { Size: "S", Color: "Blush" } },
        { title: "Blush / M", sku: "TULLE-BALL-BLUSH-M", manage_inventory: false, options: { Size: "M", Color: "Blush" } },
      ],
    },

    // ═══════════════════ TOPS (4) ═══════════════════
    {
      title: "Cashmere Wrap Blouse",
      handle: "cashmere-wrap-blouse",
      description:
        "Luxuriously soft cashmere blouse with an elegant wrap design. Pairs beautifully with tailored trousers or a pencil skirt.",
      status: "published",
      categories: cat("tops"),
      options: [
        { title: "Size", values: sizesNoXL },
        { title: "Color", values: ["Cream", "Blush Pink", "Slate Grey"] },
      ],
      variants: [
        { title: "Cream / XS", sku: "CASH-BLOUSE-CREAM-XS", manage_inventory: false, options: { Size: "XS", Color: "Cream" } },
        { title: "Cream / S", sku: "CASH-BLOUSE-CREAM-S", manage_inventory: false, options: { Size: "S", Color: "Cream" } },
        { title: "Cream / M", sku: "CASH-BLOUSE-CREAM-M", manage_inventory: false, options: { Size: "M", Color: "Cream" } },
        { title: "Blush Pink / S", sku: "CASH-BLOUSE-BLUSH-S", manage_inventory: false, options: { Size: "S", Color: "Blush Pink" } },
        { title: "Blush Pink / M", sku: "CASH-BLOUSE-BLUSH-M", manage_inventory: false, options: { Size: "M", Color: "Blush Pink" } },
        { title: "Slate Grey / M", sku: "CASH-BLOUSE-GREY-M", manage_inventory: false, options: { Size: "M", Color: "Slate Grey" } },
        { title: "Slate Grey / L", sku: "CASH-BLOUSE-GREY-L", manage_inventory: false, options: { Size: "L", Color: "Slate Grey" } },
      ],
    },
    {
      title: "Silk Camisole Top",
      handle: "silk-camisole-top",
      description:
        "A refined silk camisole with a V-neckline and delicate lace trim. Layer under blazers or wear alone for an effortlessly chic look.",
      status: "published",
      categories: cat("tops"),
      options: [
        { title: "Size", values: sizesNoXL },
        { title: "Color", values: ["Ivory", "Black", "Blush"] },
      ],
      variants: [
        { title: "Ivory / XS", sku: "SILK-CAMI-IVORY-XS", manage_inventory: false, options: { Size: "XS", Color: "Ivory" } },
        { title: "Ivory / S", sku: "SILK-CAMI-IVORY-S", manage_inventory: false, options: { Size: "S", Color: "Ivory" } },
        { title: "Ivory / M", sku: "SILK-CAMI-IVORY-M", manage_inventory: false, options: { Size: "M", Color: "Ivory" } },
        { title: "Black / S", sku: "SILK-CAMI-BLK-S", manage_inventory: false, options: { Size: "S", Color: "Black" } },
        { title: "Black / M", sku: "SILK-CAMI-BLK-M", manage_inventory: false, options: { Size: "M", Color: "Black" } },
        { title: "Blush / S", sku: "SILK-CAMI-BLUSH-S", manage_inventory: false, options: { Size: "S", Color: "Blush" } },
      ],
    },
    {
      title: "Oversized Merino Knit Sweater",
      handle: "oversized-merino-knit-sweater",
      description:
        "A cozy oversized sweater knitted from extra-fine merino wool. The relaxed fit, ribbed cuffs, and drop shoulders make it a winter wardrobe staple.",
      status: "published",
      categories: cat("tops"),
      options: [
        { title: "Size", values: ["S/M", "M/L", "L/XL"] },
        { title: "Color", values: ["Oatmeal", "Charcoal", "Rust"] },
      ],
      variants: [
        { title: "Oatmeal / S/M", sku: "MERINO-KNIT-OAT-SM", manage_inventory: false, options: { Size: "S/M", Color: "Oatmeal" } },
        { title: "Oatmeal / M/L", sku: "MERINO-KNIT-OAT-ML", manage_inventory: false, options: { Size: "M/L", Color: "Oatmeal" } },
        { title: "Charcoal / S/M", sku: "MERINO-KNIT-CHAR-SM", manage_inventory: false, options: { Size: "S/M", Color: "Charcoal" } },
        { title: "Charcoal / M/L", sku: "MERINO-KNIT-CHAR-ML", manage_inventory: false, options: { Size: "M/L", Color: "Charcoal" } },
        { title: "Rust / M/L", sku: "MERINO-KNIT-RUST-ML", manage_inventory: false, options: { Size: "M/L", Color: "Rust" } },
      ],
    },
    {
      title: "Structured Blazer Top",
      handle: "structured-blazer-top",
      description:
        "A modern hybrid blazer-top with sharp tailoring and a cropped length. Features padded shoulders and a single-button closure for a power look.",
      status: "published",
      categories: cat("tops"),
      options: [
        { title: "Size", values: sizes },
        { title: "Color", values: ["Black", "White", "Camel"] },
      ],
      variants: [
        { title: "Black / XS", sku: "BLAZER-TOP-BLK-XS", manage_inventory: false, options: { Size: "XS", Color: "Black" } },
        { title: "Black / S", sku: "BLAZER-TOP-BLK-S", manage_inventory: false, options: { Size: "S", Color: "Black" } },
        { title: "Black / M", sku: "BLAZER-TOP-BLK-M", manage_inventory: false, options: { Size: "M", Color: "Black" } },
        { title: "White / S", sku: "BLAZER-TOP-WHT-S", manage_inventory: false, options: { Size: "S", Color: "White" } },
        { title: "White / M", sku: "BLAZER-TOP-WHT-M", manage_inventory: false, options: { Size: "M", Color: "White" } },
        { title: "Camel / S", sku: "BLAZER-TOP-CAMEL-S", manage_inventory: false, options: { Size: "S", Color: "Camel" } },
        { title: "Camel / M", sku: "BLAZER-TOP-CAMEL-M", manage_inventory: false, options: { Size: "M", Color: "Camel" } },
      ],
    },

    // ═══════════════════ BOTTOMS (3) ═══════════════════
    {
      title: "High-Waist Tailored Trousers",
      handle: "high-waist-tailored-trousers",
      description:
        "Impeccably tailored high-waist trousers with a straight leg and pressed crease. Crafted from Italian wool blend for a drape that flatters every figure.",
      status: "published",
      categories: cat("bottoms"),
      options: [
        { title: "Size", values: sizes },
        { title: "Color", values: ["Black", "Ivory", "Camel"] },
      ],
      variants: [
        { title: "Black / XS", sku: "TROUSERS-BLK-XS", manage_inventory: false, options: { Size: "XS", Color: "Black" } },
        { title: "Black / S", sku: "TROUSERS-BLK-S", manage_inventory: false, options: { Size: "S", Color: "Black" } },
        { title: "Black / M", sku: "TROUSERS-BLK-M", manage_inventory: false, options: { Size: "M", Color: "Black" } },
        { title: "Black / L", sku: "TROUSERS-BLK-L", manage_inventory: false, options: { Size: "L", Color: "Black" } },
        { title: "Ivory / S", sku: "TROUSERS-IVORY-S", manage_inventory: false, options: { Size: "S", Color: "Ivory" } },
        { title: "Ivory / M", sku: "TROUSERS-IVORY-M", manage_inventory: false, options: { Size: "M", Color: "Ivory" } },
        { title: "Camel / M", sku: "TROUSERS-CAMEL-M", manage_inventory: false, options: { Size: "M", Color: "Camel" } },
        { title: "Camel / L", sku: "TROUSERS-CAMEL-L", manage_inventory: false, options: { Size: "L", Color: "Camel" } },
      ],
    },
    {
      title: "Pleated Satin Midi Skirt",
      handle: "pleated-satin-midi-skirt",
      description:
        "A flowing pleated midi skirt in lustrous satin. The accordion pleats create beautiful movement with every step. An elastic waistband provides comfortable all-day wear.",
      status: "published",
      categories: cat("bottoms"),
      options: [
        { title: "Size", values: sizesNoXL },
        { title: "Color", values: ["Gold", "Emerald", "Midnight Blue"] },
      ],
      variants: [
        { title: "Gold / XS", sku: "PLEATED-SKIRT-GOLD-XS", manage_inventory: false, options: { Size: "XS", Color: "Gold" } },
        { title: "Gold / S", sku: "PLEATED-SKIRT-GOLD-S", manage_inventory: false, options: { Size: "S", Color: "Gold" } },
        { title: "Gold / M", sku: "PLEATED-SKIRT-GOLD-M", manage_inventory: false, options: { Size: "M", Color: "Gold" } },
        { title: "Emerald / S", sku: "PLEATED-SKIRT-EMER-S", manage_inventory: false, options: { Size: "S", Color: "Emerald" } },
        { title: "Emerald / M", sku: "PLEATED-SKIRT-EMER-M", manage_inventory: false, options: { Size: "M", Color: "Emerald" } },
        { title: "Midnight Blue / M", sku: "PLEATED-SKIRT-BLUE-M", manage_inventory: false, options: { Size: "M", Color: "Midnight Blue" } },
      ],
    },
    {
      title: "Wide-Leg Linen Pants",
      handle: "wide-leg-linen-pants",
      description:
        "Relaxed wide-leg pants in premium European linen. The high-rise fit and flowing silhouette offer effortless sophistication for warm-weather dressing.",
      status: "published",
      categories: cat("bottoms"),
      options: [
        { title: "Size", values: sizes },
        { title: "Color", values: ["Natural", "White", "Olive"] },
      ],
      variants: [
        { title: "Natural / S", sku: "WIDELEG-LINEN-NAT-S", manage_inventory: false, options: { Size: "S", Color: "Natural" } },
        { title: "Natural / M", sku: "WIDELEG-LINEN-NAT-M", manage_inventory: false, options: { Size: "M", Color: "Natural" } },
        { title: "White / S", sku: "WIDELEG-LINEN-WHT-S", manage_inventory: false, options: { Size: "S", Color: "White" } },
        { title: "White / M", sku: "WIDELEG-LINEN-WHT-M", manage_inventory: false, options: { Size: "M", Color: "White" } },
        { title: "Olive / M", sku: "WIDELEG-LINEN-OLV-M", manage_inventory: false, options: { Size: "M", Color: "Olive" } },
        { title: "Olive / L", sku: "WIDELEG-LINEN-OLV-L", manage_inventory: false, options: { Size: "L", Color: "Olive" } },
      ],
    },

    // ═══════════════════ OUTERWEAR (3) ═══════════════════
    {
      title: "Double-Breasted Wool Coat",
      handle: "double-breasted-wool-coat",
      description:
        "A timeless double-breasted coat in premium Italian wool. The structured shoulders, notch lapels, and belted waist create a polished silhouette for the colder months.",
      status: "published",
      categories: cat("outerwear"),
      options: [
        { title: "Size", values: sizes },
        { title: "Color", values: ["Camel", "Black", "Charcoal"] },
      ],
      variants: [
        { title: "Camel / XS", sku: "WOOL-COAT-CAMEL-XS", manage_inventory: false, options: { Size: "XS", Color: "Camel" } },
        { title: "Camel / S", sku: "WOOL-COAT-CAMEL-S", manage_inventory: false, options: { Size: "S", Color: "Camel" } },
        { title: "Camel / M", sku: "WOOL-COAT-CAMEL-M", manage_inventory: false, options: { Size: "M", Color: "Camel" } },
        { title: "Black / S", sku: "WOOL-COAT-BLK-S", manage_inventory: false, options: { Size: "S", Color: "Black" } },
        { title: "Black / M", sku: "WOOL-COAT-BLK-M", manage_inventory: false, options: { Size: "M", Color: "Black" } },
        { title: "Charcoal / M", sku: "WOOL-COAT-CHAR-M", manage_inventory: false, options: { Size: "M", Color: "Charcoal" } },
        { title: "Charcoal / L", sku: "WOOL-COAT-CHAR-L", manage_inventory: false, options: { Size: "L", Color: "Charcoal" } },
      ],
    },
    {
      title: "Leather Biker Jacket",
      handle: "leather-biker-jacket",
      description:
        "An edgy yet luxurious biker jacket crafted from buttery-soft lambskin leather. Silver-tone hardware and an asymmetric zip add an unmistakable attitude to any outfit.",
      status: "published",
      categories: cat("outerwear"),
      options: [
        { title: "Size", values: sizesNoXL },
        { title: "Color", values: ["Black", "Cognac"] },
      ],
      variants: [
        { title: "Black / XS", sku: "BIKER-JKT-BLK-XS", manage_inventory: false, options: { Size: "XS", Color: "Black" } },
        { title: "Black / S", sku: "BIKER-JKT-BLK-S", manage_inventory: false, options: { Size: "S", Color: "Black" } },
        { title: "Black / M", sku: "BIKER-JKT-BLK-M", manage_inventory: false, options: { Size: "M", Color: "Black" } },
        { title: "Cognac / S", sku: "BIKER-JKT-COG-S", manage_inventory: false, options: { Size: "S", Color: "Cognac" } },
        { title: "Cognac / M", sku: "BIKER-JKT-COG-M", manage_inventory: false, options: { Size: "M", Color: "Cognac" } },
      ],
    },
    {
      title: "Cashmere Cape",
      handle: "cashmere-cape",
      description:
        "An effortlessly elegant cashmere cape that drapes beautifully over any outfit. The oversized silhouette and fringed edges create a luxurious statement piece.",
      status: "published",
      categories: cat("outerwear"),
      options: [
        { title: "Size", values: ["One Size"] },
        { title: "Color", values: ["Cream", "Grey", "Burgundy"] },
      ],
      variants: [
        { title: "Cream", sku: "CASH-CAPE-CREAM", manage_inventory: false, options: { Size: "One Size", Color: "Cream" } },
        { title: "Grey", sku: "CASH-CAPE-GREY", manage_inventory: false, options: { Size: "One Size", Color: "Grey" } },
        { title: "Burgundy", sku: "CASH-CAPE-BURG", manage_inventory: false, options: { Size: "One Size", Color: "Burgundy" } },
      ],
    },

    // ═══════════════════ SHOES (2) ═══════════════════
    {
      title: "Strappy Stiletto Heels",
      handle: "strappy-stiletto-heels",
      description:
        "Elegant strappy stiletto heels with a 100mm heel. Crafted from Italian calfskin with a cushioned insole for all-night comfort. The ankle strap features a delicate gold buckle.",
      status: "published",
      categories: cat("shoes"),
      options: [
        { title: "Size", values: ["36", "37", "38", "39", "40", "41"] },
        { title: "Color", values: ["Black", "Nude", "Gold"] },
      ],
      variants: [
        { title: "Black / 37", sku: "STILETTO-BLK-37", manage_inventory: false, options: { Size: "37", Color: "Black" } },
        { title: "Black / 38", sku: "STILETTO-BLK-38", manage_inventory: false, options: { Size: "38", Color: "Black" } },
        { title: "Black / 39", sku: "STILETTO-BLK-39", manage_inventory: false, options: { Size: "39", Color: "Black" } },
        { title: "Nude / 37", sku: "STILETTO-NUDE-37", manage_inventory: false, options: { Size: "37", Color: "Nude" } },
        { title: "Nude / 38", sku: "STILETTO-NUDE-38", manage_inventory: false, options: { Size: "38", Color: "Nude" } },
        { title: "Gold / 38", sku: "STILETTO-GOLD-38", manage_inventory: false, options: { Size: "38", Color: "Gold" } },
        { title: "Gold / 39", sku: "STILETTO-GOLD-39", manage_inventory: false, options: { Size: "39", Color: "Gold" } },
      ],
    },
    {
      title: "Pointed-Toe Leather Flats",
      handle: "pointed-toe-leather-flats",
      description:
        "Sleek pointed-toe flats in supple Nappa leather. The cushioned footbed and flexible sole make them perfect for all-day wear without sacrificing style.",
      status: "published",
      categories: cat("shoes"),
      options: [
        { title: "Size", values: ["36", "37", "38", "39", "40"] },
        { title: "Color", values: ["Black", "Tan", "Red"] },
      ],
      variants: [
        { title: "Black / 37", sku: "FLATS-BLK-37", manage_inventory: false, options: { Size: "37", Color: "Black" } },
        { title: "Black / 38", sku: "FLATS-BLK-38", manage_inventory: false, options: { Size: "38", Color: "Black" } },
        { title: "Black / 39", sku: "FLATS-BLK-39", manage_inventory: false, options: { Size: "39", Color: "Black" } },
        { title: "Tan / 37", sku: "FLATS-TAN-37", manage_inventory: false, options: { Size: "37", Color: "Tan" } },
        { title: "Tan / 38", sku: "FLATS-TAN-38", manage_inventory: false, options: { Size: "38", Color: "Tan" } },
        { title: "Red / 38", sku: "FLATS-RED-38", manage_inventory: false, options: { Size: "38", Color: "Red" } },
      ],
    },

    // ═══════════════════ BAGS (2) ═══════════════════
    {
      title: "Quilted Leather Crossbody Bag",
      handle: "quilted-leather-crossbody",
      description:
        "A timeless quilted crossbody bag in lambskin leather with gold-tone chain strap. Features a spacious interior with card slots and a zip pocket. The perfect day-to-night companion.",
      status: "published",
      categories: cat("bags"),
      options: [
        { title: "Color", values: ["Black", "Cream", "Burgundy"] },
      ],
      variants: [
        { title: "Black", sku: "QUILTED-BAG-BLK", manage_inventory: false, options: { Color: "Black" } },
        { title: "Cream", sku: "QUILTED-BAG-CREAM", manage_inventory: false, options: { Color: "Cream" } },
        { title: "Burgundy", sku: "QUILTED-BAG-BURG", manage_inventory: false, options: { Color: "Burgundy" } },
      ],
    },
    {
      title: "Structured Leather Tote",
      handle: "structured-leather-tote",
      description:
        "A spacious structured tote in pebbled Italian leather. The reinforced base and top handles allow it to stand upright, while the detachable shoulder strap offers hands-free versatility.",
      status: "published",
      categories: cat("bags"),
      options: [
        { title: "Color", values: ["Black", "Tan", "Olive"] },
      ],
      variants: [
        { title: "Black", sku: "STRUCT-TOTE-BLK", manage_inventory: false, options: { Color: "Black" } },
        { title: "Tan", sku: "STRUCT-TOTE-TAN", manage_inventory: false, options: { Color: "Tan" } },
        { title: "Olive", sku: "STRUCT-TOTE-OLV", manage_inventory: false, options: { Color: "Olive" } },
      ],
    },

    // ═══════════════════ JEWELRY (3) ═══════════════════
    {
      title: "Gold Chain Statement Necklace",
      handle: "gold-chain-statement-necklace",
      description:
        "A bold layered gold chain necklace that elevates any outfit. Crafted from 18k gold-plated brass with an adjustable clasp.",
      status: "published",
      categories: cat("jewelry"),
      options: [
        { title: "Length", values: ["16 inch", "18 inch", "20 inch"] },
      ],
      variants: [
        { title: "16 inch", sku: "GOLD-NECK-16", manage_inventory: false, options: { Length: "16 inch" } },
        { title: "18 inch", sku: "GOLD-NECK-18", manage_inventory: false, options: { Length: "18 inch" } },
        { title: "20 inch", sku: "GOLD-NECK-20", manage_inventory: false, options: { Length: "20 inch" } },
      ],
    },
    {
      title: "Pearl Drop Earrings",
      handle: "pearl-drop-earrings",
      description:
        "Elegant freshwater pearl drop earrings set in 14k gold vermeil. The teardrop pearls catch the light beautifully, adding a touch of timeless sophistication.",
      status: "published",
      categories: cat("jewelry"),
      options: [
        { title: "Style", values: ["Classic Drop", "Long Chain Drop"] },
      ],
      variants: [
        { title: "Classic Drop", sku: "PEARL-EAR-CLASSIC", manage_inventory: false, options: { Style: "Classic Drop" } },
        { title: "Long Chain Drop", sku: "PEARL-EAR-LONG", manage_inventory: false, options: { Style: "Long Chain Drop" } },
      ],
    },
    {
      title: "Diamond Tennis Bracelet",
      handle: "diamond-tennis-bracelet",
      description:
        "A stunning tennis bracelet featuring cubic zirconia stones set in rhodium-plated sterling silver. The flexible links ensure a comfortable fit while the stones create an endless sparkle.",
      status: "published",
      categories: cat("jewelry"),
      options: [
        { title: "Size", values: ["6.5 inch", "7 inch", "7.5 inch"] },
      ],
      variants: [
        { title: "6.5 inch", sku: "TENNIS-BRACE-6.5", manage_inventory: false, options: { Size: "6.5 inch" } },
        { title: "7 inch", sku: "TENNIS-BRACE-7", manage_inventory: false, options: { Size: "7 inch" } },
        { title: "7.5 inch", sku: "TENNIS-BRACE-7.5", manage_inventory: false, options: { Size: "7.5 inch" } },
      ],
    },

    // ═══════════════════ ACCESSORIES (2) ═══════════════════
    {
      title: "Silk Scarf - Abstract Print",
      handle: "silk-scarf-abstract",
      description:
        "A luxurious 100% mulberry silk scarf with a hand-designed abstract print. The generous 90cm x 90cm size allows endless styling possibilities — wear as a headscarf, necktie, or bag accent.",
      status: "published",
      categories: cat("accessories"),
      options: [
        { title: "Print", values: ["Sunset Abstract", "Ocean Waves", "Garden Bloom"] },
      ],
      variants: [
        { title: "Sunset Abstract", sku: "SILK-SCARF-SUNSET", manage_inventory: false, options: { Print: "Sunset Abstract" } },
        { title: "Ocean Waves", sku: "SILK-SCARF-OCEAN", manage_inventory: false, options: { Print: "Ocean Waves" } },
        { title: "Garden Bloom", sku: "SILK-SCARF-GARDEN", manage_inventory: false, options: { Print: "Garden Bloom" } },
      ],
    },
    {
      title: "Leather Belt with Gold Buckle",
      handle: "leather-belt-gold-buckle",
      description:
        "A refined leather belt featuring a signature gold-tone buckle. Crafted from full-grain Italian leather that develops a beautiful patina over time.",
      status: "published",
      categories: cat("accessories"),
      options: [
        { title: "Size", values: ["S (26-28)", "M (30-32)", "L (34-36)"] },
        { title: "Color", values: ["Black", "Tan"] },
      ],
      variants: [
        { title: "Black / S", sku: "BELT-BLK-S", manage_inventory: false, options: { Size: "S (26-28)", Color: "Black" } },
        { title: "Black / M", sku: "BELT-BLK-M", manage_inventory: false, options: { Size: "M (30-32)", Color: "Black" } },
        { title: "Black / L", sku: "BELT-BLK-L", manage_inventory: false, options: { Size: "L (34-36)", Color: "Black" } },
        { title: "Tan / S", sku: "BELT-TAN-S", manage_inventory: false, options: { Size: "S (26-28)", Color: "Tan" } },
        { title: "Tan / M", sku: "BELT-TAN-M", manage_inventory: false, options: { Size: "M (30-32)", Color: "Tan" } },
      ],
    },
  ]);

  } // end if (products don't exist yet)

  const latestProducts = await productService.listProducts({}, { take: 250 });
  const existingProductHandles = new Set(
    latestProducts.map((product: { handle: string }) => product.handle)
  );
  const baselineSupplementalProducts = [
    {
      title: "Classic Tailored Wool Suit",
      handle: "classic-tailored-wool-suit",
      description:
        "A sharp two-piece wool suit designed for modern formalwear with a structured fit and breathable lining.",
      status: "published",
      categories: cat("suits"),
      tags: makeTags("bestseller"),
      thumbnail:
        "https://images.unsplash.com/photo-1593030761757-71fae45fa0e7?w=1200",
      metadata: {
        trending_rating: 4.8,
        trending_reviews: 112,
      },
      options: [
        { title: "Size", values: ["48", "50", "52", "54"] },
        { title: "Color", values: ["Navy", "Charcoal"] },
      ],
      variants: [
        { title: "Navy / 50", sku: "MEN-SUIT-NAVY-50", manage_inventory: false, options: { Size: "50", Color: "Navy" } },
        { title: "Navy / 52", sku: "MEN-SUIT-NAVY-52", manage_inventory: false, options: { Size: "52", Color: "Navy" } },
        { title: "Charcoal / 50", sku: "MEN-SUIT-CHAR-50", manage_inventory: false, options: { Size: "50", Color: "Charcoal" } },
      ],
    },
    {
      title: "Premium Oxford Shirt",
      handle: "premium-oxford-shirt",
      description:
        "A refined oxford cotton shirt with a clean collar and tailored silhouette for office and smart-casual styling.",
      status: "published",
      categories: cat("shirts"),
      tags: makeTags("trending"),
      thumbnail:
        "https://images.unsplash.com/photo-1603251579431-8041402bdeda?w=1200",
      metadata: {
        trending_rating: 4.7,
        trending_reviews: 86,
      },
      options: [
        { title: "Size", values: ["S", "M", "L", "XL"] },
        { title: "Color", values: ["White", "Sky Blue"] },
      ],
      variants: [
        { title: "White / M", sku: "MEN-SHIRT-WHT-M", manage_inventory: false, options: { Size: "M", Color: "White" } },
        { title: "White / L", sku: "MEN-SHIRT-WHT-L", manage_inventory: false, options: { Size: "L", Color: "White" } },
        { title: "Sky Blue / M", sku: "MEN-SHIRT-BLU-M", manage_inventory: false, options: { Size: "M", Color: "Sky Blue" } },
      ],
    },
    {
      title: "Men's Leather Loafers",
      handle: "mens-leather-loafers",
      description:
        "Polished leather loafers with cushioned insoles and a timeless slip-on silhouette.",
      status: "published",
      categories: cat("men-shoes"),
      tags: makeTags("hot"),
      thumbnail:
        "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=1200",
      metadata: {
        trending_rating: 4.9,
        trending_reviews: 134,
        compare_at_price_cents: 35900,
      },
      options: [
        { title: "Size", values: ["41", "42", "43", "44"] },
        { title: "Color", values: ["Black", "Brown"] },
      ],
      variants: [
        { title: "Black / 42", sku: "MEN-LOAFER-BLK-42", manage_inventory: false, options: { Size: "42", Color: "Black" } },
        { title: "Black / 43", sku: "MEN-LOAFER-BLK-43", manage_inventory: false, options: { Size: "43", Color: "Black" } },
        { title: "Brown / 42", sku: "MEN-LOAFER-BRN-42", manage_inventory: false, options: { Size: "42", Color: "Brown" } },
      ],
    },
    {
      title: "Boys Formal Blazer Set",
      handle: "boys-formal-blazer-set",
      description:
        "Smart blazer and trouser set for special events with stretch comfort and easy movement.",
      status: "published",
      categories: cat("boys"),
      tags: makeTags("new"),
      thumbnail:
        "https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=1200",
      metadata: {
        trending_rating: 4.7,
        trending_reviews: 47,
      },
      options: [
        { title: "Size", values: ["6Y", "8Y", "10Y", "12Y"] },
        { title: "Color", values: ["Navy"] },
      ],
      variants: [
        { title: "Navy / 8Y", sku: "KIDS-BOYS-BLAZER-8Y", manage_inventory: false, options: { Size: "8Y", Color: "Navy" } },
        { title: "Navy / 10Y", sku: "KIDS-BOYS-BLAZER-10Y", manage_inventory: false, options: { Size: "10Y", Color: "Navy" } },
      ],
    },
    {
      title: "Girls Party Tulle Dress",
      handle: "girls-party-tulle-dress",
      description:
        "A playful party dress with layered tulle and satin bow details for festive occasions.",
      status: "published",
      categories: cat("girls"),
      tags: makeTags("trending"),
      thumbnail:
        "https://images.unsplash.com/photo-1518831959646-742c3a14ebf7?w=1200",
      metadata: {
        trending_rating: 4.8,
        trending_reviews: 59,
      },
      options: [
        { title: "Size", values: ["5Y", "7Y", "9Y", "11Y"] },
        { title: "Color", values: ["Blush", "Ivory"] },
      ],
      variants: [
        { title: "Blush / 7Y", sku: "KIDS-GIRL-DRESS-BLSH-7Y", manage_inventory: false, options: { Size: "7Y", Color: "Blush" } },
        { title: "Blush / 9Y", sku: "KIDS-GIRL-DRESS-BLSH-9Y", manage_inventory: false, options: { Size: "9Y", Color: "Blush" } },
        { title: "Ivory / 7Y", sku: "KIDS-GIRL-DRESS-IVRY-7Y", manage_inventory: false, options: { Size: "7Y", Color: "Ivory" } },
      ],
    },
    {
      title: "Children Classic Sneakers",
      handle: "children-classic-sneakers",
      description:
        "Durable everyday sneakers for kids with lightweight soles and secure lace-up fit.",
      status: "published",
      categories: cat("children-shoes"),
      tags: makeTags("sale"),
      thumbnail:
        "https://images.unsplash.com/photo-1460353581641-37baddab0fa2?w=1200",
      metadata: {
        trending_rating: 4.6,
        trending_reviews: 63,
        compare_at_price_cents: 17900,
      },
      options: [
        { title: "Size", values: ["30", "32", "34", "36"] },
        { title: "Color", values: ["White", "Black"] },
      ],
      variants: [
        { title: "White / 32", sku: "KIDS-SNEAKER-WHT-32", manage_inventory: false, options: { Size: "32", Color: "White" } },
        { title: "White / 34", sku: "KIDS-SNEAKER-WHT-34", manage_inventory: false, options: { Size: "34", Color: "White" } },
        { title: "Black / 34", sku: "KIDS-SNEAKER-BLK-34", manage_inventory: false, options: { Size: "34", Color: "Black" } },
      ],
    },
  ];
  const additionalTaggedProducts = [
    {
      title: "Crystal Embellished Mini Dress",
      handle: "crystal-embellished-mini-dress",
      description:
        "A glamorous mini dress with hand-placed crystal detailing and a sculpted silhouette for statement evenings.",
      status: "published",
      categories: cat("dresses"),
      tags: makeTags("hot", "sale"),
      thumbnail:
        "https://images.unsplash.com/photo-1612722432474-b971cdcea546?w=1200",
      metadata: {
        trending_rating: 4.9,
        trending_reviews: 173,
        compare_at_price_cents: 61900,
      },
      options: [
        { title: "Size", values: ["XS", "S", "M", "L"] },
        { title: "Color", values: ["Midnight", "Ruby"] },
      ],
      variants: [
        { title: "Midnight / S", sku: "CRYSTAL-MINI-MID-S", manage_inventory: false, options: { Size: "S", Color: "Midnight" } },
        { title: "Midnight / M", sku: "CRYSTAL-MINI-MID-M", manage_inventory: false, options: { Size: "M", Color: "Midnight" } },
        { title: "Ruby / S", sku: "CRYSTAL-MINI-RUB-S", manage_inventory: false, options: { Size: "S", Color: "Ruby" } },
        { title: "Ruby / M", sku: "CRYSTAL-MINI-RUB-M", manage_inventory: false, options: { Size: "M", Color: "Ruby" } },
      ],
    },
    {
      title: "Sculpted Satin Corset Top",
      handle: "sculpted-satin-corset-top",
      description:
        "A sculpted satin corset-style top with contour seams and subtle sheen for elevated evening styling.",
      status: "published",
      categories: cat("tops"),
      tags: makeTags("trending"),
      thumbnail:
        "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=1200",
      metadata: {
        trending_rating: 4.7,
        trending_reviews: 91,
      },
      options: [
        { title: "Size", values: ["XS", "S", "M", "L"] },
        { title: "Color", values: ["Champagne", "Black"] },
      ],
      variants: [
        { title: "Champagne / S", sku: "SATIN-CORSET-CHAMP-S", manage_inventory: false, options: { Size: "S", Color: "Champagne" } },
        { title: "Champagne / M", sku: "SATIN-CORSET-CHAMP-M", manage_inventory: false, options: { Size: "M", Color: "Champagne" } },
        { title: "Black / S", sku: "SATIN-CORSET-BLK-S", manage_inventory: false, options: { Size: "S", Color: "Black" } },
        { title: "Black / M", sku: "SATIN-CORSET-BLK-M", manage_inventory: false, options: { Size: "M", Color: "Black" } },
      ],
    },
    {
      title: "Pleated Palazzo Trousers",
      handle: "pleated-palazzo-trousers",
      description:
        "Flowing high-rise palazzo trousers with sharp pleats, crafted for effortless movement and polished tailoring.",
      status: "published",
      categories: cat("bottoms"),
      tags: makeTags("bestseller"),
      thumbnail:
        "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=1200",
      metadata: {
        trending_rating: 4.8,
        trending_reviews: 103,
      },
      options: [
        { title: "Size", values: ["XS", "S", "M", "L"] },
        { title: "Color", values: ["Black", "Mocha"] },
      ],
      variants: [
        { title: "Black / S", sku: "PALAZZO-BLK-S", manage_inventory: false, options: { Size: "S", Color: "Black" } },
        { title: "Black / M", sku: "PALAZZO-BLK-M", manage_inventory: false, options: { Size: "M", Color: "Black" } },
        { title: "Mocha / S", sku: "PALAZZO-MOCHA-S", manage_inventory: false, options: { Size: "S", Color: "Mocha" } },
        { title: "Mocha / M", sku: "PALAZZO-MOCHA-M", manage_inventory: false, options: { Size: "M", Color: "Mocha" } },
      ],
    },
    {
      title: "Cropped Boucle Jacket",
      handle: "cropped-boucle-jacket",
      description:
        "A refined cropped boucle jacket with pearl buttons and tailored structure for day-to-evening layering.",
      status: "published",
      categories: cat("outerwear"),
      tags: makeTags("new", "trending"),
      thumbnail:
        "https://images.unsplash.com/photo-1551048632-7f9f87f5f6f1?w=1200",
      metadata: {
        trending_rating: 4.8,
        trending_reviews: 74,
      },
      options: [
        { title: "Size", values: ["XS", "S", "M", "L"] },
        { title: "Color", values: ["Ivory", "Black"] },
      ],
      variants: [
        { title: "Ivory / S", sku: "BOUCLE-IVORY-S", manage_inventory: false, options: { Size: "S", Color: "Ivory" } },
        { title: "Ivory / M", sku: "BOUCLE-IVORY-M", manage_inventory: false, options: { Size: "M", Color: "Ivory" } },
        { title: "Black / S", sku: "BOUCLE-BLK-S", manage_inventory: false, options: { Size: "S", Color: "Black" } },
        { title: "Black / M", sku: "BOUCLE-BLK-M", manage_inventory: false, options: { Size: "M", Color: "Black" } },
      ],
    },
    {
      title: "Metallic Clutch Evening Bag",
      handle: "metallic-clutch-evening-bag",
      description:
        "A compact metallic clutch with structured silhouette and detachable chain strap for elevated event styling.",
      status: "published",
      categories: cat("women-bags"),
      tags: makeTags("hot"),
      thumbnail:
        "https://images.unsplash.com/photo-1576053139778-7e32f2ae3cfd?w=1200",
      metadata: {
        trending_rating: 4.7,
        trending_reviews: 81,
        compare_at_price_cents: 32900,
      },
      options: [{ title: "Color", values: ["Gold", "Silver"] }],
      variants: [
        { title: "Gold", sku: "METALLIC-CLUTCH-GOLD", manage_inventory: false, options: { Color: "Gold" } },
        { title: "Silver", sku: "METALLIC-CLUTCH-SILV", manage_inventory: false, options: { Color: "Silver" } },
      ],
    },
    {
      title: "Pearl Chain Layered Necklace",
      handle: "pearl-chain-layered-necklace",
      description:
        "Layered pearl-and-chain necklace with adjustable lengths for dramatic yet elegant neckline styling.",
      status: "published",
      categories: cat("women-jewelry"),
      tags: makeTags("bestseller"),
      thumbnail:
        "https://images.unsplash.com/photo-1611652022419-a9419f74343d?w=1200",
      metadata: {
        trending_rating: 4.9,
        trending_reviews: 151,
      },
      options: [{ title: "Length", values: ["16 inch", "18 inch"] }],
      variants: [
        { title: "16 inch", sku: "PEARL-CHAIN-16", manage_inventory: false, options: { Length: "16 inch" } },
        { title: "18 inch", sku: "PEARL-CHAIN-18", manage_inventory: false, options: { Length: "18 inch" } },
      ],
    },
    {
      title: "Men Slim Fit Tuxedo Jacket",
      handle: "men-slim-fit-tuxedo-jacket",
      description:
        "A modern slim-fit tuxedo jacket with satin lapels and crisp structure for formal events.",
      status: "published",
      categories: cat("suits"),
      tags: makeTags("hot", "trending"),
      thumbnail:
        "https://images.unsplash.com/photo-1593032465171-8bd6deebc4e2?w=1200",
      metadata: {
        trending_rating: 4.8,
        trending_reviews: 96,
        compare_at_price_cents: 78900,
      },
      options: [
        { title: "Size", values: ["48", "50", "52", "54"] },
        { title: "Color", values: ["Black", "Midnight"] },
      ],
      variants: [
        { title: "Black / 50", sku: "MEN-TUX-BLK-50", manage_inventory: false, options: { Size: "50", Color: "Black" } },
        { title: "Black / 52", sku: "MEN-TUX-BLK-52", manage_inventory: false, options: { Size: "52", Color: "Black" } },
        { title: "Midnight / 50", sku: "MEN-TUX-MID-50", manage_inventory: false, options: { Size: "50", Color: "Midnight" } },
      ],
    },
    {
      title: "Girls Glitter Party Heels",
      handle: "girls-glitter-party-heels",
      description:
        "Sparkling party heels for girls with padded insoles and secure ankle strap for celebrations.",
      status: "published",
      categories: cat("children-shoes"),
      tags: makeTags("new", "sale"),
      thumbnail:
        "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=1200",
      metadata: {
        trending_rating: 4.7,
        trending_reviews: 44,
        compare_at_price_cents: 19900,
      },
      options: [
        { title: "Size", values: ["30", "32", "34", "36"] },
        { title: "Color", values: ["Silver", "Pink"] },
      ],
      variants: [
        { title: "Silver / 32", sku: "KIDS-GLITTER-HEEL-SLV-32", manage_inventory: false, options: { Size: "32", Color: "Silver" } },
        { title: "Silver / 34", sku: "KIDS-GLITTER-HEEL-SLV-34", manage_inventory: false, options: { Size: "34", Color: "Silver" } },
        { title: "Pink / 32", sku: "KIDS-GLITTER-HEEL-PNK-32", manage_inventory: false, options: { Size: "32", Color: "Pink" } },
      ],
    },
  ];
  const categoryCoverageProducts = [
    {
      title: "Women Heritage Wool Coat",
      handle: "women-heritage-wool-coat",
      description:
        "A refined heritage wool coat with structured shoulders and tailored silhouette for polished winter styling.",
      status: "published",
      categories: [...cat("women"), ...cat("outerwear")],
      tags: makeTags("trending"),
      thumbnail:
        "https://images.unsplash.com/photo-1548624313-0396c75dd2b4?w=1200",
      metadata: { trending_rating: 4.8, trending_reviews: 98 },
      options: [
        { title: "Size", values: ["XS", "S", "M", "L"] },
        { title: "Color", values: ["Camel", "Black"] },
      ],
      variants: [
        { title: "Camel / S", sku: "WOMEN-COAT-CAMEL-S", manage_inventory: false, options: { Size: "S", Color: "Camel" } },
        { title: "Camel / M", sku: "WOMEN-COAT-CAMEL-M", manage_inventory: false, options: { Size: "M", Color: "Camel" } },
        { title: "Black / S", sku: "WOMEN-COAT-BLK-S", manage_inventory: false, options: { Size: "S", Color: "Black" } },
      ],
    },
    {
      title: "Men Tailored Evening Suit",
      handle: "men-tailored-evening-suit",
      description:
        "A modern evening suit with peak lapels and sharp structure, crafted for black-tie and formal occasions.",
      status: "published",
      categories: [...cat("men"), ...cat("suits")],
      tags: makeTags("bestseller"),
      thumbnail:
        "https://images.unsplash.com/photo-1617127365659-c47fa864d8bc?w=1200",
      metadata: { trending_rating: 4.9, trending_reviews: 121 },
      options: [
        { title: "Size", values: ["48", "50", "52", "54"] },
        { title: "Color", values: ["Black", "Navy"] },
      ],
      variants: [
        { title: "Black / 50", sku: "MEN-EVENING-SUIT-BLK-50", manage_inventory: false, options: { Size: "50", Color: "Black" } },
        { title: "Black / 52", sku: "MEN-EVENING-SUIT-BLK-52", manage_inventory: false, options: { Size: "52", Color: "Black" } },
        { title: "Navy / 50", sku: "MEN-EVENING-SUIT-NAVY-50", manage_inventory: false, options: { Size: "50", Color: "Navy" } },
      ],
    },
    {
      title: "Children Weekend Luxe Set",
      handle: "children-weekend-luxe-set",
      description:
        "Comfortable premium cotton weekend set for active children with breathable fabric and flexible fit.",
      status: "published",
      categories: cat("children"),
      tags: makeTags("new"),
      thumbnail:
        "https://images.unsplash.com/photo-1503919545889-aef636e10ad4?w=1200",
      metadata: { trending_rating: 4.7, trending_reviews: 64 },
      options: [
        { title: "Size", values: ["6Y", "8Y", "10Y", "12Y"] },
        { title: "Color", values: ["Sand", "Navy"] },
      ],
      variants: [
        { title: "Sand / 8Y", sku: "CHILD-WEEKEND-SET-SAND-8Y", manage_inventory: false, options: { Size: "8Y", Color: "Sand" } },
        { title: "Sand / 10Y", sku: "CHILD-WEEKEND-SET-SAND-10Y", manage_inventory: false, options: { Size: "10Y", Color: "Sand" } },
        { title: "Navy / 10Y", sku: "CHILD-WEEKEND-SET-NAVY-10Y", manage_inventory: false, options: { Size: "10Y", Color: "Navy" } },
      ],
    },
    {
      title: "Boys Utility Jogger Set",
      handle: "boys-utility-jogger-set",
      description:
        "Street-inspired jogger and zip jacket set for boys with soft brushed interior and utility styling.",
      status: "published",
      categories: cat("boys"),
      tags: makeTags("trending"),
      thumbnail:
        "https://images.unsplash.com/photo-1519457431-44ccd64f7b94?w=1200",
      metadata: { trending_rating: 4.6, trending_reviews: 42 },
      options: [
        { title: "Size", values: ["7Y", "9Y", "11Y"] },
        { title: "Color", values: ["Olive", "Black"] },
      ],
      variants: [
        { title: "Olive / 9Y", sku: "BOYS-JOGGER-OLIVE-9Y", manage_inventory: false, options: { Size: "9Y", Color: "Olive" } },
        { title: "Black / 9Y", sku: "BOYS-JOGGER-BLK-9Y", manage_inventory: false, options: { Size: "9Y", Color: "Black" } },
      ],
    },
    {
      title: "Girls Ruffle Occasion Dress",
      handle: "girls-ruffle-occasion-dress",
      description:
        "Elegant occasion dress with layered ruffle sleeves and satin waistband, designed for celebration looks.",
      status: "published",
      categories: cat("girls"),
      tags: makeTags("hot"),
      thumbnail:
        "https://images.unsplash.com/photo-1515041219749-89347f83291a?w=1200",
      metadata: { trending_rating: 4.8, trending_reviews: 73, compare_at_price_cents: 28900 },
      options: [
        { title: "Size", values: ["5Y", "7Y", "9Y"] },
        { title: "Color", values: ["Rose", "Ivory"] },
      ],
      variants: [
        { title: "Rose / 7Y", sku: "GIRLS-RUFFLE-DRESS-ROSE-7Y", manage_inventory: false, options: { Size: "7Y", Color: "Rose" } },
        { title: "Ivory / 7Y", sku: "GIRLS-RUFFLE-DRESS-IVORY-7Y", manage_inventory: false, options: { Size: "7Y", Color: "Ivory" } },
      ],
    },
    {
      title: "Baby Cashmere Knit Romper",
      handle: "baby-cashmere-knit-romper",
      description:
        "Ultra-soft cashmere blend romper for babies with buttoned shoulder opening and gentle stretch fit.",
      status: "published",
      categories: cat("baby"),
      tags: makeTags("bestseller"),
      thumbnail:
        "https://images.unsplash.com/photo-1519689680058-324335c77eba?w=1200",
      metadata: { trending_rating: 4.9, trending_reviews: 57 },
      options: [
        { title: "Size", values: ["3M", "6M", "9M", "12M"] },
        { title: "Color", values: ["Cream", "Sky"] },
      ],
      variants: [
        { title: "Cream / 6M", sku: "BABY-ROMPER-CREAM-6M", manage_inventory: false, options: { Size: "6M", Color: "Cream" } },
        { title: "Sky / 6M", sku: "BABY-ROMPER-SKY-6M", manage_inventory: false, options: { Size: "6M", Color: "Sky" } },
      ],
    },
    {
      title: "Children Explorer Backpack",
      handle: "children-explorer-backpack",
      description:
        "Durable mini backpack with padded straps and water-resistant shell for school and weekend outings.",
      status: "published",
      categories: cat("children-accessories"),
      tags: makeTags("trending"),
      thumbnail:
        "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=1200",
      metadata: { trending_rating: 4.7, trending_reviews: 88 },
      options: [{ title: "Color", values: ["Navy", "Mustard", "Black"] }],
      variants: [
        { title: "Navy", sku: "KIDS-BACKPACK-NAVY", manage_inventory: false, options: { Color: "Navy" } },
        { title: "Mustard", sku: "KIDS-BACKPACK-MUSTARD", manage_inventory: false, options: { Color: "Mustard" } },
      ],
    },
    {
      title: "Children Run Flex Trainers",
      handle: "children-run-flex-trainers",
      description:
        "Lightweight trainers for children with flexible sole and breathable mesh upper for all-day play.",
      status: "published",
      categories: cat("children-shoes"),
      tags: makeTags("sale"),
      thumbnail:
        "https://images.unsplash.com/photo-1543508282-6319a3e2621f?w=1200",
      metadata: { trending_rating: 4.6, trending_reviews: 67, compare_at_price_cents: 19900 },
      options: [
        { title: "Size", values: ["30", "32", "34", "36"] },
        { title: "Color", values: ["White", "Blue"] },
      ],
      variants: [
        { title: "White / 32", sku: "KIDS-RUNFLEX-WHT-32", manage_inventory: false, options: { Size: "32", Color: "White" } },
        { title: "Blue / 34", sku: "KIDS-RUNFLEX-BLU-34", manage_inventory: false, options: { Size: "34", Color: "Blue" } },
      ],
    },
    {
      title: "Men Signature Chino Trousers",
      handle: "men-signature-chino-trousers",
      description:
        "Slim-tailored chino trousers in stretch cotton twill for sharp everyday office-to-evening styling.",
      status: "published",
      categories: [...cat("trousers"), ...cat("men")],
      tags: makeTags("bestseller"),
      thumbnail:
        "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=1200",
      metadata: { trending_rating: 4.8, trending_reviews: 108 },
      options: [
        { title: "Size", values: ["30", "32", "34", "36"] },
        { title: "Color", values: ["Sand", "Navy"] },
      ],
      variants: [
        { title: "Sand / 32", sku: "MEN-CHINO-SAND-32", manage_inventory: false, options: { Size: "32", Color: "Sand" } },
        { title: "Navy / 32", sku: "MEN-CHINO-NAVY-32", manage_inventory: false, options: { Size: "32", Color: "Navy" } },
      ],
    },
    {
      title: "Men Merino Half-Zip Knit",
      handle: "men-merino-halfzip-knit",
      description:
        "Fine merino knit half-zip with clean collar structure for smart layering in cooler seasons.",
      status: "published",
      categories: [...cat("knitwear"), ...cat("men")],
      tags: makeTags("new"),
      thumbnail:
        "https://images.unsplash.com/photo-1617127365659-c47fa864d8bc?w=1200",
      metadata: { trending_rating: 4.7, trending_reviews: 76 },
      options: [
        { title: "Size", values: ["S", "M", "L", "XL"] },
        { title: "Color", values: ["Grey", "Navy"] },
      ],
      variants: [
        { title: "Grey / M", sku: "MEN-KNIT-HZIP-GRY-M", manage_inventory: false, options: { Size: "M", Color: "Grey" } },
        { title: "Navy / M", sku: "MEN-KNIT-HZIP-NAVY-M", manage_inventory: false, options: { Size: "M", Color: "Navy" } },
      ],
    },
    {
      title: "Men Aviator Polarized Sunglasses",
      handle: "men-aviator-polarized-sunglasses",
      description:
        "Premium aviator sunglasses with polarized lenses and lightweight metal frame for everyday luxury wear.",
      status: "published",
      categories: cat("men-accessories"),
      tags: makeTags("hot"),
      thumbnail:
        "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=1200",
      metadata: { trending_rating: 4.8, trending_reviews: 83 },
      options: [{ title: "Color", values: ["Gold", "Gunmetal"] }],
      variants: [
        { title: "Gold", sku: "MEN-AVIATOR-GOLD", manage_inventory: false, options: { Color: "Gold" } },
        { title: "Gunmetal", sku: "MEN-AVIATOR-GUN", manage_inventory: false, options: { Color: "Gunmetal" } },
      ],
    },
    {
      title: "Men Leather Weekender Duffle",
      handle: "men-leather-weekender-duffle",
      description:
        "Full-grain leather weekender duffle with reinforced handles and detachable shoulder strap.",
      status: "published",
      categories: cat("men-bags"),
      tags: makeTags("trending"),
      thumbnail:
        "https://images.unsplash.com/photo-1547949003-9792a18a2601?w=1200",
      metadata: { trending_rating: 4.7, trending_reviews: 69 },
      options: [{ title: "Color", values: ["Tan", "Black"] }],
      variants: [
        { title: "Tan", sku: "MEN-DUFFLE-TAN", manage_inventory: false, options: { Color: "Tan" } },
        { title: "Black", sku: "MEN-DUFFLE-BLK", manage_inventory: false, options: { Color: "Black" } },
      ],
    },
    {
      title: "Men Classic Derby Shoes",
      handle: "men-classic-derby-shoes",
      description:
        "Polished leather derby shoes with stacked heel and cushioned lining for formal and business looks.",
      status: "published",
      categories: cat("men-shoes"),
      tags: makeTags("bestseller"),
      thumbnail:
        "https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?w=1200",
      metadata: { trending_rating: 4.8, trending_reviews: 99 },
      options: [
        { title: "Size", values: ["41", "42", "43", "44"] },
        { title: "Color", values: ["Black", "Brown"] },
      ],
      variants: [
        { title: "Black / 42", sku: "MEN-DERBY-BLK-42", manage_inventory: false, options: { Size: "42", Color: "Black" } },
        { title: "Brown / 42", sku: "MEN-DERBY-BRN-42", manage_inventory: false, options: { Size: "42", Color: "Brown" } },
      ],
    },
    {
      title: "Women Satin Ankle Pumps",
      handle: "women-satin-ankle-pumps",
      description:
        "Elegant satin ankle-strap pumps with sculpted heel designed for events and statement dressing.",
      status: "published",
      categories: cat("women-shoes"),
      tags: makeTags("hot", "sale"),
      thumbnail:
        "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=1200",
      metadata: { trending_rating: 4.9, trending_reviews: 138, compare_at_price_cents: 46900 },
      options: [
        { title: "Size", values: ["36", "37", "38", "39", "40"] },
        { title: "Color", values: ["Gold", "Black"] },
      ],
      variants: [
        { title: "Gold / 38", sku: "WOMEN-PUMP-GOLD-38", manage_inventory: false, options: { Size: "38", Color: "Gold" } },
        { title: "Black / 38", sku: "WOMEN-PUMP-BLK-38", manage_inventory: false, options: { Size: "38", Color: "Black" } },
      ],
    },
    {
      title: "Women Crescent Leather Tote",
      handle: "women-crescent-leather-tote",
      description:
        "Contemporary crescent tote in pebbled leather with spacious interior and magnetic closure.",
      status: "published",
      categories: cat("women-bags"),
      tags: makeTags("trending"),
      thumbnail:
        "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=1200",
      metadata: { trending_rating: 4.7, trending_reviews: 92 },
      options: [{ title: "Color", values: ["Black", "Cream", "Tan"] }],
      variants: [
        { title: "Black", sku: "WOMEN-TOTE-CRES-BLK", manage_inventory: false, options: { Color: "Black" } },
        { title: "Cream", sku: "WOMEN-TOTE-CRES-CRM", manage_inventory: false, options: { Color: "Cream" } },
      ],
    },
    {
      title: "Women Layered Charm Necklace",
      handle: "women-layered-charm-necklace",
      description:
        "Layered charm necklace in gold-plated brass with adjustable chain lengths for versatile styling.",
      status: "published",
      categories: cat("women-jewelry"),
      tags: makeTags("bestseller"),
      thumbnail:
        "https://images.unsplash.com/photo-1617038220319-276d3cfab638?w=1200",
      metadata: { trending_rating: 4.8, trending_reviews: 117 },
      options: [{ title: "Length", values: ["16 inch", "18 inch"] }],
      variants: [
        { title: "16 inch", sku: "WOMEN-CHARM-NECK-16", manage_inventory: false, options: { Length: "16 inch" } },
        { title: "18 inch", sku: "WOMEN-CHARM-NECK-18", manage_inventory: false, options: { Length: "18 inch" } },
      ],
    },
    {
      title: "Women Silk Square Scarf",
      handle: "women-silk-square-scarf",
      description:
        "Printed silk square scarf with rich color depth for neck, hair, or handbag styling accents.",
      status: "published",
      categories: cat("women-accessories"),
      tags: makeTags("new"),
      thumbnail:
        "https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=1200",
      metadata: { trending_rating: 4.7, trending_reviews: 58 },
      options: [{ title: "Print", values: ["Monogram", "Botanical"] }],
      variants: [
        { title: "Monogram", sku: "WOMEN-SCARF-MONO", manage_inventory: false, options: { Print: "Monogram" } },
        { title: "Botanical", sku: "WOMEN-SCARF-BOTA", manage_inventory: false, options: { Print: "Botanical" } },
      ],
    },
    {
      title: "Seasonal Designer Sale Edit",
      handle: "seasonal-designer-sale-edit",
      description:
        "Curated seasonal sale edit featuring premium fabrics, limited stock, and elevated silhouettes at reduced prices.",
      status: "published",
      categories: cat("sale"),
      tags: makeTags("sale", "hot"),
      thumbnail:
        "https://images.unsplash.com/photo-1607082349566-187342175e2f?w=1200",
      metadata: { trending_rating: 4.8, trending_reviews: 145, compare_at_price_cents: 39900 },
      options: [
        { title: "Size", values: ["S", "M", "L"] },
        { title: "Color", values: ["Black", "Champagne"] },
      ],
      variants: [
        { title: "Black / M", sku: "SALE-EDIT-BLK-M", manage_inventory: false, options: { Size: "M", Color: "Black" } },
        { title: "Champagne / M", sku: "SALE-EDIT-CHAMP-M", manage_inventory: false, options: { Size: "M", Color: "Champagne" } },
      ],
    },
  ];
  const phaseTwoExpansionProducts = [
    {
      title: "Women Draped Silk Blouse",
      handle: "women-draped-silk-blouse",
      description: "Fluid silk blouse with soft drape and elegant cuff detailing.",
      status: "published",
      categories: [...cat("women"), ...cat("tops")],
      tags: makeTags("trending"),
      thumbnail: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1200",
      metadata: { trending_rating: 4.8, trending_reviews: 88 },
      options: [{ title: "Size", values: ["S", "M", "L"] }, { title: "Color", values: ["Ivory", "Black"] }],
      variants: [
        { title: "Ivory / M", sku: "WOMEN-SILK-BLS-IVR-M", manage_inventory: false, options: { Size: "M", Color: "Ivory" } },
        { title: "Black / M", sku: "WOMEN-SILK-BLS-BLK-M", manage_inventory: false, options: { Size: "M", Color: "Black" } },
      ],
    },
    {
      title: "Women Pleated Occasion Skirt",
      handle: "women-pleated-occasion-skirt",
      description: "Flowing pleated skirt with satin sheen and flattering high-rise waist.",
      status: "published",
      categories: [...cat("women"), ...cat("bottoms")],
      tags: makeTags("hot"),
      thumbnail: "https://images.unsplash.com/photo-1551163943-3f6a855d1153?w=1200",
      metadata: { trending_rating: 4.7, trending_reviews: 73 },
      options: [{ title: "Size", values: ["S", "M", "L"] }, { title: "Color", values: ["Gold", "Navy"] }],
      variants: [
        { title: "Gold / M", sku: "WOMEN-PLSKIRT-GLD-M", manage_inventory: false, options: { Size: "M", Color: "Gold" } },
        { title: "Navy / M", sku: "WOMEN-PLSKIRT-NVY-M", manage_inventory: false, options: { Size: "M", Color: "Navy" } },
      ],
    },
    {
      title: "Men Premium Oxford Overshirt",
      handle: "men-premium-oxford-overshirt",
      description: "Structured oxford overshirt for polished smart-casual dressing.",
      status: "published",
      categories: [...cat("men"), ...cat("shirts")],
      tags: makeTags("bestseller"),
      thumbnail: "https://images.unsplash.com/photo-1527719327859-c6ce80353573?w=1200",
      metadata: { trending_rating: 4.8, trending_reviews: 101 },
      options: [{ title: "Size", values: ["M", "L", "XL"] }, { title: "Color", values: ["White", "Blue"] }],
      variants: [
        { title: "White / L", sku: "MEN-OVERSHIRT-WHT-L", manage_inventory: false, options: { Size: "L", Color: "White" } },
        { title: "Blue / L", sku: "MEN-OVERSHIRT-BLU-L", manage_inventory: false, options: { Size: "L", Color: "Blue" } },
      ],
    },
    {
      title: "Men Classic Formal Trousers",
      handle: "men-classic-formal-trousers",
      description: "Tailored formal trousers in stretch wool blend for business and events.",
      status: "published",
      categories: [...cat("men"), ...cat("trousers")],
      tags: makeTags("trending"),
      thumbnail: "https://images.unsplash.com/photo-1506629905607-46c25f4fcf4f?w=1200",
      metadata: { trending_rating: 4.7, trending_reviews: 84 },
      options: [{ title: "Size", values: ["30", "32", "34"] }, { title: "Color", values: ["Charcoal", "Black"] }],
      variants: [
        { title: "Charcoal / 32", sku: "MEN-FORMAL-TRS-CHR-32", manage_inventory: false, options: { Size: "32", Color: "Charcoal" } },
        { title: "Black / 32", sku: "MEN-FORMAL-TRS-BLK-32", manage_inventory: false, options: { Size: "32", Color: "Black" } },
      ],
    },
    {
      title: "Children Luxe Weekend Hoodie",
      handle: "children-luxe-weekend-hoodie",
      description: "Premium cotton hoodie for kids with soft interior and clean street fit.",
      status: "published",
      categories: cat("children"),
      tags: makeTags("new"),
      thumbnail: "https://images.unsplash.com/photo-1503919005314-30d93d07d823?w=1200",
      metadata: { trending_rating: 4.6, trending_reviews: 52 },
      options: [{ title: "Size", values: ["6Y", "8Y", "10Y"] }, { title: "Color", values: ["Grey", "Navy"] }],
      variants: [
        { title: "Grey / 8Y", sku: "CHILD-HOODIE-GRY-8Y", manage_inventory: false, options: { Size: "8Y", Color: "Grey" } },
        { title: "Navy / 8Y", sku: "CHILD-HOODIE-NVY-8Y", manage_inventory: false, options: { Size: "8Y", Color: "Navy" } },
      ],
    },
    {
      title: "Children Holiday Gift Set",
      handle: "children-holiday-gift-set",
      description: "Seasonal gift-ready kids fashion set with premium finishing and packaging.",
      status: "published",
      categories: cat("sale"),
      tags: makeTags("sale", "hot"),
      thumbnail: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1200",
      metadata: { trending_rating: 4.7, trending_reviews: 69, compare_at_price_cents: 25900 },
      options: [{ title: "Size", values: ["6Y", "8Y", "10Y"] }, { title: "Color", values: ["Red", "Blue"] }],
      variants: [
        { title: "Red / 8Y", sku: "SALE-KIDS-GIFT-RED-8Y", manage_inventory: false, options: { Size: "8Y", Color: "Red" } },
        { title: "Blue / 8Y", sku: "SALE-KIDS-GIFT-BLU-8Y", manage_inventory: false, options: { Size: "8Y", Color: "Blue" } },
      ],
    },
    {
      title: "Women Signature Cat-Eye Sunglasses",
      handle: "women-signature-cateye-sunglasses",
      description: "Signature cat-eye sunglasses with UV400 lenses and lightweight frame.",
      status: "published",
      categories: cat("women-accessories"),
      tags: makeTags("bestseller"),
      thumbnail: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=1200",
      metadata: { trending_rating: 4.8, trending_reviews: 93 },
      options: [{ title: "Color", values: ["Black", "Tortoise"] }],
      variants: [
        { title: "Black", sku: "WOMEN-CATEYE-BLK", manage_inventory: false, options: { Color: "Black" } },
        { title: "Tortoise", sku: "WOMEN-CATEYE-TORT", manage_inventory: false, options: { Color: "Tortoise" } },
      ],
    },
    {
      title: "Women Soft Leather Shoulder Bag",
      handle: "women-soft-leather-shoulder-bag",
      description: "Supple leather shoulder bag with structured interior compartments.",
      status: "published",
      categories: cat("women-bags"),
      tags: makeTags("trending"),
      thumbnail: "https://images.unsplash.com/photo-1559563458-527698bf5295?w=1200",
      metadata: { trending_rating: 4.7, trending_reviews: 85 },
      options: [{ title: "Color", values: ["Black", "Cognac"] }],
      variants: [
        { title: "Black", sku: "WOMEN-SHOULDER-BAG-BLK", manage_inventory: false, options: { Color: "Black" } },
        { title: "Cognac", sku: "WOMEN-SHOULDER-BAG-COG", manage_inventory: false, options: { Color: "Cognac" } },
      ],
    },
    {
      title: "Women Pearl Hoop Earrings",
      handle: "women-pearl-hoop-earrings",
      description: "Modern pearl hoop earrings in gold-tone finish for day-to-evening styling.",
      status: "published",
      categories: cat("women-jewelry"),
      tags: makeTags("hot"),
      thumbnail: "https://images.unsplash.com/photo-1635767798638-3e25273a8236?w=1200",
      metadata: { trending_rating: 4.8, trending_reviews: 110 },
      options: [{ title: "Style", values: ["Classic", "Large Hoop"] }],
      variants: [
        { title: "Classic", sku: "WOMEN-PEARL-HOOP-CLS", manage_inventory: false, options: { Style: "Classic" } },
        { title: "Large Hoop", sku: "WOMEN-PEARL-HOOP-LRG", manage_inventory: false, options: { Style: "Large Hoop" } },
      ],
    },
    {
      title: "Women Evening Platform Sandals",
      handle: "women-evening-platform-sandals",
      description: "Evening platform sandals with secure ankle strap and padded insole.",
      status: "published",
      categories: cat("women-shoes"),
      tags: makeTags("sale"),
      thumbnail: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=1200",
      metadata: { trending_rating: 4.7, trending_reviews: 95, compare_at_price_cents: 42900 },
      options: [{ title: "Size", values: ["36", "37", "38", "39"] }, { title: "Color", values: ["Black", "Gold"] }],
      variants: [
        { title: "Black / 38", sku: "WOMEN-PLATFORM-BLK-38", manage_inventory: false, options: { Size: "38", Color: "Black" } },
        { title: "Gold / 38", sku: "WOMEN-PLATFORM-GLD-38", manage_inventory: false, options: { Size: "38", Color: "Gold" } },
      ],
    },
    {
      title: "Men Leather Card Wallet",
      handle: "men-leather-card-wallet",
      description: "Slim leather card wallet with hand-finished edges and six card slots.",
      status: "published",
      categories: cat("men-accessories"),
      tags: makeTags("new"),
      thumbnail: "https://images.unsplash.com/photo-1627123424574-724758594e93?w=1200",
      metadata: { trending_rating: 4.6, trending_reviews: 48 },
      options: [{ title: "Color", values: ["Black", "Brown"] }],
      variants: [
        { title: "Black", sku: "MEN-WALLET-BLK", manage_inventory: false, options: { Color: "Black" } },
        { title: "Brown", sku: "MEN-WALLET-BRN", manage_inventory: false, options: { Color: "Brown" } },
      ],
    },
    {
      title: "Men Structured Messenger Bag",
      handle: "men-structured-messenger-bag",
      description: "Structured messenger bag with padded laptop sleeve and magnetic flap closure.",
      status: "published",
      categories: cat("men-bags"),
      tags: makeTags("bestseller"),
      thumbnail: "https://images.unsplash.com/photo-1581605405669-fcdf81165afa?w=1200",
      metadata: { trending_rating: 4.7, trending_reviews: 74 },
      options: [{ title: "Color", values: ["Black", "Olive"] }],
      variants: [
        { title: "Black", sku: "MEN-MESSENGER-BAG-BLK", manage_inventory: false, options: { Color: "Black" } },
        { title: "Olive", sku: "MEN-MESSENGER-BAG-OLV", manage_inventory: false, options: { Color: "Olive" } },
      ],
    },
    {
      title: "Men Heritage High-Top Sneakers",
      handle: "men-heritage-hightop-sneakers",
      description: "Heritage-inspired high-top sneakers with premium leather upper and gum sole.",
      status: "published",
      categories: cat("men-shoes"),
      tags: makeTags("hot"),
      thumbnail: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1200",
      metadata: { trending_rating: 4.8, trending_reviews: 109 },
      options: [{ title: "Size", values: ["41", "42", "43", "44"] }, { title: "Color", values: ["White", "Black"] }],
      variants: [
        { title: "White / 42", sku: "MEN-HIGHTOP-WHT-42", manage_inventory: false, options: { Size: "42", Color: "White" } },
        { title: "Black / 42", sku: "MEN-HIGHTOP-BLK-42", manage_inventory: false, options: { Size: "42", Color: "Black" } },
      ],
    },
    {
      title: "Men Slim Linen Summer Shirt",
      handle: "men-slim-linen-summer-shirt",
      description: "Breathable slim-fit linen shirt for warm-weather tailoring and resort styling.",
      status: "published",
      categories: cat("shirts"),
      tags: makeTags("trending"),
      thumbnail: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=1200",
      metadata: { trending_rating: 4.7, trending_reviews: 81 },
      options: [{ title: "Size", values: ["S", "M", "L", "XL"] }, { title: "Color", values: ["White", "Sky"] }],
      variants: [
        { title: "White / M", sku: "MEN-LINEN-SHIRT-WHT-M", manage_inventory: false, options: { Size: "M", Color: "White" } },
        { title: "Sky / M", sku: "MEN-LINEN-SHIRT-SKY-M", manage_inventory: false, options: { Size: "M", Color: "Sky" } },
      ],
    },
    {
      title: "Men Luxe Cashmere Blend Crewneck",
      handle: "men-luxe-cashmere-blend-crewneck",
      description: "Fine cashmere blend crewneck knit with rib trims and premium hand-feel.",
      status: "published",
      categories: cat("knitwear"),
      tags: makeTags("sale"),
      thumbnail: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=1200",
      metadata: { trending_rating: 4.8, trending_reviews: 67, compare_at_price_cents: 27900 },
      options: [{ title: "Size", values: ["S", "M", "L", "XL"] }, { title: "Color", values: ["Grey", "Navy"] }],
      variants: [
        { title: "Grey / M", sku: "MEN-CASH-CRW-GRY-M", manage_inventory: false, options: { Size: "M", Color: "Grey" } },
        { title: "Navy / M", sku: "MEN-CASH-CRW-NVY-M", manage_inventory: false, options: { Size: "M", Color: "Navy" } },
      ],
    },
    {
      title: "Men Formal Double Breasted Jacket",
      handle: "men-formal-doublebreasted-jacket",
      description: "Formal double-breasted jacket with sharp shoulders and satin peak lapels.",
      status: "published",
      categories: cat("suits"),
      tags: makeTags("hot"),
      thumbnail: "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=1200",
      metadata: { trending_rating: 4.9, trending_reviews: 119 },
      options: [{ title: "Size", values: ["48", "50", "52", "54"] }, { title: "Color", values: ["Black", "Midnight"] }],
      variants: [
        { title: "Black / 50", sku: "MEN-DBJKT-BLK-50", manage_inventory: false, options: { Size: "50", Color: "Black" } },
        { title: "Midnight / 50", sku: "MEN-DBJKT-MID-50", manage_inventory: false, options: { Size: "50", Color: "Midnight" } },
      ],
    },
    {
      title: "Boys Street Cargo Pants",
      handle: "boys-street-cargo-pants",
      description: "Street cargo pants for boys with utility pockets and stretch waistband.",
      status: "published",
      categories: cat("boys"),
      tags: makeTags("trending"),
      thumbnail: "https://images.unsplash.com/photo-1519457431-44ccd64f7b94?w=1200",
      metadata: { trending_rating: 4.6, trending_reviews: 39 },
      options: [{ title: "Size", values: ["7Y", "9Y", "11Y"] }, { title: "Color", values: ["Khaki", "Black"] }],
      variants: [
        { title: "Khaki / 9Y", sku: "BOYS-CARGO-KHK-9Y", manage_inventory: false, options: { Size: "9Y", Color: "Khaki" } },
        { title: "Black / 9Y", sku: "BOYS-CARGO-BLK-9Y", manage_inventory: false, options: { Size: "9Y", Color: "Black" } },
      ],
    },
    {
      title: "Girls Soft Knit Cardigan",
      handle: "girls-soft-knit-cardigan",
      description: "Soft-touch knit cardigan for girls with pearlized buttons and light warmth.",
      status: "published",
      categories: cat("girls"),
      tags: makeTags("new"),
      thumbnail: "https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=1200",
      metadata: { trending_rating: 4.7, trending_reviews: 51 },
      options: [{ title: "Size", values: ["5Y", "7Y", "9Y"] }, { title: "Color", values: ["Ivory", "Rose"] }],
      variants: [
        { title: "Ivory / 7Y", sku: "GIRLS-CARDI-IVR-7Y", manage_inventory: false, options: { Size: "7Y", Color: "Ivory" } },
        { title: "Rose / 7Y", sku: "GIRLS-CARDI-RSE-7Y", manage_inventory: false, options: { Size: "7Y", Color: "Rose" } },
      ],
    },
    {
      title: "Baby Luxe Cotton Sleep Set",
      handle: "baby-luxe-cotton-sleep-set",
      description: "Breathable cotton sleep set for babies with easy snap fastenings.",
      status: "published",
      categories: cat("baby"),
      tags: makeTags("sale"),
      thumbnail: "https://images.unsplash.com/photo-1519689680058-324335c77eba?w=1200",
      metadata: { trending_rating: 4.8, trending_reviews: 62, compare_at_price_cents: 13900 },
      options: [{ title: "Size", values: ["3M", "6M", "9M"] }, { title: "Color", values: ["Cream", "Mint"] }],
      variants: [
        { title: "Cream / 6M", sku: "BABY-SLEEPSET-CRM-6M", manage_inventory: false, options: { Size: "6M", Color: "Cream" } },
        { title: "Mint / 6M", sku: "BABY-SLEEPSET-MNT-6M", manage_inventory: false, options: { Size: "6M", Color: "Mint" } },
      ],
    },
    {
      title: "Children Adventure Cap Set",
      handle: "children-adventure-cap-set",
      description: "Pack of everyday caps for children with adjustable fit and sun protection brim.",
      status: "published",
      categories: cat("children-accessories"),
      tags: makeTags("bestseller"),
      thumbnail: "https://images.unsplash.com/photo-1521369909029-2afed882baee?w=1200",
      metadata: { trending_rating: 4.6, trending_reviews: 44 },
      options: [{ title: "Color", values: ["Navy", "Beige"] }],
      variants: [
        { title: "Navy", sku: "KIDS-CAPSET-NVY", manage_inventory: false, options: { Color: "Navy" } },
        { title: "Beige", sku: "KIDS-CAPSET-BEG", manage_inventory: false, options: { Color: "Beige" } },
      ],
    },
    {
      title: "Children Everyday Slip-On Sneakers",
      handle: "children-everyday-slipon-sneakers",
      description: "Easy slip-on sneakers for children with lightweight foam sole and cushioned footbed.",
      status: "published",
      categories: cat("children-shoes"),
      tags: makeTags("trending"),
      thumbnail: "https://images.unsplash.com/photo-1460353581641-37baddab0fa2?w=1200",
      metadata: { trending_rating: 4.7, trending_reviews: 58 },
      options: [{ title: "Size", values: ["30", "32", "34", "36"] }, { title: "Color", values: ["White", "Grey"] }],
      variants: [
        { title: "White / 32", sku: "KIDS-SLIPON-WHT-32", manage_inventory: false, options: { Size: "32", Color: "White" } },
        { title: "Grey / 34", sku: "KIDS-SLIPON-GRY-34", manage_inventory: false, options: { Size: "34", Color: "Grey" } },
      ],
    },
  ];
  const phaseThreeExpansionProducts = [
    {
      title: "Women Ornate Silk Headband",
      handle: "women-ornate-silk-headband",
      description: "Ornate silk headband with padded profile and polished gold hardware accent.",
      status: "published",
      categories: [...cat("women-accessories"), ...cat("accessories")],
      tags: makeTags("new"),
      thumbnail: "https://images.unsplash.com/photo-1594633313593-bab3825d0caf?w=1200",
      metadata: { trending_rating: 4.6, trending_reviews: 41 },
      options: [{ title: "Color", values: ["Champagne", "Black"] }],
      variants: [
        { title: "Champagne", sku: "WOMEN-HEADBAND-CHAMP", manage_inventory: false, options: { Color: "Champagne" } },
        { title: "Black", sku: "WOMEN-HEADBAND-BLK", manage_inventory: false, options: { Color: "Black" } },
      ],
    },
    {
      title: "Women Mini Structured Crossbody",
      handle: "women-mini-structured-crossbody",
      description: "Mini structured crossbody with detachable chain strap and compact interior.",
      status: "published",
      categories: [...cat("women-bags"), ...cat("bags")],
      tags: makeTags("hot"),
      thumbnail: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=1200",
      metadata: { trending_rating: 4.8, trending_reviews: 97 },
      options: [{ title: "Color", values: ["Ivory", "Black"] }],
      variants: [
        { title: "Ivory", sku: "WOMEN-CROSSBODY-IVR", manage_inventory: false, options: { Color: "Ivory" } },
        { title: "Black", sku: "WOMEN-CROSSBODY-BLK", manage_inventory: false, options: { Color: "Black" } },
      ],
    },
    {
      title: "Women Crystal Strap Heels",
      handle: "women-crystal-strap-heels",
      description: "Crystal strap heels with elegant silhouette and cushioned insole for events.",
      status: "published",
      categories: [...cat("women-shoes"), ...cat("shoes")],
      tags: makeTags("sale"),
      thumbnail: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=1200",
      metadata: { trending_rating: 4.7, trending_reviews: 86, compare_at_price_cents: 48900 },
      options: [{ title: "Size", values: ["36", "37", "38", "39"] }, { title: "Color", values: ["Silver", "Black"] }],
      variants: [
        { title: "Silver / 38", sku: "WOMEN-CRYSTAL-HEEL-SLV-38", manage_inventory: false, options: { Size: "38", Color: "Silver" } },
        { title: "Black / 38", sku: "WOMEN-CRYSTAL-HEEL-BLK-38", manage_inventory: false, options: { Size: "38", Color: "Black" } },
      ],
    },
    {
      title: "Women Gilded Cuff Bracelet",
      handle: "women-gilded-cuff-bracelet",
      description: "Gilded cuff bracelet with sculptural profile for statement evening styling.",
      status: "published",
      categories: [...cat("women-jewelry"), ...cat("jewelry")],
      tags: makeTags("trending"),
      thumbnail: "https://images.unsplash.com/photo-1611085583191-a3b181a88401?w=1200",
      metadata: { trending_rating: 4.7, trending_reviews: 63 },
      options: [{ title: "Size", values: ["S/M", "M/L"] }],
      variants: [
        { title: "S/M", sku: "WOMEN-CUFF-BRACE-SM", manage_inventory: false, options: { Size: "S/M" } },
        { title: "M/L", sku: "WOMEN-CUFF-BRACE-ML", manage_inventory: false, options: { Size: "M/L" } },
      ],
    },
    {
      title: "Men Premium Leather Belt Set",
      handle: "men-premium-leather-belt-set",
      description: "Premium leather belt set with interchangeable brushed metal buckles.",
      status: "published",
      categories: [...cat("men-accessories"), ...cat("accessories")],
      tags: makeTags("bestseller"),
      thumbnail: "https://images.unsplash.com/photo-1618354691211-3f5d6b8f14ed?w=1200",
      metadata: { trending_rating: 4.6, trending_reviews: 55 },
      options: [{ title: "Size", values: ["32", "34", "36"] }, { title: "Color", values: ["Black", "Brown"] }],
      variants: [
        { title: "Black / 34", sku: "MEN-BELT-SET-BLK-34", manage_inventory: false, options: { Size: "34", Color: "Black" } },
        { title: "Brown / 34", sku: "MEN-BELT-SET-BRN-34", manage_inventory: false, options: { Size: "34", Color: "Brown" } },
      ],
    },
    {
      title: "Men Weekender Canvas Duffel",
      handle: "men-weekender-canvas-duffel",
      description: "Refined weekender duffel in durable canvas with leather trims and shoulder strap.",
      status: "published",
      categories: [...cat("men-bags"), ...cat("bags")],
      tags: makeTags("trending"),
      thumbnail: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=1200",
      metadata: { trending_rating: 4.7, trending_reviews: 71 },
      options: [{ title: "Color", values: ["Olive", "Black"] }],
      variants: [
        { title: "Olive", sku: "MEN-WEEKENDER-OLV", manage_inventory: false, options: { Color: "Olive" } },
        { title: "Black", sku: "MEN-WEEKENDER-BLK", manage_inventory: false, options: { Color: "Black" } },
      ],
    },
    {
      title: "Men Court Retro Sneakers",
      handle: "men-court-retro-sneakers",
      description: "Court-inspired retro sneakers with leather upper and contrast gum outsole.",
      status: "published",
      categories: [...cat("men-shoes"), ...cat("shoes")],
      tags: makeTags("hot"),
      thumbnail: "https://images.unsplash.com/photo-1549298916-f52d724204b4?w=1200",
      metadata: { trending_rating: 4.8, trending_reviews: 102 },
      options: [{ title: "Size", values: ["41", "42", "43", "44"] }, { title: "Color", values: ["White", "Navy"] }],
      variants: [
        { title: "White / 42", sku: "MEN-RETRO-SNK-WHT-42", manage_inventory: false, options: { Size: "42", Color: "White" } },
        { title: "Navy / 42", sku: "MEN-RETRO-SNK-NVY-42", manage_inventory: false, options: { Size: "42", Color: "Navy" } },
      ],
    },
    {
      title: "Men Tailored Wool Suit Vest",
      handle: "men-tailored-wool-suit-vest",
      description: "Tailored wool suit vest with satin back panel and adjustable fit tab.",
      status: "published",
      categories: cat("suits"),
      tags: makeTags("new"),
      thumbnail: "https://images.unsplash.com/photo-1617127365659-c47fa864d8bc?w=1200",
      metadata: { trending_rating: 4.6, trending_reviews: 44 },
      options: [{ title: "Size", values: ["48", "50", "52"] }, { title: "Color", values: ["Black", "Charcoal"] }],
      variants: [
        { title: "Black / 50", sku: "MEN-SUIT-VEST-BLK-50", manage_inventory: false, options: { Size: "50", Color: "Black" } },
        { title: "Charcoal / 50", sku: "MEN-SUIT-VEST-CHR-50", manage_inventory: false, options: { Size: "50", Color: "Charcoal" } },
      ],
    },
    {
      title: "Men Smart Tapered Trousers",
      handle: "men-smart-tapered-trousers",
      description: "Smart tapered trousers in stretch fabric for all-day polished comfort.",
      status: "published",
      categories: cat("trousers"),
      tags: makeTags("trending"),
      thumbnail: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=1200",
      metadata: { trending_rating: 4.7, trending_reviews: 60 },
      options: [{ title: "Size", values: ["30", "32", "34", "36"] }, { title: "Color", values: ["Navy", "Stone"] }],
      variants: [
        { title: "Navy / 32", sku: "MEN-TAPER-TRS-NVY-32", manage_inventory: false, options: { Size: "32", Color: "Navy" } },
        { title: "Stone / 32", sku: "MEN-TAPER-TRS-STN-32", manage_inventory: false, options: { Size: "32", Color: "Stone" } },
      ],
    },
    {
      title: "Men Ribbed Merino Cardigan",
      handle: "men-ribbed-merino-cardigan",
      description: "Ribbed merino cardigan with refined drape and premium button closure.",
      status: "published",
      categories: cat("knitwear"),
      tags: makeTags("sale"),
      thumbnail: "https://images.unsplash.com/photo-1521223890158-f9f7c3d5d504?w=1200",
      metadata: { trending_rating: 4.7, trending_reviews: 58, compare_at_price_cents: 29900 },
      options: [{ title: "Size", values: ["S", "M", "L", "XL"] }, { title: "Color", values: ["Camel", "Black"] }],
      variants: [
        { title: "Camel / M", sku: "MEN-MERINO-CARDI-CAM-M", manage_inventory: false, options: { Size: "M", Color: "Camel" } },
        { title: "Black / M", sku: "MEN-MERINO-CARDI-BLK-M", manage_inventory: false, options: { Size: "M", Color: "Black" } },
      ],
    },
    {
      title: "Kids Playground Sneaker Pack",
      handle: "kids-playground-sneaker-pack",
      description: "Comfort-first sneaker pack for active kids with grippy sole and easy closures.",
      status: "published",
      categories: [...cat("children-shoes"), ...cat("children"), ...cat("shoes")],
      tags: makeTags("bestseller"),
      thumbnail: "https://images.unsplash.com/photo-1514989940723-e8e51635b782?w=1200",
      metadata: { trending_rating: 4.7, trending_reviews: 65 },
      options: [{ title: "Size", values: ["30", "32", "34"] }, { title: "Color", values: ["White", "Blue"] }],
      variants: [
        { title: "White / 32", sku: "KIDS-SNEAKER-PACK-WHT-32", manage_inventory: false, options: { Size: "32", Color: "White" } },
        { title: "Blue / 32", sku: "KIDS-SNEAKER-PACK-BLU-32", manage_inventory: false, options: { Size: "32", Color: "Blue" } },
      ],
    },
    {
      title: "Kids Colorblock Cap Duo",
      handle: "kids-colorblock-cap-duo",
      description: "Colorblock cap duo for daily wear with adjustable straps and breathable panels.",
      status: "published",
      categories: [...cat("children-accessories"), ...cat("children"), ...cat("accessories")],
      tags: makeTags("new"),
      thumbnail: "https://images.unsplash.com/photo-1576871337632-b9aef4c17ab9?w=1200",
      metadata: { trending_rating: 4.6, trending_reviews: 37 },
      options: [{ title: "Color", values: ["Navy/Red", "Grey/Black"] }],
      variants: [
        { title: "Navy/Red", sku: "KIDS-CAP-DUO-NVYRED", manage_inventory: false, options: { Color: "Navy/Red" } },
        { title: "Grey/Black", sku: "KIDS-CAP-DUO-GRYBLK", manage_inventory: false, options: { Color: "Grey/Black" } },
      ],
    },
    {
      title: "Baby Organic Cotton Bodysuit Pack",
      handle: "baby-organic-cotton-bodysuit-pack",
      description: "Organic cotton bodysuit pack with snap closure and gentle stretch for babies.",
      status: "published",
      categories: [...cat("baby"), ...cat("children")],
      tags: makeTags("hot"),
      thumbnail: "https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=1200",
      metadata: { trending_rating: 4.8, trending_reviews: 70 },
      options: [{ title: "Size", values: ["3M", "6M", "9M"] }, { title: "Color", values: ["Cream", "Sky"] }],
      variants: [
        { title: "Cream / 6M", sku: "BABY-BODYSUIT-CRM-6M", manage_inventory: false, options: { Size: "6M", Color: "Cream" } },
        { title: "Sky / 6M", sku: "BABY-BODYSUIT-SKY-6M", manage_inventory: false, options: { Size: "6M", Color: "Sky" } },
      ],
    },
    {
      title: "Girls Pleated Party Skirt",
      handle: "girls-pleated-party-skirt",
      description: "Pleated party skirt for girls with subtle shimmer and comfortable elastic waist.",
      status: "published",
      categories: [...cat("girls"), ...cat("children")],
      tags: makeTags("trending"),
      thumbnail: "https://images.unsplash.com/photo-1519340241574-2cec6aef0c01?w=1200",
      metadata: { trending_rating: 4.7, trending_reviews: 49 },
      options: [{ title: "Size", values: ["5Y", "7Y", "9Y"] }, { title: "Color", values: ["Rose", "Champagne"] }],
      variants: [
        { title: "Rose / 7Y", sku: "GIRLS-PLEAT-SKIRT-ROS-7Y", manage_inventory: false, options: { Size: "7Y", Color: "Rose" } },
        { title: "Champagne / 7Y", sku: "GIRLS-PLEAT-SKIRT-CHP-7Y", manage_inventory: false, options: { Size: "7Y", Color: "Champagne" } },
      ],
    },
    {
      title: "Boys Zip Tech Hoodie",
      handle: "boys-zip-tech-hoodie",
      description: "Zip tech hoodie for boys with lightweight warmth and active fit.",
      status: "published",
      categories: [...cat("boys"), ...cat("children")],
      tags: makeTags("trending"),
      thumbnail: "https://images.unsplash.com/photo-1503944583220-79d8926ad5e2?w=1200",
      metadata: { trending_rating: 4.6, trending_reviews: 42 },
      options: [{ title: "Size", values: ["7Y", "9Y", "11Y"] }, { title: "Color", values: ["Black", "Blue"] }],
      variants: [
        { title: "Black / 9Y", sku: "BOYS-ZIP-HOODIE-BLK-9Y", manage_inventory: false, options: { Size: "9Y", Color: "Black" } },
        { title: "Blue / 9Y", sku: "BOYS-ZIP-HOODIE-BLU-9Y", manage_inventory: false, options: { Size: "9Y", Color: "Blue" } },
      ],
    },
    {
      title: "Children Festival Value Bundle",
      handle: "children-festival-value-bundle",
      description: "Festival value bundle for children with seasonal pieces at limited-time pricing.",
      status: "published",
      categories: [...cat("sale"), ...cat("children")],
      tags: makeTags("sale", "bestseller"),
      thumbnail: "https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=1200",
      metadata: { trending_rating: 4.8, trending_reviews: 91, compare_at_price_cents: 23900 },
      options: [{ title: "Size", values: ["6Y", "8Y", "10Y"] }, { title: "Color", values: ["Multi", "Navy"] }],
      variants: [
        { title: "Multi / 8Y", sku: "SALE-KIDS-FEST-MULTI-8Y", manage_inventory: false, options: { Size: "8Y", Color: "Multi" } },
        { title: "Navy / 8Y", sku: "SALE-KIDS-FEST-NVY-8Y", manage_inventory: false, options: { Size: "8Y", Color: "Navy" } },
      ],
    },
  ];
  const toEditorialUnsplashUrl = (value: string | undefined) => {
    const input = String(value || "").trim();
    if (!input || !input.includes("images.unsplash.com")) return input;
    const params = ["w=1200", "auto=format", "fit=crop", "q=80"];
    if (!input.includes("?")) return `${input}?${params.join("&")}`;
    const normalized = input
      .split("?")
      .map((part) => part.trim())
      .filter(Boolean)
      .join("?");
    const hasParam = (key: string) => new RegExp(`(?:\\?|&)${key}=`).test(normalized);
    const extras = params.filter((param) => !hasParam(param.split("=")[0]));
    return extras.length > 0 ? `${normalized}&${extras.join("&")}` : normalized;
  };

  const withCatalogQualityDefaults = <
    T extends {
      title?: unknown;
      thumbnail?: unknown;
      metadata?: Record<string, unknown>;
    },
  >(
    product: T,
    index: number
  ): T & {
    title: string;
    thumbnail: string;
    metadata: Record<string, unknown>;
  } => {
    const metadata = (product.metadata || {}) as Record<string, unknown>;
    return {
      ...product,
      title: String(product.title || "").replace(/\s+/g, " ").trim(),
      thumbnail: toEditorialUnsplashUrl(String(product.thumbnail || "")),
      metadata: {
        ...metadata,
        trending_rating:
          Number(metadata.trending_rating || 0) > 0
            ? Number(metadata.trending_rating)
            : Number((4.6 + ((index % 4) * 0.1)).toFixed(1)),
        trending_reviews:
          Number(metadata.trending_reviews || 0) > 0
            ? Number(metadata.trending_reviews)
            : 48 + index * 7,
      },
    };
  };

  const supplementalProducts = [
    ...baselineSupplementalProducts,
    ...additionalTaggedProducts,
    ...categoryCoverageProducts,
    ...phaseTwoExpansionProducts,
    ...phaseThreeExpansionProducts,
  ].map((product, index) => withCatalogQualityDefaults(product, index));
  console.log(
    `📦 Supplemental catalog candidates: ${supplementalProducts.length} (existing handles: ${existingProductHandles.size})`
  );
  const missingSupplementalProducts = supplementalProducts.filter(
    (product) => !existingProductHandles.has(product.handle)
  );
  if (missingSupplementalProducts.length > 0) {
    console.log(
      "🆕 Missing supplemental handles:",
      missingSupplementalProducts.map((product) => product.handle).join(", ")
    );
  }
  if (missingSupplementalProducts.length > 0) {
    await (productService as any).createProducts(missingSupplementalProducts);
    console.log(`✨ Added ${missingSupplementalProducts.length} supplemental catalog products.`);
  }

  const womenCatalogImageByHandle: Record<string, string> = {
    "silk-evening-gown":
      "https://images.unsplash.com/photo-1566479179817-c0e6f0adf7aa?w=1200&auto=format&fit=crop&q=80",
    "floral-midi-wrap-dress":
      "https://images.unsplash.com/photo-1623609163859-ca93c959b98a?w=1200&auto=format&fit=crop&q=80",
    "velvet-cocktail-dress":
      "https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=1200&auto=format&fit=crop&q=80",
    "linen-maxi-sundress":
      "https://images.unsplash.com/photo-1495385794356-15371f348c31?w=1200&auto=format&fit=crop&q=80",
    "satin-slip-dress":
      "https://images.unsplash.com/photo-1617137968427-85924c800a22?w=1200&auto=format&fit=crop&q=80",
    "embroidered-tulle-ball-gown":
      "https://images.unsplash.com/photo-1591369822096-ffd140ec948f?w=1200&auto=format&fit=crop&q=80",
    "cashmere-wrap-blouse":
      "https://images.unsplash.com/photo-1585487000143-3f835fd0ca70?w=1200&auto=format&fit=crop&q=80",
    "silk-camisole-top":
      "https://images.unsplash.com/photo-1571513722275-4b41940f54b8?w=1200&auto=format&fit=crop&q=80",
    "oversized-merino-knit-sweater":
      "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=1200&auto=format&fit=crop&q=80",
    "structured-blazer-top":
      "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=1200&auto=format&fit=crop&q=80",
    "high-waist-tailored-trousers":
      "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=1200&auto=format&fit=crop&q=80",
    "pleated-satin-midi-skirt":
      "https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?w=1200&auto=format&fit=crop&q=80",
    "wide-leg-linen-pants":
      "https://images.unsplash.com/photo-1552902865-b72c031ac5ea?w=1200&auto=format&fit=crop&q=80",
    "double-breasted-wool-coat":
      "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?w=1200&auto=format&fit=crop&q=80",
    "leather-biker-jacket":
      "https://images.unsplash.com/photo-1551232864-3f0890e580d9?w=1200&auto=format&fit=crop&q=80",
    "cashmere-cape":
      "https://images.unsplash.com/photo-1525457136159-8878648a7ad0?w=1200&auto=format&fit=crop&q=80",
  };
  const productsForWomenSync = await productService.listProducts(
    {},
    { take: 500 } as Record<string, unknown>
  );
  const womenThumbnailUpdates = productsForWomenSync
    .filter(
      (product) =>
        womenCatalogImageByHandle[product.handle] &&
        String(product.thumbnail || "").trim() !== womenCatalogImageByHandle[product.handle]
    )
    .map((product) => ({
      id: product.id,
      thumbnail: womenCatalogImageByHandle[product.handle],
    }));
  if (womenThumbnailUpdates.length > 0) {
    try {
      await (productService as any).updateProducts(womenThumbnailUpdates);
    } catch {
      for (const update of womenThumbnailUpdates) {
        try {
          await (productService as any).updateProducts([update]);
        } catch {
          // continue best-effort backfill
        }
      }
    }
    console.log(
      `🖼️ Synced women catalog thumbnails for ${womenThumbnailUpdates.length} products.`
    );
  }

  // ═══════════════════ PRICING ═══════════════════
  // Map SKU prefixes to base prices (in cents)
  const priceMap: Record<string, number> = {
    "SILK-GOWN": 89900,
    "FLORAL-WRAP": 34900,
    "VELVET-COCK": 44900,
    "LINEN-MAXI": 27900,
    "SATIN-SLIP": 39900,
    "TULLE-BALL": 129900,
    "CASH-BLOUSE": 24900,
    "SILK-CAMI": 17900,
    "MERINO-KNIT": 21900,
    "BLAZER-TOP": 32900,
    "TROUSERS": 22900,
    "PLEATED-SKIRT": 19900,
    "WIDELEG-LINEN": 18900,
    "WOOL-COAT": 79900,
    "BIKER-JKT": 99900,
    "CASH-CAPE": 64900,
    "STILETTO": 54900,
    "FLATS": 29900,
    "QUILTED-BAG": 74900,
    "STRUCT-TOTE": 59900,
    "GOLD-NECK": 12900,
    "PEARL-EAR": 8900,
    "TENNIS-BRACE": 14900,
    "SILK-SCARF": 16900,
    "BELT": 9900,
    "MEN-SUIT": 69900,
    "MEN-SHIRT": 15900,
    "MEN-LOAFER": 28900,
    "KIDS-BOYS-BLAZER": 25900,
    "KIDS-GIRL-DRESS": 22900,
    "KIDS-SNEAKER": 13900,
    "CRYSTAL-MINI": 52900,
    "SATIN-CORSET": 26900,
    "PALAZZO": 23900,
    "BOUCLE": 48900,
    "METALLIC-CLUTCH": 27900,
    "PEARL-CHAIN": 15900,
    "MEN-TUX": 71900,
    "KIDS-GLITTER-HEEL": 16900,
    "WOMEN-COAT": 67900,
    "MEN-EVENING-SUIT": 82900,
    "CHILD-WEEKEND-SET": 22900,
    "BOYS-JOGGER": 19900,
    "GIRLS-RUFFLE-DRESS": 23900,
    "BABY-ROMPER": 14900,
    "KIDS-BACKPACK": 12900,
    "KIDS-RUNFLEX": 15900,
    "MEN-CHINO": 19900,
    "MEN-KNIT-HZIP": 18900,
    "MEN-AVIATOR": 9900,
    "MEN-DUFFLE": 34900,
    "MEN-DERBY": 29900,
    "WOMEN-PUMP": 38900,
    "WOMEN-TOTE-CRES": 42900,
    "WOMEN-CHARM-NECK": 12900,
    "WOMEN-SCARF": 14900,
    "SALE-EDIT": 29900,
    "WOMEN-SILK-BLS": 23900,
    "WOMEN-PLSKIRT": 24900,
    "MEN-OVERSHIRT": 22900,
    "MEN-FORMAL-TRS": 23900,
    "CHILD-HOODIE": 18900,
    "SALE-KIDS-GIFT": 19900,
    "WOMEN-CATEYE": 12900,
    "WOMEN-SHOULDER-BAG": 39900,
    "WOMEN-PEARL-HOOP": 9900,
    "WOMEN-PLATFORM": 35900,
    "MEN-WALLET": 8900,
    "MEN-MESSENGER-BAG": 32900,
    "MEN-HIGHTOP": 25900,
    "MEN-LINEN-SHIRT": 18900,
    "MEN-CASH-CRW": 21900,
    "MEN-DBJKT": 69900,
    "BOYS-CARGO": 16900,
    "GIRLS-CARDI": 15900,
    "BABY-SLEEPSET": 11900,
    "KIDS-CAPSET": 7900,
    "KIDS-SLIPON": 12900,
    "WOMEN-HEADBAND": 8900,
    "WOMEN-CROSSBODY": 36900,
    "WOMEN-CRYSTAL-HEEL": 42900,
    "WOMEN-CUFF-BRACE": 10900,
    "MEN-BELT-SET": 9900,
    "MEN-WEEKENDER": 34900,
    "MEN-RETRO-SNK": 26900,
    "MEN-SUIT-VEST": 28900,
    "MEN-TAPER-TRS": 21900,
    "MEN-MERINO-CARDI": 23900,
    "KIDS-SNEAKER-PACK": 14900,
    "KIDS-CAP-DUO": 6900,
    "BABY-BODYSUIT": 9900,
    "GIRLS-PLEAT-SKIRT": 14900,
    "BOYS-ZIP-HOODIE": 16900,
    "SALE-KIDS-FEST": 17900,
  };

  const allProducts = await productService.listProducts(
    {},
    { relations: ["variants"], take: 500 }
  );

  // ═══════════════════ INVENTORY TRACKING ═══════════════════
  const seedQtyForSku = (sku: string, fallbackId: string) => {
    const key = (sku || fallbackId || "").toUpperCase();
    if (!key) return 8;
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) % 9973;
    if (hash % 13 === 0) return 2;
    if (hash % 11 === 0) return 3;
    if (hash % 7 === 0) return 5;
    return 12;
  };

  let inventoryUpdated = 0;
  for (const product of allProducts) {
    const variants = product.variants || [];
    if (!variants.length) continue;
    const payload = variants.map((variant) => ({
      id: variant.id,
      manage_inventory: true,
      allow_backorder: false,
      inventory_quantity: seedQtyForSku(String(variant.sku || ""), String(variant.id || "")),
    }));
    try {
      await (productService as any).updateProducts([{ id: product.id, variants: payload }]);
      inventoryUpdated += payload.length;
    } catch {
      // Some Medusa runtimes ignore inventory_quantity at product-update level.
    }
  }
  console.log(`📦 Inventory managed for ~${inventoryUpdated} variants (service update path).`);

  if (inventoryUpdated === 0) {
    try {
      const pgMod = await (0, eval)("import('pg')");
      const Client = (pgMod as any).Client;
      const dbUrl = String(process.env.DATABASE_URL || "").trim();
      if (Client && dbUrl) {
        const client = new Client({ connectionString: dbUrl });
        await client.connect();
        await client.query(
          "INSERT INTO stock_location (id, name, created_at, updated_at) VALUES ('sl_main_warehouse', 'Main Warehouse', NOW(), NOW()) ON CONFLICT (id) DO NOTHING"
        );
        await client.query(
          "INSERT INTO sales_channel_stock_location (sales_channel_id, stock_location_id, id, created_at, updated_at) SELECT sc.id, 'sl_main_warehouse', 'scsl_' || sc.id || '_sl_main_warehouse', NOW(), NOW() FROM sales_channel sc WHERE NOT EXISTS (SELECT 1 FROM sales_channel_stock_location s WHERE s.sales_channel_id = sc.id AND s.stock_location_id = 'sl_main_warehouse' AND s.deleted_at IS NULL)"
        );
        await client.query(
          "UPDATE product_variant SET manage_inventory = true, allow_backorder = false, updated_at = NOW() WHERE deleted_at IS NULL"
        );
        await client.query(
          "INSERT INTO inventory_item (id, sku, title, requires_shipping, created_at, updated_at) SELECT 'ii_' || pv.id, NULLIF(pv.sku, ''), LEFT(COALESCE(NULLIF(pv.title, ''), pv.id), 255), true, NOW(), NOW() FROM product_variant pv WHERE pv.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM inventory_item ii WHERE ii.id = 'ii_' || pv.id)"
        );
        await client.query(
          "INSERT INTO product_variant_inventory_item (variant_id, inventory_item_id, id, required_quantity, created_at, updated_at) SELECT pv.id, 'ii_' || pv.id, 'pvi_' || pv.id, 1, NOW(), NOW() FROM product_variant pv WHERE pv.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM product_variant_inventory_item pvi WHERE pvi.variant_id = pv.id AND pvi.inventory_item_id = 'ii_' || pv.id AND pvi.deleted_at IS NULL)"
        );
        await client.query(
          "INSERT INTO inventory_level (id, inventory_item_id, location_id, stocked_quantity, reserved_quantity, incoming_quantity, raw_stocked_quantity, raw_reserved_quantity, raw_incoming_quantity, created_at, updated_at) SELECT 'il_' || pv.id, 'ii_' || pv.id, 'sl_main_warehouse', CASE WHEN MOD(ABS((('x' || SUBSTRING(md5(pv.id), 1, 8))::bit(32)::int)), 13) = 0 THEN 2 WHEN MOD(ABS((('x' || SUBSTRING(md5(pv.id), 1, 8))::bit(32)::int)), 11) = 0 THEN 3 WHEN MOD(ABS((('x' || SUBSTRING(md5(pv.id), 1, 8))::bit(32)::int)), 7) = 0 THEN 5 ELSE 12 END, 0, 0, jsonb_build_object('value', (CASE WHEN MOD(ABS((('x' || SUBSTRING(md5(pv.id), 1, 8))::bit(32)::int)), 13) = 0 THEN 2 WHEN MOD(ABS((('x' || SUBSTRING(md5(pv.id), 1, 8))::bit(32)::int)), 11) = 0 THEN 3 WHEN MOD(ABS((('x' || SUBSTRING(md5(pv.id), 1, 8))::bit(32)::int)), 7) = 0 THEN 5 ELSE 12 END)::text, 'precision', 20), jsonb_build_object('value', '0', 'precision', 20), jsonb_build_object('value', '0', 'precision', 20), NOW(), NOW() FROM product_variant pv WHERE pv.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM inventory_level il WHERE il.inventory_item_id = 'ii_' || pv.id AND il.location_id = 'sl_main_warehouse' AND il.deleted_at IS NULL)"
        );
        await client.query(
          "UPDATE inventory_level SET raw_stocked_quantity = jsonb_build_object('value', stocked_quantity::text, 'precision', 20), raw_reserved_quantity = jsonb_build_object('value', reserved_quantity::text, 'precision', 20), raw_incoming_quantity = jsonb_build_object('value', incoming_quantity::text, 'precision', 20) WHERE deleted_at IS NULL"
        );
        await client.end();
        console.log("📦 Inventory SQL backfill completed from seed script.");
      } else {
        console.log("⚠️ Inventory SQL backfill skipped (missing DATABASE_URL or pg client).");
      }
    } catch {
      console.log("⚠️ Inventory SQL backfill skipped (runtime does not allow pg dynamic import).");
    }
  }

  console.log(`💰 Setting prices for ${allProducts.length} products...`);

  let pricesCreated = 0;
  const inferTieredFallbackPrice = (sku: string) => {
    const upper = sku.toUpperCase();
    if (/(BAG|TOTE|DUFFLE|MESSENGER|CROSSBODY)/.test(upper)) return 34900;
    if (/(SHOE|SNEAKER|LOAFER|HEEL|PLATFORM|HIGHTOP|SLIPON|DERBY|PUMP|STILETTO)/.test(upper)) return 29900;
    if (/(JEWEL|NECK|EAR|BRACE|CUFF|SCARF|BELT|WALLET|CATEYE|HEADBAND|CAP)/.test(upper)) return 9900;
    if (/(COAT|SUIT|BLAZER|JKT|JACKET|GOWN)/.test(upper)) return 69900;
    if (/(SHIRT|BLOUSE|TOP|KNIT|CARDI|HOODIE|VEST)/.test(upper)) return 22900;
    if (/(TROUSER|SKIRT|PANT|CHINO|PALAZZO|CARGO)/.test(upper)) return 21900;
    if (/(BABY|KIDS|BOYS|GIRLS|CHILD)/.test(upper)) return 14900;
    return 19900;
  };
  for (const product of allProducts) {
    for (const variant of product.variants || []) {
      const sku = variant.sku || "";
      const prefix = Object.keys(priceMap).find((p) => sku.startsWith(p));
      const basePrice = prefix ? priceMap[prefix] : inferTieredFallbackPrice(sku);

      try {
        const priceSet = await pricingService.createPriceSets({
          prices: [
            { amount: basePrice, currency_code: "usd" },
            { amount: Math.round(basePrice * 0.78), currency_code: "gbp" },
            { amount: Math.round(basePrice * 0.92), currency_code: "eur" },
            { amount: Math.round(basePrice * 18.5), currency_code: "zar" },
          ],
        });

        await remoteLink.create({
          [Modules.PRODUCT]: { variant_id: variant.id },
          [Modules.PRICING]: { price_set_id: priceSet.id },
        });
        pricesCreated++;
      } catch {
        // Already has a price set linked
      }
    }
  }
  console.log(`💰 Created prices for ${pricesCreated} variants.`);

  // Link products to default sales channel
  const [defaultChannel] = await salesChannelService.listSalesChannels({
    name: "Default Sales Channel",
  });
  if (defaultChannel) {
    for (const product of allProducts) {
      try {
        await remoteLink.create({
          [Modules.PRODUCT]: { product_id: product.id },
          [Modules.SALES_CHANNEL]: { sales_channel_id: defaultChannel.id },
        });
      } catch {
        // Already linked
      }
    }
  }

  console.log(
    "🌱 Seed completed: store, regions, audience categories, and test products for women/men/children."
  );
}
