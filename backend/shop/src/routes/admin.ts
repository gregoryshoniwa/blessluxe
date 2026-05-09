import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { v4 as uuid } from "uuid";
import { query, queryOne, execute } from "../db/pool.ts";
import { requireAdmin } from "../middleware/admin-auth.ts";
import { adminHierarchyRouter } from "./admin-hierarchy.ts";
import { adminReviewsRouter } from "./admin-reviews.ts";
import { adminCustomersRouter } from "./admin-customers.ts";
import { adminAffiliatesRouter } from "./admin-affiliates.ts";
import { adminTagsRouter } from "./admin-tags.ts";
import { adminVariantsRouter } from "./admin-variants.ts";
import { adminCampaignsRouter } from "./admin-campaigns.ts";
import { adminFinanceRouter } from "./admin-finance.ts";
import { adminAiRouter } from "./admin-ai.ts";
import { adminPacksRouter } from "./admin-packs.ts";
import { adminPackagesRouter } from "./admin-packages.ts";

export const adminRouter = Router();

adminRouter.use(requireAdmin);
adminRouter.use(adminHierarchyRouter);
adminRouter.use(adminReviewsRouter);
adminRouter.use(adminCustomersRouter);
adminRouter.use(adminAffiliatesRouter);
adminRouter.use(adminTagsRouter);
adminRouter.use(adminVariantsRouter);
adminRouter.use(adminCampaignsRouter);
adminRouter.use(adminFinanceRouter);
adminRouter.use(adminAiRouter);
adminRouter.use(adminPacksRouter);
adminRouter.use(adminPackagesRouter);

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

function baseUrl(req: { protocol: string; get: (h: string) => string | undefined }) {
  const host = req.get("host") || "localhost:9000";
  return `${req.protocol}://${host}`;
}

// ─── Image upload ────────────────────────────────────────
adminRouter.post("/uploads", upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  const url = `${baseUrl(req)}/uploads/${req.file.filename}`;
  res.json({ url, filename: req.file.filename });
});

// ─── Products CRUD ───────────────────────────────────────

adminRouter.get("/products", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const q = (req.query.q as string) || undefined;
    const status = (req.query.status as string) || undefined;
    const catalogueId = (req.query.catalogue_id as string) || undefined;
    const headingId = (req.query.heading_id as string) || undefined;
    const noCatalogue = req.query.no_catalogue === "true";

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (q) {
      conditions.push(`(p.title ILIKE $${idx} OR p.handle ILIKE $${idx} OR p.description ILIKE $${idx})`);
      params.push(`%${q}%`);
      idx++;
    }
    if (status) {
      conditions.push(`p.status = $${idx++}`);
      params.push(status);
    }
    if (catalogueId) {
      conditions.push(
        `EXISTS (SELECT 1 FROM shop_product_catalogue_map m WHERE m.product_id = p.id AND m.catalogue_id = $${idx++})`
      );
      params.push(catalogueId);
    } else if (headingId) {
      conditions.push(
        `EXISTS (SELECT 1 FROM shop_product_catalogue_map m JOIN shop_catalogue c ON c.id = m.catalogue_id
         WHERE m.product_id = p.id AND c.heading_id = $${idx++})`
      );
      params.push(headingId);
    } else if (noCatalogue) {
      conditions.push(
        `NOT EXISTS (SELECT 1 FROM shop_product_catalogue_map m WHERE m.product_id = p.id)`
      );
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const totalRow = await queryOne(
      `SELECT count(*)::int AS total FROM shop_product p ${where}`,
      params
    );
    params.push(limit, offset);
    const rows = await query(
      `SELECT p.* FROM shop_product p ${where}
       ORDER BY p.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );
    res.json({
      products: rows,
      count: Number(totalRow?.total ?? rows.length),
      offset,
      limit,
    });
  } catch (err) {
    console.error("[admin products]", err);
    res.status(500).json({ error: "Failed to list products" });
  }
});

adminRouter.get("/products/:id", async (req, res) => {
  try {
    const row = await queryOne(`SELECT * FROM shop_product WHERE id = $1`, [req.params.id]);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ product: row });
  } catch (err) {
    console.error("[admin product]", err);
    res.status(500).json({ error: "Failed" });
  }
});

type CreateProductBody = {
  title: string;
  handle?: string;
  description?: string;
  subtitle?: string;
  thumbnail?: string;
  status?: string;
  metadata?: Record<string, unknown>;
  categories?: Array<{ id: string }>;
  catalogue_ids?: string[];
  tags?: Array<{ value: string }>;
  options?: Array<{ title: string; values: string[] }>;
  variants?: Array<{
    title: string;
    sku?: string;
    manage_inventory?: boolean;
    inventory_quantity?: number;
    prices?: Array<{ amount: number; currency_code: string }>;
    options?: Record<string, string>;
  }>;
  images?: string[];
};

adminRouter.post("/products", async (req, res) => {
  try {
    const body = req.body as CreateProductBody;
    const productId = `prod_${uuid().replace(/-/g, "")}`;
    const handle =
      body.handle ||
      body.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

    await execute(
      `INSERT INTO shop_product (id, title, handle, description, subtitle, thumbnail, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        productId,
        body.title,
        handle,
        body.description || null,
        body.subtitle || null,
        body.thumbnail || null,
        body.status || "published",
        body.metadata ? JSON.stringify(body.metadata) : null,
      ]
    );

    if (body.images?.length) {
      for (let i = 0; i < body.images.length; i++) {
        await execute(
          `INSERT INTO shop_product_image (id, product_id, url, rank) VALUES ($1, $2, $3, $4)`,
          [`img_${uuid().replace(/-/g, "")}`, productId, body.images[i], i]
        );
      }
    }

    if (body.categories?.length) {
      for (const cat of body.categories) {
        await execute(
          `INSERT INTO shop_product_category_map (product_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [productId, cat.id]
        );
      }
    }

    if (body.catalogue_ids?.length) {
      for (const catalogueId of body.catalogue_ids) {
        await execute(
          `INSERT INTO shop_product_catalogue_map (product_id, catalogue_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [productId, catalogueId]
        );
      }
    }

    if (body.tags?.length) {
      for (const tag of body.tags) {
        let tagRow = await queryOne(`SELECT id FROM shop_product_tag WHERE value = $1`, [tag.value]);
        if (!tagRow) {
          const tagId = `tag_${uuid().replace(/-/g, "")}`;
          await execute(`INSERT INTO shop_product_tag (id, value) VALUES ($1, $2)`, [tagId, tag.value]);
          tagRow = { id: tagId };
        }
        await execute(
          `INSERT INTO shop_product_tag_map (product_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [productId, tagRow.id]
        );
      }
    }

    const optionIdByTitle: Record<string, string> = {};
    const optionValueIdByKey: Record<string, string> = {};

    if (body.options?.length) {
      for (let i = 0; i < body.options.length; i++) {
        const opt = body.options[i];
        const optId = `opt_${uuid().replace(/-/g, "")}`;
        optionIdByTitle[opt.title] = optId;
        await execute(
          `INSERT INTO shop_product_option (id, product_id, title, rank) VALUES ($1, $2, $3, $4)`,
          [optId, productId, opt.title, i]
        );
        for (let j = 0; j < opt.values.length; j++) {
          const valId = `optval_${uuid().replace(/-/g, "")}`;
          optionValueIdByKey[`${opt.title}::${opt.values[j]}`] = valId;
          await execute(
            `INSERT INTO shop_product_option_value (id, option_id, value, rank) VALUES ($1, $2, $3, $4)`,
            [valId, optId, opt.values[j], j]
          );
        }
      }
    }

    if (body.variants?.length) {
      for (const v of body.variants) {
        const varId = `var_${uuid().replace(/-/g, "")}`;
        await execute(
          `INSERT INTO shop_product_variant (id, product_id, title, sku, manage_inventory, inventory_quantity)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            varId,
            productId,
            v.title,
            v.sku || null,
            v.manage_inventory ?? false,
            v.inventory_quantity ?? 0,
          ]
        );

        if (v.prices?.length) {
          for (const pr of v.prices) {
            await execute(
              `INSERT INTO shop_variant_price (id, variant_id, currency_code, amount) VALUES ($1, $2, $3, $4)`,
              [`price_${uuid().replace(/-/g, "")}`, varId, pr.currency_code, pr.amount]
            );
          }
        }

        if (v.options) {
          for (const [optTitle, optValue] of Object.entries(v.options)) {
            const ovId = optionValueIdByKey[`${optTitle}::${optValue}`];
            if (ovId) {
              await execute(
                `INSERT INTO shop_variant_option_value (variant_id, option_value_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [varId, ovId]
              );
            }
          }
        }
      }
    }

    const product = await queryOne(`SELECT * FROM shop_product WHERE id = $1`, [productId]);
    res.status(201).json({ product });
  } catch (err) {
    console.error("[admin create product]", err);
    res.status(500).json({ error: "Failed to create product" });
  }
});

adminRouter.patch("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body as Partial<CreateProductBody>;
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (body.title !== undefined) { sets.push(`title = $${idx++}`); params.push(body.title); }
    if (body.handle !== undefined) { sets.push(`handle = $${idx++}`); params.push(body.handle); }
    if (body.description !== undefined) { sets.push(`description = $${idx++}`); params.push(body.description); }
    if (body.subtitle !== undefined) { sets.push(`subtitle = $${idx++}`); params.push(body.subtitle); }
    if (body.thumbnail !== undefined) { sets.push(`thumbnail = $${idx++}`); params.push(body.thumbnail); }
    if (body.status !== undefined) { sets.push(`status = $${idx++}`); params.push(body.status); }
    if (body.metadata !== undefined) { sets.push(`metadata = $${idx++}`); params.push(JSON.stringify(body.metadata)); }

    if (sets.length > 0) {
      sets.push(`updated_at = NOW()`);
      params.push(id);
      await execute(`UPDATE shop_product SET ${sets.join(", ")} WHERE id = $${idx}`, params);
    }

    const product = await queryOne(`SELECT * FROM shop_product WHERE id = $1`, [id]);
    res.json({ product });
  } catch (err) {
    console.error("[admin update product]", err);
    res.status(500).json({ error: "Failed to update product" });
  }
});

// ─── Product images ─────────────────────────────────────

adminRouter.get("/products/:id/images", async (req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM shop_product_image WHERE product_id = $1 ORDER BY rank`,
      [req.params.id]
    );
    res.json({ images: rows });
  } catch (err) {
    console.error("[admin product images]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminRouter.post("/products/:id/images", async (req, res) => {
  try {
    const { url } = req.body as { url: string };
    const imgId = `img_${uuid().replace(/-/g, "")}`;
    const maxRank = await queryOne(
      `SELECT COALESCE(MAX(rank), -1) + 1 AS next_rank FROM shop_product_image WHERE product_id = $1`,
      [req.params.id]
    );
    await execute(
      `INSERT INTO shop_product_image (id, product_id, url, rank) VALUES ($1, $2, $3, $4)`,
      [imgId, req.params.id, url, maxRank?.next_rank ?? 0]
    );
    res.status(201).json({ image: { id: imgId, product_id: req.params.id, url, rank: maxRank?.next_rank ?? 0 } });
  } catch (err) {
    console.error("[admin add product image]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminRouter.delete("/products/:productId/images/:imageId", async (req, res) => {
  try {
    await execute(`DELETE FROM shop_product_image WHERE id = $1 AND product_id = $2`, [req.params.imageId, req.params.productId]);
    res.json({ deleted: true });
  } catch (err) {
    console.error("[admin delete product image]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminRouter.delete("/products/:id", async (req, res) => {
  try {
    // Cart lines reference variants without ON DELETE CASCADE, so clear them
    // first. Carts are ephemeral so this is safe. Order lines snapshot the
    // variant_id without a FK and are preserved.
    await execute(
      `DELETE FROM shop_cart_line_item
        WHERE variant_id IN (SELECT id FROM shop_product_variant WHERE product_id = $1)`,
      [req.params.id]
    );
    await execute(`DELETE FROM shop_product WHERE id = $1`, [req.params.id]);
    res.json({ id: req.params.id, deleted: true });
  } catch (err) {
    console.error("[admin delete product]", err);
    const message =
      err instanceof Error ? err.message : "Failed to delete product";
    res.status(500).json({ error: message });
  }
});

// ─── Product ↔ Catalogue assignments (per product) ─────────────

adminRouter.get("/products/:id/catalogues", async (req, res) => {
  try {
    const rows = await query(
      `SELECT c.id, c.name, c.handle, c.heading_id, h.name AS heading_name, h.handle AS heading_handle
       FROM shop_product_catalogue_map m
       JOIN shop_catalogue c ON c.id = m.catalogue_id
       JOIN shop_heading h ON h.id = c.heading_id
       WHERE m.product_id = $1
       ORDER BY c.rank, c.name`,
      [req.params.id]
    );
    res.json({ catalogues: rows });
  } catch (err) {
    console.error("[admin product catalogues list]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminRouter.put("/products/:id/catalogues", async (req, res) => {
  try {
    const { catalogue_ids } = req.body as { catalogue_ids: string[] };
    if (!Array.isArray(catalogue_ids)) {
      res.status(400).json({ error: "catalogue_ids array required" });
      return;
    }
    await execute(`DELETE FROM shop_product_catalogue_map WHERE product_id = $1`, [req.params.id]);
    for (const cid of catalogue_ids) {
      await execute(
        `INSERT INTO shop_product_catalogue_map (product_id, catalogue_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [req.params.id, cid]
      );
    }
    res.json({ ok: true, catalogue_ids });
  } catch (err) {
    console.error("[admin set product catalogues]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Variants ────────────────────────────────────────────

adminRouter.post("/products/:productId/variants", async (req, res) => {
  try {
    const { productId } = req.params;
    const body = req.body as {
      title: string;
      sku?: string;
      manage_inventory?: boolean;
      inventory_quantity?: number;
      prices?: Array<{ amount: number; currency_code: string }>;
    };
    const varId = `var_${uuid().replace(/-/g, "")}`;
    await execute(
      `INSERT INTO shop_product_variant (id, product_id, title, sku, manage_inventory, inventory_quantity)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [varId, productId, body.title, body.sku || null, body.manage_inventory ?? false, body.inventory_quantity ?? 0]
    );
    if (body.prices?.length) {
      for (const pr of body.prices) {
        await execute(
          `INSERT INTO shop_variant_price (id, variant_id, currency_code, amount) VALUES ($1, $2, $3, $4)`,
          [`price_${uuid().replace(/-/g, "")}`, varId, pr.currency_code, pr.amount]
        );
      }
    }
    res.status(201).json({ variant: { id: varId, ...body } });
  } catch (err) {
    console.error("[admin create variant]", err);
    res.status(500).json({ error: "Failed to create variant" });
  }
});

adminRouter.patch("/variants/:variantId", async (req, res) => {
  try {
    const { variantId } = req.params;
    const body = req.body as Partial<{
      title: string;
      sku: string;
      manage_inventory: boolean;
      inventory_quantity: number;
    }>;
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (body.title !== undefined) { sets.push(`title = $${idx++}`); params.push(body.title); }
    if (body.sku !== undefined) { sets.push(`sku = $${idx++}`); params.push(body.sku); }
    if (body.manage_inventory !== undefined) { sets.push(`manage_inventory = $${idx++}`); params.push(body.manage_inventory); }
    if (body.inventory_quantity !== undefined) { sets.push(`inventory_quantity = $${idx++}`); params.push(body.inventory_quantity); }
    if (sets.length > 0) {
      sets.push(`updated_at = NOW()`);
      params.push(variantId);
      await execute(`UPDATE shop_product_variant SET ${sets.join(", ")} WHERE id = $${idx}`, params);
    }
    const row = await queryOne(`SELECT * FROM shop_product_variant WHERE id = $1`, [variantId]);
    res.json({ variant: row });
  } catch (err) {
    console.error("[admin update variant]", err);
    res.status(500).json({ error: "Failed to update variant" });
  }
});

// ─── Inventory shorthand ─────────────────────────────────

adminRouter.post("/inventory/update", async (req, res) => {
  try {
    const { variant_id, quantity } = req.body as { variant_id: string; quantity: number };
    await execute(
      `UPDATE shop_product_variant SET inventory_quantity = $1, manage_inventory = true, updated_at = NOW() WHERE id = $2`,
      [quantity, variant_id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin inventory]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Categories ──────────────────────────────────────────

adminRouter.get("/categories", async (_req, res) => {
  try {
    const rows = await query(`SELECT * FROM shop_product_category ORDER BY rank, name`);
    res.json({ categories: rows });
  } catch (err) {
    console.error("[admin categories]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminRouter.post("/categories", async (req, res) => {
  try {
    const { name, handle, description, parent_category_id } = req.body;
    const id = `cat_${uuid().replace(/-/g, "")}`;
    await execute(
      `INSERT INTO shop_product_category (id, name, handle, description, parent_category_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, name, handle, description || null, parent_category_id || null]
    );
    res.status(201).json({ category: { id, name, handle } });
  } catch (err) {
    console.error("[admin create category]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Regions ─────────────────────────────────────────────

adminRouter.get("/regions", async (_req, res) => {
  try {
    const rows = await query(`SELECT * FROM shop_region ORDER BY created_at`);
    res.json({ regions: rows });
  } catch (err) {
    console.error("[admin regions]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminRouter.post("/regions", async (req, res) => {
  try {
    const { name, currency_code, countries } = req.body;
    const id = `reg_${uuid().replace(/-/g, "")}`;
    await execute(
      `INSERT INTO shop_region (id, name, currency_code, countries) VALUES ($1, $2, $3, $4)`,
      [id, name, currency_code || "usd", countries || []]
    );
    res.status(201).json({ region: { id, name, currency_code } });
  } catch (err) {
    console.error("[admin create region]", err);
    res.status(500).json({ error: "Failed" });
  }
});
