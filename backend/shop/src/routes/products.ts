import { Router } from "express";
import { query, queryOne } from "../db/pool.ts";

export const productsRouter = Router();

type ProductRow = Record<string, unknown>;
type VariantRow = Record<string, unknown>;

async function enrichProducts(productRows: ProductRow[], regionId?: string) {
  if (productRows.length === 0) return [];
  const ids = productRows.map((p) => String(p.id));

  const [
    imageRows,
    mediaRows,
    catRows,
    catalogueRows,
    tagRows,
    optionRows,
    optionValueRows,
    variantRows,
    priceRows,
    varOptRows,
  ] = await Promise.all([
      query(
        `SELECT id, product_id, url, rank FROM shop_product_image WHERE product_id = ANY($1) ORDER BY rank`,
        [ids]
      ),
      query(
        `SELECT id, product_id, media_type, media_url, thumbnail_url, alt_text,
                is_primary, position, status
         FROM shop_product_media
         WHERE product_id = ANY($1) AND status = 'ready'
         ORDER BY is_primary DESC, position ASC, created_at ASC`,
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
        `SELECT m.product_id, c.id, c.name, c.handle, c.heading_id,
                h.name AS heading_name, h.handle AS heading_handle
         FROM shop_product_catalogue_map m
         JOIN shop_catalogue c ON c.id = m.catalogue_id
         JOIN shop_heading h ON h.id = c.heading_id
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
  const mediaByProduct = groupBy(mediaRows, "product_id");
  const catsByProduct = groupBy(catRows, "product_id");
  const cataloguesByProduct = groupBy(catalogueRows, "product_id");
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
    const media = (mediaByProduct[pid] || []).map((m) => ({
      id: String(m.id),
      media_type: String(m.media_type || "image"),
      url: String(m.media_url || ""),
      thumbnail_url: (m.thumbnail_url as string) || null,
      alt_text: (m.alt_text as string) || null,
      is_primary: Boolean(m.is_primary),
      position: Number(m.position ?? 0),
    }));
    const categories = (catsByProduct[pid] || []).map((c) => ({
      id: c.id,
      name: c.name,
      handle: c.handle,
      parent_category_id: c.parent_category_id || null,
    }));
    const catalogues = (cataloguesByProduct[pid] || []).map((c) => ({
      id: c.id,
      name: c.name,
      handle: c.handle,
      heading_id: c.heading_id,
      heading_name: c.heading_name,
      heading_handle: c.heading_handle,
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
      thumbnail:
        media.find((m) => m.is_primary)?.thumbnail_url ||
        media.find((m) => m.is_primary && m.media_type === "image")?.url ||
        (p.thumbnail as string) ||
        images[0]?.url ||
        null,
      status: p.status,
      metadata: p.metadata || null,
      images,
      media,
      categories,
      catalogues,
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
    // Accept all of: ?category_id=a, ?category_id=a&category_id=b, ?category_id[]=a (Express's qs
     // parser drops the literal [] suffix and gives us either a string or an array of strings).
    const arrayParam = (key: string): string[] => {
      const direct = req.query[key];
      const bracketed = req.query[`${key}[]`];
      const merged = [direct, bracketed]
        .flat()
        .filter((v): v is string => typeof v === "string" && v.length > 0);
      return merged;
    };

    const categoryIds = arrayParam("category_id");
    const catalogueIds = arrayParam("catalogue_id");
    const catalogueHandle = (req.query.catalogue_handle as string) || undefined;
    const headingId = (req.query.heading_id as string) || undefined;
    const headingHandle = (req.query.heading_handle as string) || undefined;
    const idFilter = [...arrayParam("id")];

    // include_unbuyable=true is opt-in for admin/preview tools; the storefront
    // never passes it, so customers only ever see products with at least one
    // priced variant.
    const includeUnbuyable =
      String(req.query.include_unbuyable || "").toLowerCase() === "true";

    const conditions: string[] = ["p.status = 'published'"];
    if (!includeUnbuyable) {
      conditions.push(
        `EXISTS (
          SELECT 1 FROM shop_product_variant v
          JOIN shop_variant_price vp ON vp.variant_id = v.id
          WHERE v.product_id = p.id AND vp.amount > 0
        )`
      );
    }
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
      // Accept either legacy categories or new catalogues — match by id in either table.
      conditions.push(
        `(EXISTS (SELECT 1 FROM shop_product_category_map m WHERE m.product_id = p.id AND m.category_id = ANY($${paramIdx})) OR
          EXISTS (SELECT 1 FROM shop_product_catalogue_map m WHERE m.product_id = p.id AND m.catalogue_id = ANY($${paramIdx})))`
      );
      params.push(categoryIds);
      paramIdx++;
    }
    if (catalogueIds.length > 0) {
      conditions.push(
        `EXISTS (SELECT 1 FROM shop_product_catalogue_map m WHERE m.product_id = p.id AND m.catalogue_id = ANY($${paramIdx++}))`
      );
      params.push(catalogueIds);
    }
    if (catalogueHandle) {
      conditions.push(
        `EXISTS (SELECT 1 FROM shop_product_catalogue_map m JOIN shop_catalogue c ON c.id = m.catalogue_id WHERE m.product_id = p.id AND c.handle = $${paramIdx++})`
      );
      params.push(catalogueHandle);
    }
    if (headingId) {
      conditions.push(
        `EXISTS (SELECT 1 FROM shop_product_catalogue_map m JOIN shop_catalogue c ON c.id = m.catalogue_id WHERE m.product_id = p.id AND c.heading_id = $${paramIdx++})`
      );
      params.push(headingId);
    }
    if (headingHandle) {
      conditions.push(
        `EXISTS (SELECT 1 FROM shop_product_catalogue_map m JOIN shop_catalogue c ON c.id = m.catalogue_id JOIN shop_heading h ON h.id = c.heading_id WHERE m.product_id = p.id AND h.handle = $${paramIdx++})`
      );
      params.push(headingHandle);
    }
    if (q) {
      // Keyword search across title/description/handle AND product tag values.
      // Tags are stored in shop_product_tag (value) joined via shop_product_tag_map.
      conditions.push(
        `(p.title ILIKE $${paramIdx}
          OR p.description ILIKE $${paramIdx}
          OR p.handle ILIKE $${paramIdx}
          OR EXISTS (
            SELECT 1 FROM shop_product_tag_map tm
            JOIN shop_product_tag t ON t.id = tm.tag_id
            WHERE tm.product_id = p.id AND t.value ILIKE $${paramIdx}
          ))`
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
