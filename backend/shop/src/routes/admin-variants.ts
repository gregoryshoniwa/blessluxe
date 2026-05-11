import { Router } from "express";
import { v4 as uuid } from "uuid";
import { query, queryOne, execute } from "../db/pool.ts";

export const adminVariantsRouter = Router();

const newId = (prefix: string) => `${prefix}_${uuid().replace(/-/g, "")}`;

interface VariantBody {
  title: string;
  sku?: string;
  manage_inventory?: boolean;
  inventory_quantity?: number;
  allow_backorder?: boolean;
  cost_price?: number;
  weight_grams?: number;
  options?: Record<string, string>;
  prices?: Array<{
    currency_code: string;
    amount: number;
    sale_amount?: number | null;
    sale_starts_at?: string | null;
    sale_ends_at?: string | null;
    region_id?: string | null;
  }>;
}

// ─── Get the full variant + option set for a product ─────
adminVariantsRouter.get("/products/:id/full", async (req, res) => {
  try {
    const { id } = req.params;
    const product = await queryOne(`SELECT * FROM shop_product WHERE id = $1`, [id]);
    if (!product) return res.status(404).json({ error: "Not found" });

    const options = await query(
      `SELECT id, title, rank FROM shop_product_option WHERE product_id = $1 ORDER BY rank`,
      [id]
    );
    const optionValues = await query(
      `SELECT ov.id, ov.option_id, ov.value, ov.rank
       FROM shop_product_option_value ov
       JOIN shop_product_option o ON o.id = ov.option_id
       WHERE o.product_id = $1
       ORDER BY ov.rank`,
      [id]
    );
    const variants = await query(
      `SELECT * FROM shop_product_variant WHERE product_id = $1 ORDER BY created_at`,
      [id]
    );
    const variantIds = variants.map((v) => String(v.id));
    const prices = variantIds.length
      ? await query(
          `SELECT * FROM shop_variant_price WHERE variant_id = ANY($1)`,
          [variantIds]
        )
      : [];
    const variantOptionValues = variantIds.length
      ? await query(
          `SELECT vov.variant_id, vov.option_value_id, ov.value, o.title, o.id AS option_id
           FROM shop_variant_option_value vov
           JOIN shop_product_option_value ov ON ov.id = vov.option_value_id
           JOIN shop_product_option o ON o.id = ov.option_id
           WHERE vov.variant_id = ANY($1)`,
          [variantIds]
        )
      : [];

    const enrichedOptions = options.map((o) => ({
      ...o,
      values: optionValues.filter((v) => String(v.option_id) === String(o.id)),
    }));

    const enrichedVariants = variants.map((v) => {
      const vid = String(v.id);
      const optMap: Record<string, string> = {};
      for (const vov of variantOptionValues) {
        if (String(vov.variant_id) === vid) {
          optMap[String(vov.title)] = String(vov.value);
        }
      }
      return {
        ...v,
        options: optMap,
        prices: prices.filter((p) => String(p.variant_id) === vid),
      };
    });

    res.json({ product, options: enrichedOptions, variants: enrichedVariants });
  } catch (err) {
    console.error("[admin variants full]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Replace the entire option set for a product (atomic) ─────
adminVariantsRouter.put("/products/:id/options", async (req, res) => {
  try {
    const { id } = req.params;
    const { options } = req.body as {
      options: Array<{ title: string; values: string[] }>;
    };
    if (!Array.isArray(options)) return res.status(400).json({ error: "options array required" });

    // Cascade-delete clears option_values + variant_option_value rows.
    await execute(`DELETE FROM shop_product_option WHERE product_id = $1`, [id]);

    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const optId = newId("opt");
      await execute(
        `INSERT INTO shop_product_option (id, product_id, title, rank) VALUES ($1, $2, $3, $4)`,
        [optId, id, opt.title, i]
      );
      for (let j = 0; j < (opt.values || []).length; j++) {
        const valId = newId("optval");
        await execute(
          `INSERT INTO shop_product_option_value (id, option_id, value, rank) VALUES ($1, $2, $3, $4)`,
          [valId, optId, opt.values[j], j]
        );
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin set options]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Create a variant under a product ─────
adminVariantsRouter.post("/products/:id/variants-full", async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body as VariantBody;
    const variant = await createOrUpdateVariant({
      productId: id,
      variantId: null,
      body,
    });
    res.status(201).json({ variant });
  } catch (err: unknown) {
    console.error("[admin create variant]", err);
    const code = (err as { code?: string }).code;
    if (code === "23505") return res.status(409).json({ error: "SKU already exists" });
    res.status(500).json({ error: "Failed to create variant" });
  }
});

// ─── Update a variant (and its prices/options) ─────
adminVariantsRouter.put("/variants/:variantId/full", async (req, res) => {
  try {
    const { variantId } = req.params;
    const existing = await queryOne(
      `SELECT product_id FROM shop_product_variant WHERE id = $1`,
      [variantId]
    );
    if (!existing) return res.status(404).json({ error: "Not found" });
    const variant = await createOrUpdateVariant({
      productId: String(existing.product_id),
      variantId,
      body: req.body as VariantBody,
    });
    res.json({ variant });
  } catch (err: unknown) {
    console.error("[admin update variant]", err);
    const code = (err as { code?: string }).code;
    if (code === "23505") return res.status(409).json({ error: "SKU already exists" });
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Delete a variant ─────
adminVariantsRouter.delete("/variants/:variantId", async (req, res) => {
  try {
    await execute(`DELETE FROM shop_product_variant WHERE id = $1`, [req.params.variantId]);
    res.json({ deleted: true });
  } catch (err) {
    console.error("[admin delete variant]", err);
    res.status(500).json({ error: "Failed" });
  }
});

async function createOrUpdateVariant({
  productId,
  variantId,
  body,
}: {
  productId: string;
  variantId: string | null;
  body: VariantBody;
}) {
  const id = variantId ?? newId("var");

  if (variantId) {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    const set = (col: string, val: unknown) => {
      sets.push(`${col} = $${idx++}`);
      params.push(val);
    };
    if (body.title !== undefined) set("title", body.title);
    if (body.sku !== undefined) set("sku", body.sku || null);
    if (body.manage_inventory !== undefined) set("manage_inventory", body.manage_inventory);
    if (body.inventory_quantity !== undefined) set("inventory_quantity", body.inventory_quantity);
    if (body.allow_backorder !== undefined) set("allow_backorder", body.allow_backorder);
    if (body.cost_price !== undefined) set("cost_price", body.cost_price);
    if (body.weight_grams !== undefined) set("weight_grams", body.weight_grams);
    if (sets.length > 0) {
      sets.push(`updated_at = NOW()`);
      params.push(variantId);
      await execute(
        `UPDATE shop_product_variant SET ${sets.join(", ")} WHERE id = $${idx}`,
        params
      );
    }
  } else {
    await execute(
      `INSERT INTO shop_product_variant
        (id, product_id, title, sku, manage_inventory, inventory_quantity, allow_backorder, cost_price, weight_grams, received_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW())`,
      [
        id,
        productId,
        body.title,
        body.sku || null,
        body.manage_inventory ?? true,
        body.inventory_quantity ?? 0,
        body.allow_backorder ?? false,
        body.cost_price ?? null,
        body.weight_grams ?? null,
      ]
    );
    if ((body.inventory_quantity ?? 0) > 0) {
      await execute(
        `INSERT INTO shop_inventory_movement (id, variant_id, delta, reason, cost_per_unit) VALUES ($1, $2, $3, 'receive', $4)`,
        [newId("mv"), id, body.inventory_quantity, body.cost_price ?? null]
      );
    }
  }

  // Replace prices set. The admin UI only sends the ROOT currency price; we
  // expand it into all active currencies using rate_to_root from shop_currency.
  if (body.prices) {
    await execute(`DELETE FROM shop_variant_price WHERE variant_id = $1`, [id]);

    const currencies = await query(
      `SELECT code, rate_to_root, is_root FROM shop_currency WHERE is_active = true`
    );
    const rootCode = String(
      currencies.find((c) => c.is_root)?.code || "usd"
    ).toLowerCase();

    // Find the price the admin supplied for the root currency (or fall back
    // to the first one — keeps legacy multi-currency callers working).
    const rootPrice =
      body.prices.find((p) => p.currency_code.toLowerCase() === rootCode) ||
      body.prices[0];

    if (rootPrice) {
      // Multiplier (Decimal in pg comes back as string) → number.
      const rootRate = Number(
        currencies.find((c) => String(c.code).toLowerCase() === rootCode)?.rate_to_root || 1
      );
      const rootAmount = rootPrice.amount;
      const rootSale =
        rootPrice.sale_amount != null ? Number(rootPrice.sale_amount) : null;

      for (const c of currencies) {
        const code = String(c.code).toLowerCase();
        const rate = Number(c.rate_to_root);
        // ratio relative to root: rate / rootRate.
        const factor = rootRate ? rate / rootRate : 1;
        const amount =
          code === rootCode ? rootAmount : Math.round(rootAmount * factor);
        const sale =
          rootSale != null
            ? code === rootCode
              ? rootSale
              : Math.round(rootSale * factor)
            : null;
        await execute(
          `INSERT INTO shop_variant_price
            (id, variant_id, region_id, currency_code, amount, sale_amount, sale_starts_at, sale_ends_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            newId("price"),
            id,
            rootPrice.region_id || null,
            code,
            amount,
            sale,
            rootPrice.sale_starts_at ?? null,
            rootPrice.sale_ends_at ?? null,
          ]
        );
      }
    }
  }

  // Replace option-value assignments
  if (body.options) {
    await execute(`DELETE FROM shop_variant_option_value WHERE variant_id = $1`, [id]);
    for (const [optTitle, optValue] of Object.entries(body.options)) {
      const ov = await queryOne(
        `SELECT ov.id FROM shop_product_option_value ov
         JOIN shop_product_option o ON o.id = ov.option_id
         WHERE o.product_id = $1 AND o.title = $2 AND ov.value = $3`,
        [productId, optTitle, optValue]
      );
      if (ov) {
        await execute(
          `INSERT INTO shop_variant_option_value (variant_id, option_value_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, ov.id]
        );
      }
    }
  }

  return queryOne(`SELECT * FROM shop_product_variant WHERE id = $1`, [id]);
}

// ─── Inventory movements ─────
adminVariantsRouter.post("/inventory/receive", async (req, res) => {
  try {
    const { variant_id, quantity, cost_per_unit, notes, reference } = req.body as {
      variant_id: string;
      quantity: number;
      cost_per_unit?: number;
      notes?: string;
      reference?: string;
    };
    if (!variant_id || !quantity) {
      return res.status(400).json({ error: "variant_id and quantity required" });
    }
    await execute(
      `UPDATE shop_product_variant
       SET inventory_quantity = inventory_quantity + $1,
           manage_inventory = true,
           received_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [quantity, variant_id]
    );
    await execute(
      `INSERT INTO shop_inventory_movement (id, variant_id, delta, reason, cost_per_unit, reference, notes)
       VALUES ($1, $2, $3, 'receive', $4, $5, $6)`,
      [newId("mv"), variant_id, quantity, cost_per_unit ?? null, reference ?? null, notes ?? null]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin inventory receive]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminVariantsRouter.get("/inventory/movements", async (req, res) => {
  try {
    const variantId = (req.query.variant_id as string) || undefined;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const where = variantId ? `WHERE variant_id = $1` : "";
    const params = variantId ? [variantId, limit] : [limit];
    const sql = `
      SELECT m.*, v.title AS variant_title, v.sku, p.title AS product_title, p.id AS product_id
      FROM shop_inventory_movement m
      JOIN shop_product_variant v ON v.id = m.variant_id
      JOIN shop_product p ON p.id = v.product_id
      ${where}
      ORDER BY m.created_at DESC
      LIMIT $${variantId ? 2 : 1}
    `;
    const rows = await query(sql, params);
    res.json({ movements: rows });
  } catch (err) {
    console.error("[admin inventory movements]", err);
    res.status(500).json({ error: "Failed" });
  }
});
