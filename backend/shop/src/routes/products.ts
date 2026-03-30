import { Router } from "express";
import { query, queryOne } from "../db/pool.ts";

export const productsRouter = Router();

type ProductRow = Record<string, unknown>;
type VariantRow = Record<string, unknown>;

async function enrichProducts(productRows: ProductRow[], regionId?: string) {
  if (productRows.length === 0) return [];
  const ids = productRows.map((p) => String(p.id));

  const [imageRows, catRows, tagRows, optionRows, optionValueRows, variantRows, priceRows, varOptRows] =
    await Promise.all([
      query(
        `SELECT id, product_id, url, rank FROM shop_product_image WHERE product_id = ANY($1) ORDER BY rank`,
        [ids]
      ),
      query(
        `SELECT m.product_id, c.id, c.name, c.handle, c.parent_category_id
         FROM shop_product_category_map m
         JOIN shop_product_category c ON c.id = m.category_id
         WHERE m.product_id = ANY($1)`,
        [ids]
      ),
      query(
        `SELECT m.product_id, t.id, t.value
         FROM shop_product_tag_map m
         JOIN shop_product_tag t ON t.id = m.tag_id
         WHERE m.product_id = ANY($1)`,
        [ids]
      ),
      query(
        `SELECT id, product_id, title, rank FROM shop_product_option WHERE product_id = ANY($1) ORDER BY rank`,
        [ids]
      ),
      query(
        `SELECT ov.id, ov.option_id, ov.value, ov.rank
         FROM shop_product_option_value ov
         JOIN shop_product_option o ON o.id = ov.option_id
         WHERE o.product_id = ANY($1)
         ORDER BY ov.rank`,
        [ids]
      ),
      query(
        `SELECT id, product_id, title, sku, manage_inventory, inventory_quantity, allow_backorder, metadata, created_at, updated_at
         FROM shop_product_variant WHERE product_id = ANY($1)
         ORDER BY created_at`,
        [ids]
      ),
      query(
        `SELECT vp.id, vp.variant_id, vp.currency_code, vp.amount, vp.region_id
         FROM shop_variant_price vp
         JOIN shop_product_variant v ON v.id = vp.variant_id
         WHERE v.product_id = ANY($1)`,
        [ids]
      ),
      query(
        `SELECT vov.variant_id, vov.option_value_id, ov.value AS val, o.title AS option_title, o.id AS option_id
         FROM shop_variant_option_value vov
         JOIN shop_product_option_value ov ON ov.id = vov.option_value_id
         JOIN shop_product_option o ON o.id = ov.option_id
         JOIN shop_product_variant v ON v.id = vov.variant_id
         WHERE v.product_id = ANY($1)`,
        [ids]
      ),
    ]);

  const imagesByProduct = groupBy(imageRows, "product_id");
  const catsByProduct = groupBy(catRows, "product_id");
  const tagsByProduct = groupBy(tagRows, "product_id");
  const optsByProduct = groupBy(optionRows, "product_id");
  const optValsByOption = groupBy(optionValueRows, "option_id");
  const variantsByProduct = groupBy(variantRows, "product_id");
  const pricesByVariant = groupBy(priceRows, "variant_id");
  const varOptsByVariant = groupBy(varOptRows, "variant_id");

  return productRows.map((p) => {
    const pid = String(p.id);
    const images = (imagesByProduct[pid] || []).map((i) => ({
      id: i.id,
      url: i.url,
    }));
    const categories = (catsByProduct[pid] || []).map((c) => ({
      id: c.id,
      name: c.name,
      handle: c.handle,
      parent_category_id: c.parent_category_id || null,
    }));
    const tags = (tagsByProduct[pid] || []).map((t) => ({ id: t.id, value: t.value }));
    const options = (optsByProduct[pid] || []).map((o) => ({
      id: o.id,
      title: o.title,
      values: (optValsByOption[String(o.id)] || []).map((v) => ({
        id: v.id,
        value: v.value,
      })),
    }));
    const variants = (variantsByProduct[pid] || []).map((v) => {
      const vid = String(v.id);
      const allPrices = pricesByVariant[vid] || [];
      const regionPrices = regionId
        ? allPrices.filter((pr) => String(pr.region_id) === regionId || !pr.region_id)
        : allPrices;
      const usdPrice = regionPrices.find(
        (pr) => String(pr.currency_code) === "usd"
      );
      const firstPrice = regionPrices[0] || allPrices[0];
      const calcAmount = usdPrice ? Number(usdPrice.amount) : firstPrice ? Number(firstPrice.amount) : 0;
      const variantOptions = (varOptsByVariant[vid] || []).map((vo) => ({
        option_id: vo.option_id,
        option: { title: vo.option_title },
        value: vo.val,
      }));
      return {
        id: v.id,
        title: v.title,
        sku: v.sku || null,
        manage_inventory: v.manage_inventory ?? false,
        inventory_quantity: v.inventory_quantity ?? 0,
        allow_backorder: v.allow_backorder ?? false,
        metadata: v.metadata || null,
        options: variantOptions,
        calculated_price: {
          calculated_amount: calcAmount,
          original_amount: calcAmount,
          currency_code: usdPrice ? "usd" : firstPrice ? String(firstPrice.currency_code) : "usd",
        },
        prices: allPrices.map((pr) => ({
          id: pr.id,
          amount: Number(pr.amount),
          currency_code: pr.currency_code,
        })),
        amount: calcAmount,
        created_at: v.created_at,
        updated_at: v.updated_at,
      };
    });

    return {
      id: p.id,
      title: p.title,
      handle: p.handle,
      description: p.description || null,
      subtitle: p.subtitle || null,
      thumbnail: (p.thumbnail as string) || images[0]?.url || null,
      status: p.status,
      metadata: p.metadata || null,
      images,
      categories,
      tags,
      options,
      variants,
      created_at: p.created_at,
      updated_at: p.updated_at,
    };
  });
}

// GET /store/products
productsRouter.get("/", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 500);
    const offset = Number(req.query.offset) || 0;
    const regionId = (req.query.region_id as string) || undefined;
    const handle = (req.query.handle as string) || undefined;
    const q = (req.query.q as string) || undefined;
    const categoryIds: string[] = Array.isArray(req.query["category_id[]"])
      ? (req.query["category_id[]"] as string[])
      : req.query["category_id[]"]
      ? [req.query["category_id[]"] as string]
      : [];
    const idFilter: string[] = Array.isArray(req.query["id[]"])
      ? (req.query["id[]"] as string[])
      : req.query["id[]"]
      ? [req.query["id[]"] as string]
      : req.query.id
      ? [req.query.id as string]
      : [];

    const conditions: string[] = ["p.status = 'published'"];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (handle) {
      conditions.push(`p.handle = $${paramIdx++}`);
      params.push(handle);
    }
    if (idFilter.length > 0) {
      conditions.push(`p.id = ANY($${paramIdx++})`);
      params.push(idFilter);
    }
    if (categoryIds.length > 0) {
      conditions.push(
        `EXISTS (SELECT 1 FROM shop_product_category_map m WHERE m.product_id = p.id AND m.category_id = ANY($${paramIdx++}))`
      );
      params.push(categoryIds);
    }
    if (q) {
      conditions.push(
        `(p.title ILIKE $${paramIdx} OR p.description ILIKE $${paramIdx} OR p.handle ILIKE $${paramIdx})`
      );
      params.push(`%${q}%`);
      paramIdx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `SELECT * FROM shop_product p ${where} ORDER BY p.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, offset);

    const rows = await query(sql, params);
    const products = await enrichProducts(rows, regionId);

    const countSql = `SELECT count(*)::int AS total FROM shop_product p ${where}`;
    const countRow = await queryOne(countSql, params.slice(0, params.length - 2));
    const count = Number(countRow?.total || products.length);

    res.json({ products, count, offset, limit });
  } catch (err) {
    console.error("[products list]", err);
    res.status(500).json({ type: "server_error", message: "Failed to list products" });
  }
});

// GET /store/products/:productId
productsRouter.get("/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    const regionId = (req.query.region_id as string) || undefined;
    const row = await queryOne(
      `SELECT * FROM shop_product WHERE id = $1 AND status = 'published'`,
      [productId]
    );
    if (!row) {
      res.status(404).json({ type: "not_found", message: "Product not found" });
      return;
    }
    const [product] = await enrichProducts([row], regionId);
    res.json({ product });
  } catch (err) {
    console.error("[product by id]", err);
    res.status(500).json({ type: "server_error", message: "Failed to fetch product" });
  }
});

function groupBy(rows: Record<string, unknown>[], key: string) {
  const map: Record<string, Record<string, unknown>[]> = {};
  for (const row of rows) {
    const k = String(row[key] || "");
    if (!map[k]) map[k] = [];
    map[k].push(row);
  }
  return map;
}
