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
  const supplementalProducts = [
    {
      title: "Classic Tailored Wool Suit",
      handle: "classic-tailored-wool-suit",
      description:
        "A sharp two-piece wool suit designed for modern formalwear with a structured fit and breathable lining.",
      status: "published",
      categories: cat("suits"),
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
  const missingSupplementalProducts = supplementalProducts.filter(
    (product) => !existingProductHandles.has(product.handle)
  );
  if (missingSupplementalProducts.length > 0) {
    await (productService as any).createProducts(missingSupplementalProducts);
    console.log(`✨ Added ${missingSupplementalProducts.length} supplemental men/children products.`);
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
  };

  const allProducts = await productService.listProducts(
    {},
    { relations: ["variants"], take: 50 }
  );

  console.log(`💰 Setting prices for ${allProducts.length} products...`);

  let pricesCreated = 0;
  for (const product of allProducts) {
    for (const variant of product.variants || []) {
      const sku = variant.sku || "";
      const prefix = Object.keys(priceMap).find((p) => sku.startsWith(p));
      const basePrice = prefix ? priceMap[prefix] : 19900;

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
