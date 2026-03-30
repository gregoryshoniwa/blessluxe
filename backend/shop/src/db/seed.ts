import { v4 as uuid } from "uuid";
import bcrypt from "bcryptjs";
import pool, { execute, queryOne, query } from "./pool.ts";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const id = (prefix: string) => `${prefix}_${uuid().replace(/-/g, "")}`;

async function seed() {
  console.log("Running schema migration...");
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  await pool.query(schema);

  console.log("Seeding shop backend...");

  // ─── Default admin user ─────────────────────────────────
  const adminEmail = "admin@blessluxe.com";
  const existingAdmin = await queryOne(`SELECT id FROM shop_user WHERE email = $1`, [adminEmail]);
  if (!existingAdmin) {
    const hashed = await bcrypt.hash("admin123", 12);
    await execute(
      `INSERT INTO shop_user (id, email, password, first_name, last_name, role) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id("user"), adminEmail, hashed, "Admin", "BLESSLUXE", "admin"]
    );
    console.log(`  Created admin user: ${adminEmail} / admin123`);
  } else {
    console.log(`  Admin user ${adminEmail} already exists`);
  }

  // ─── Regions ───────────────────────────────────────────
  const regions = [
    { id: id("reg"), name: "United States", currency_code: "usd", countries: ["us"] },
    { id: id("reg"), name: "United Kingdom", currency_code: "gbp", countries: ["gb"] },
    { id: id("reg"), name: "Europe", currency_code: "eur", countries: ["de", "fr", "it", "es", "nl"] },
    { id: id("reg"), name: "South Africa", currency_code: "zar", countries: ["za"] },
  ];
  for (const r of regions) {
    await execute(
      `INSERT INTO shop_region (id, name, currency_code, countries) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.name, r.currency_code, r.countries]
    );
  }

  // ─── Categories ────────────────────────────────────────
  const categoryDefs = [
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
  ];
  const catIdByHandle: Record<string, string> = {};
  for (const c of categoryDefs) {
    const existing = await queryOne(`SELECT id FROM shop_product_category WHERE handle = $1`, [c.handle]);
    if (existing) {
      catIdByHandle[c.handle] = String(existing.id);
    } else {
      const cid = id("cat");
      await execute(
        `INSERT INTO shop_product_category (id, name, handle) VALUES ($1, $2, $3)`,
        [cid, c.name, c.handle]
      );
      catIdByHandle[c.handle] = cid;
    }
  }

  // ─── Tags ──────────────────────────────────────────────
  const tagValues = ["hot", "sale", "trending", "new", "bestseller"];
  const tagIdByValue: Record<string, string> = {};
  for (const v of tagValues) {
    const existing = await queryOne(`SELECT id FROM shop_product_tag WHERE value = $1`, [v]);
    if (existing) {
      tagIdByValue[v] = String(existing.id);
    } else {
      const tid = id("tag");
      await execute(`INSERT INTO shop_product_tag (id, value) VALUES ($1, $2)`, [tid, v]);
      tagIdByValue[v] = tid;
    }
  }

  // ─── Products ──────────────────────────────────────────
  type ProductDef = {
    title: string;
    handle: string;
    description: string;
    categories: string[];
    tags?: string[];
    options: Array<{ title: string; values: string[] }>;
    variants: Array<{ title: string; sku: string; options: Record<string, string> }>;
  };

  const sizes = ["XS", "S", "M", "L", "XL"];

  const products: ProductDef[] = [
    {
      title: "Silk Evening Gown",
      handle: "silk-evening-gown",
      description: "An exquisite floor-length silk gown perfect for galas and black-tie events. Features a delicate draped neckline and a fitted bodice that flows into a graceful A-line skirt.",
      categories: ["dresses"],
      tags: ["hot", "bestseller"],
      options: [{ title: "Size", values: sizes }, { title: "Color", values: ["Champagne Gold", "Midnight Black"] }],
      variants: [
        { title: "Champagne Gold / XS", sku: "SILK-GOWN-GOLD-XS", options: { Size: "XS", Color: "Champagne Gold" } },
        { title: "Champagne Gold / S", sku: "SILK-GOWN-GOLD-S", options: { Size: "S", Color: "Champagne Gold" } },
        { title: "Champagne Gold / M", sku: "SILK-GOWN-GOLD-M", options: { Size: "M", Color: "Champagne Gold" } },
        { title: "Champagne Gold / L", sku: "SILK-GOWN-GOLD-L", options: { Size: "L", Color: "Champagne Gold" } },
        { title: "Midnight Black / S", sku: "SILK-GOWN-BLACK-S", options: { Size: "S", Color: "Midnight Black" } },
        { title: "Midnight Black / M", sku: "SILK-GOWN-BLACK-M", options: { Size: "M", Color: "Midnight Black" } },
        { title: "Midnight Black / L", sku: "SILK-GOWN-BLACK-L", options: { Size: "L", Color: "Midnight Black" } },
      ],
    },
    {
      title: "Floral Midi Wrap Dress",
      handle: "floral-midi-wrap-dress",
      description: "A romantic midi wrap dress in a delicate floral print. The flattering wrap silhouette cinches at the waist and flows into an asymmetric hem.",
      categories: ["dresses"],
      tags: ["trending", "new"],
      options: [{ title: "Size", values: sizes }, { title: "Color", values: ["Rose Garden", "Lavender Fields", "Ocean Blue"] }],
      variants: [
        { title: "Rose Garden / S", sku: "FLORAL-WRAP-ROSE-S", options: { Size: "S", Color: "Rose Garden" } },
        { title: "Rose Garden / M", sku: "FLORAL-WRAP-ROSE-M", options: { Size: "M", Color: "Rose Garden" } },
        { title: "Rose Garden / L", sku: "FLORAL-WRAP-ROSE-L", options: { Size: "L", Color: "Rose Garden" } },
        { title: "Lavender Fields / S", sku: "FLORAL-WRAP-LAV-S", options: { Size: "S", Color: "Lavender Fields" } },
        { title: "Lavender Fields / M", sku: "FLORAL-WRAP-LAV-M", options: { Size: "M", Color: "Lavender Fields" } },
        { title: "Ocean Blue / M", sku: "FLORAL-WRAP-BLUE-M", options: { Size: "M", Color: "Ocean Blue" } },
        { title: "Ocean Blue / L", sku: "FLORAL-WRAP-BLUE-L", options: { Size: "L", Color: "Ocean Blue" } },
      ],
    },
    {
      title: "Velvet Cocktail Dress",
      handle: "velvet-cocktail-dress",
      description: "A show-stopping velvet cocktail dress with a sculpted bodice and flared skirt. The rich fabric catches the light beautifully.",
      categories: ["dresses"],
      options: [{ title: "Size", values: sizes }, { title: "Color", values: ["Burgundy", "Emerald Green", "Navy"] }],
      variants: [
        { title: "Burgundy / XS", sku: "VELVET-COCK-BURG-XS", options: { Size: "XS", Color: "Burgundy" } },
        { title: "Burgundy / S", sku: "VELVET-COCK-BURG-S", options: { Size: "S", Color: "Burgundy" } },
        { title: "Burgundy / M", sku: "VELVET-COCK-BURG-M", options: { Size: "M", Color: "Burgundy" } },
        { title: "Emerald Green / S", sku: "VELVET-COCK-EMER-S", options: { Size: "S", Color: "Emerald Green" } },
        { title: "Emerald Green / M", sku: "VELVET-COCK-EMER-M", options: { Size: "M", Color: "Emerald Green" } },
        { title: "Navy / M", sku: "VELVET-COCK-NAVY-M", options: { Size: "M", Color: "Navy" } },
        { title: "Navy / L", sku: "VELVET-COCK-NAVY-L", options: { Size: "L", Color: "Navy" } },
      ],
    },
    {
      title: "Linen Maxi Sundress",
      handle: "linen-maxi-sundress",
      description: "Effortlessly elegant linen maxi dress with adjustable spaghetti straps and a tiered skirt. Breathable and lightweight.",
      categories: ["dresses"],
      tags: ["new"],
      options: [{ title: "Size", values: sizes }, { title: "Color", values: ["White", "Terracotta", "Sage"] }],
      variants: [
        { title: "White / S", sku: "LINEN-MAXI-WHT-S", options: { Size: "S", Color: "White" } },
        { title: "White / M", sku: "LINEN-MAXI-WHT-M", options: { Size: "M", Color: "White" } },
        { title: "Terracotta / S", sku: "LINEN-MAXI-TER-S", options: { Size: "S", Color: "Terracotta" } },
        { title: "Terracotta / M", sku: "LINEN-MAXI-TER-M", options: { Size: "M", Color: "Terracotta" } },
        { title: "Sage / M", sku: "LINEN-MAXI-SAGE-M", options: { Size: "M", Color: "Sage" } },
        { title: "Sage / L", sku: "LINEN-MAXI-SAGE-L", options: { Size: "L", Color: "Sage" } },
      ],
    },
    {
      title: "Cashmere Wrap Blouse",
      handle: "cashmere-wrap-blouse",
      description: "Luxuriously soft cashmere blouse with an elegant wrap design. Pairs beautifully with tailored trousers or a pencil skirt.",
      categories: ["tops"],
      tags: ["bestseller"],
      options: [{ title: "Size", values: ["XS", "S", "M", "L"] }, { title: "Color", values: ["Cream", "Blush Pink", "Slate Grey"] }],
      variants: [
        { title: "Cream / XS", sku: "CASH-BLOUSE-CREAM-XS", options: { Size: "XS", Color: "Cream" } },
        { title: "Cream / S", sku: "CASH-BLOUSE-CREAM-S", options: { Size: "S", Color: "Cream" } },
        { title: "Cream / M", sku: "CASH-BLOUSE-CREAM-M", options: { Size: "M", Color: "Cream" } },
        { title: "Blush Pink / S", sku: "CASH-BLOUSE-BLUSH-S", options: { Size: "S", Color: "Blush Pink" } },
        { title: "Blush Pink / M", sku: "CASH-BLOUSE-BLUSH-M", options: { Size: "M", Color: "Blush Pink" } },
        { title: "Slate Grey / M", sku: "CASH-BLOUSE-GREY-M", options: { Size: "M", Color: "Slate Grey" } },
        { title: "Slate Grey / L", sku: "CASH-BLOUSE-GREY-L", options: { Size: "L", Color: "Slate Grey" } },
      ],
    },
    {
      title: "High-Waist Tailored Trousers",
      handle: "high-waist-tailored-trousers",
      description: "Impeccably tailored high-waist trousers with a straight leg and pressed crease. Crafted from Italian wool blend.",
      categories: ["bottoms"],
      options: [{ title: "Size", values: sizes }, { title: "Color", values: ["Black", "Ivory", "Camel"] }],
      variants: [
        { title: "Black / XS", sku: "TROUSERS-BLK-XS", options: { Size: "XS", Color: "Black" } },
        { title: "Black / S", sku: "TROUSERS-BLK-S", options: { Size: "S", Color: "Black" } },
        { title: "Black / M", sku: "TROUSERS-BLK-M", options: { Size: "M", Color: "Black" } },
        { title: "Black / L", sku: "TROUSERS-BLK-L", options: { Size: "L", Color: "Black" } },
        { title: "Ivory / S", sku: "TROUSERS-IVORY-S", options: { Size: "S", Color: "Ivory" } },
        { title: "Ivory / M", sku: "TROUSERS-IVORY-M", options: { Size: "M", Color: "Ivory" } },
        { title: "Camel / M", sku: "TROUSERS-CAMEL-M", options: { Size: "M", Color: "Camel" } },
        { title: "Camel / L", sku: "TROUSERS-CAMEL-L", options: { Size: "L", Color: "Camel" } },
      ],
    },
    {
      title: "Double-Breasted Wool Coat",
      handle: "double-breasted-wool-coat",
      description: "A timeless double-breasted coat in premium Italian wool. Structured shoulders, notch lapels, and belted waist.",
      categories: ["outerwear"],
      tags: ["hot"],
      options: [{ title: "Size", values: sizes }, { title: "Color", values: ["Camel", "Black", "Charcoal"] }],
      variants: [
        { title: "Camel / XS", sku: "WOOL-COAT-CAMEL-XS", options: { Size: "XS", Color: "Camel" } },
        { title: "Camel / S", sku: "WOOL-COAT-CAMEL-S", options: { Size: "S", Color: "Camel" } },
        { title: "Camel / M", sku: "WOOL-COAT-CAMEL-M", options: { Size: "M", Color: "Camel" } },
        { title: "Black / S", sku: "WOOL-COAT-BLK-S", options: { Size: "S", Color: "Black" } },
        { title: "Black / M", sku: "WOOL-COAT-BLK-M", options: { Size: "M", Color: "Black" } },
        { title: "Charcoal / M", sku: "WOOL-COAT-CHAR-M", options: { Size: "M", Color: "Charcoal" } },
        { title: "Charcoal / L", sku: "WOOL-COAT-CHAR-L", options: { Size: "L", Color: "Charcoal" } },
      ],
    },
    {
      title: "Strappy Stiletto Heels",
      handle: "strappy-stiletto-heels",
      description: "Elegant strappy stiletto heels with a 100mm heel. Crafted from Italian calfskin with a cushioned insole.",
      categories: ["shoes"],
      options: [{ title: "Size", values: ["36", "37", "38", "39", "40"] }, { title: "Color", values: ["Black", "Gold", "Nude"] }],
      variants: [
        { title: "Black / 37", sku: "STILETTO-BLK-37", options: { Size: "37", Color: "Black" } },
        { title: "Black / 38", sku: "STILETTO-BLK-38", options: { Size: "38", Color: "Black" } },
        { title: "Black / 39", sku: "STILETTO-BLK-39", options: { Size: "39", Color: "Black" } },
        { title: "Gold / 37", sku: "STILETTO-GOLD-37", options: { Size: "37", Color: "Gold" } },
        { title: "Gold / 38", sku: "STILETTO-GOLD-38", options: { Size: "38", Color: "Gold" } },
        { title: "Nude / 38", sku: "STILETTO-NUDE-38", options: { Size: "38", Color: "Nude" } },
      ],
    },
    {
      title: "Quilted Leather Crossbody Bag",
      handle: "quilted-leather-crossbody-bag",
      description: "A luxurious quilted crossbody bag in premium lambskin. Gold-tone chain strap converts to shoulder carry.",
      categories: ["bags", "accessories"],
      tags: ["trending"],
      options: [{ title: "Color", values: ["Black", "Cream", "Burgundy"] }],
      variants: [
        { title: "Black", sku: "QUILTED-BAG-BLK", options: { Color: "Black" } },
        { title: "Cream", sku: "QUILTED-BAG-CRM", options: { Color: "Cream" } },
        { title: "Burgundy", sku: "QUILTED-BAG-BURG", options: { Color: "Burgundy" } },
      ],
    },
    {
      title: "Gold Layered Necklace",
      handle: "gold-layered-necklace",
      description: "A delicate layered necklace in 18k gold vermeil. Three chains of varying lengths create an elegant cascading effect.",
      categories: ["jewelry", "accessories"],
      tags: ["new", "bestseller"],
      options: [{ title: "Length", values: ["16in", "18in"] }],
      variants: [
        { title: "16in", sku: "GOLD-NECK-16", options: { Length: "16in" } },
        { title: "18in", sku: "GOLD-NECK-18", options: { Length: "18in" } },
      ],
    },
  ];

  const priceMap: Record<string, number> = {
    "SILK-GOWN": 89900, "FLORAL-WRAP": 34900, "VELVET-COCK": 44900, "LINEN-MAXI": 27900,
    "CASH-BLOUSE": 24900, "TROUSERS": 22900, "WOOL-COAT": 79900,
    "STILETTO": 54900, "QUILTED-BAG": 74900, "GOLD-NECK": 12900,
  };

  const inferPrice = (sku: string) => {
    const upper = sku.toUpperCase();
    for (const [prefix, price] of Object.entries(priceMap)) {
      if (upper.startsWith(prefix)) return price;
    }
    if (/(BAG|TOTE)/.test(upper)) return 34900;
    if (/(SHOE|HEEL|STILETTO)/.test(upper)) return 29900;
    if (/(NECK|EAR|BRACE|JEWEL)/.test(upper)) return 9900;
    if (/(COAT|BLAZER|JKT)/.test(upper)) return 69900;
    return 19900;
  };

  const seedQty = (sku: string) => {
    let hash = 0;
    for (let i = 0; i < sku.length; i++) hash = (hash * 31 + sku.charCodeAt(i)) % 9973;
    if (hash % 13 === 0) return 2;
    if (hash % 11 === 0) return 3;
    if (hash % 7 === 0) return 5;
    return 12;
  };

  let productsCreated = 0;
  let variantsCreated = 0;

  for (const p of products) {
    const existing = await queryOne(`SELECT id FROM shop_product WHERE handle = $1`, [p.handle]);
    if (existing) {
      console.log(`  ⏭️  ${p.handle} already exists, skipping`);
      continue;
    }

    const productId = id("prod");
    await execute(
      `INSERT INTO shop_product (id, title, handle, description, status) VALUES ($1, $2, $3, $4, 'published')`,
      [productId, p.title, p.handle, p.description]
    );
    productsCreated++;

    for (const catHandle of p.categories) {
      const catId = catIdByHandle[catHandle];
      if (catId) {
        await execute(
          `INSERT INTO shop_product_category_map (product_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [productId, catId]
        );
      }
    }

    for (const tagValue of p.tags || []) {
      const tagId = tagIdByValue[tagValue];
      if (tagId) {
        await execute(
          `INSERT INTO shop_product_tag_map (product_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [productId, tagId]
        );
      }
    }

    const optionIdByTitle: Record<string, string> = {};
    const optValIdByKey: Record<string, string> = {};

    for (let i = 0; i < p.options.length; i++) {
      const opt = p.options[i];
      const optId = id("opt");
      optionIdByTitle[opt.title] = optId;
      await execute(
        `INSERT INTO shop_product_option (id, product_id, title, rank) VALUES ($1, $2, $3, $4)`,
        [optId, productId, opt.title, i]
      );
      for (let j = 0; j < opt.values.length; j++) {
        const valId = id("optval");
        optValIdByKey[`${opt.title}::${opt.values[j]}`] = valId;
        await execute(
          `INSERT INTO shop_product_option_value (id, option_id, value, rank) VALUES ($1, $2, $3, $4)`,
          [valId, optId, opt.values[j], j]
        );
      }
    }

    for (const v of p.variants) {
      const varId = id("var");
      const qty = seedQty(v.sku);
      const basePrice = inferPrice(v.sku);
      await execute(
        `INSERT INTO shop_product_variant (id, product_id, title, sku, manage_inventory, inventory_quantity)
         VALUES ($1, $2, $3, $4, true, $5)`,
        [varId, productId, v.title, v.sku, qty]
      );
      variantsCreated++;

      await execute(
        `INSERT INTO shop_variant_price (id, variant_id, currency_code, amount)
         VALUES ($1, $2, 'usd', $3), ($4, $2, 'gbp', $5), ($6, $2, 'eur', $7), ($8, $2, 'zar', $9)`,
        [
          id("price"), varId, basePrice,
          id("price"), Math.round(basePrice * 0.78),
          id("price"), Math.round(basePrice * 0.92),
          id("price"), Math.round(basePrice * 18.5),
        ]
      );

      for (const [optTitle, optValue] of Object.entries(v.options)) {
        const ovId = optValIdByKey[`${optTitle}::${optValue}`];
        if (ovId) {
          await execute(
            `INSERT INTO shop_variant_option_value (variant_id, option_value_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [varId, ovId]
          );
        }
      }
    }
  }

  console.log(`Created ${productsCreated} products, ${variantsCreated} variants`);

  const regionCount = await queryOne(`SELECT count(*)::int AS c FROM shop_region`);
  const productCount = await queryOne(`SELECT count(*)::int AS c FROM shop_product`);
  const variantCount = await queryOne(`SELECT count(*)::int AS c FROM shop_product_variant`);
  console.log(`Totals: ${regionCount?.c} regions, ${productCount?.c} products, ${variantCount?.c} variants`);
  console.log("Seed complete.");

  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
