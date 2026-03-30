import { Router } from "express";
import { v4 as uuid } from "uuid";
import { query, queryOne, execute } from "../db/pool.ts";

export const cartsRouter = Router();

async function getCartWithItems(cartId: string) {
  const cart = await queryOne(`SELECT * FROM shop_cart WHERE id = $1`, [cartId]);
  if (!cart) return null;
  const items = await query(
    `SELECT li.*, v.title AS variant_title, v.sku, v.inventory_quantity,
            p.id AS product_id, p.title AS product_title, p.handle AS product_handle,
            p.thumbnail AS product_thumbnail
     FROM shop_cart_line_item li
     JOIN shop_product_variant v ON v.id = li.variant_id
     JOIN shop_product p ON p.id = v.product_id
     WHERE li.cart_id = $1
     ORDER BY li.created_at`,
    [cartId]
  );
  const enrichedItems = await Promise.all(
    items.map(async (li) => {
      const images = await query(
        `SELECT id, url FROM shop_product_image WHERE product_id = $1 ORDER BY rank LIMIT 4`,
        [li.product_id]
      );
      return {
        id: li.id,
        variant_id: li.variant_id,
        product_id: li.product_id,
        title: li.product_title,
        thumbnail: li.product_thumbnail || images[0]?.url || null,
        quantity: li.quantity,
        unit_price: li.unit_price,
        description: li.variant_title,
        metadata: li.metadata || null,
        variant: {
          id: li.variant_id,
          title: li.variant_title,
          sku: li.sku || null,
          inventory_quantity: li.inventory_quantity ?? 0,
          product: {
            id: li.product_id,
            title: li.product_title,
            handle: li.product_handle,
            thumbnail: li.product_thumbnail || images[0]?.url || null,
            images: images.map((i: Record<string, unknown>) => ({ id: i.id, url: i.url })),
          },
        },
        product: {
          id: li.product_id,
          title: li.product_title,
          handle: li.product_handle,
          thumbnail: li.product_thumbnail || images[0]?.url || null,
          images: images.map((i: Record<string, unknown>) => ({ id: i.id, url: i.url })),
        },
      };
    })
  );
  return {
    id: cart.id,
    region_id: cart.region_id,
    items: enrichedItems,
    created_at: cart.created_at,
    updated_at: cart.updated_at,
  };
}

// POST /store/carts — create cart
cartsRouter.post("/", async (req, res) => {
  try {
    const id = `cart_${uuid().replace(/-/g, "")}`;
    const regionId = req.body.region_id || null;
    await execute(
      `INSERT INTO shop_cart (id, region_id) VALUES ($1, $2)`,
      [id, regionId]
    );
    const cart = await getCartWithItems(id);
    res.status(201).json({ cart });
  } catch (err) {
    console.error("[cart create]", err);
    res.status(500).json({ type: "server_error", message: "Failed to create cart" });
  }
});

// GET /store/carts/:cartId — retrieve cart
cartsRouter.get("/:cartId", async (req, res) => {
  try {
    const cart = await getCartWithItems(req.params.cartId);
    if (!cart) {
      res.status(404).json({ type: "not_found", message: "Cart not found" });
      return;
    }
    res.json({ cart });
  } catch (err) {
    console.error("[cart retrieve]", err);
    res.status(500).json({ type: "server_error", message: "Failed to retrieve cart" });
  }
});

// POST /store/carts/:cartId/line-items — add line item
cartsRouter.post("/:cartId/line-items", async (req, res) => {
  try {
    const { cartId } = req.params;
    const { variant_id, quantity, metadata } = req.body;
    if (!variant_id) {
      res.status(400).json({ type: "invalid_data", message: "variant_id is required" });
      return;
    }

    const variant = await queryOne(
      `SELECT v.id, v.product_id, vp.amount
       FROM shop_product_variant v
       LEFT JOIN shop_variant_price vp ON vp.variant_id = v.id AND vp.currency_code = 'usd'
       WHERE v.id = $1
       LIMIT 1`,
      [variant_id]
    );
    if (!variant) {
      res.status(404).json({ type: "not_found", message: "Variant not found" });
      return;
    }

    const existing = await queryOne(
      `SELECT id, quantity FROM shop_cart_line_item WHERE cart_id = $1 AND variant_id = $2`,
      [cartId, variant_id]
    );

    if (existing && !metadata) {
      await execute(
        `UPDATE shop_cart_line_item SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2`,
        [quantity || 1, existing.id]
      );
    } else {
      const lineId = `li_${uuid().replace(/-/g, "")}`;
      const unitPrice = Number(variant.amount || 0);
      await execute(
        `INSERT INTO shop_cart_line_item (id, cart_id, variant_id, quantity, unit_price, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [lineId, cartId, variant_id, quantity || 1, unitPrice, metadata ? JSON.stringify(metadata) : null]
      );
    }

    await execute(`UPDATE shop_cart SET updated_at = NOW() WHERE id = $1`, [cartId]);
    const cart = await getCartWithItems(cartId);
    res.json({ cart });
  } catch (err) {
    console.error("[cart add line]", err);
    res.status(500).json({ type: "server_error", message: "Failed to add line item" });
  }
});

// POST /store/carts/:cartId/line-items/:lineId — update line item
cartsRouter.post("/:cartId/line-items/:lineId", async (req, res) => {
  try {
    const { cartId, lineId } = req.params;
    const { quantity } = req.body;
    if (!quantity || quantity < 1) {
      res.status(400).json({ type: "invalid_data", message: "quantity must be >= 1" });
      return;
    }
    await execute(
      `UPDATE shop_cart_line_item SET quantity = $1, updated_at = NOW() WHERE id = $2 AND cart_id = $3`,
      [quantity, lineId, cartId]
    );
    await execute(`UPDATE shop_cart SET updated_at = NOW() WHERE id = $1`, [cartId]);
    const cart = await getCartWithItems(cartId);
    res.json({ cart });
  } catch (err) {
    console.error("[cart update line]", err);
    res.status(500).json({ type: "server_error", message: "Failed to update line item" });
  }
});

// DELETE /store/carts/:cartId/line-items/:lineId — remove line item
cartsRouter.delete("/:cartId/line-items/:lineId", async (req, res) => {
  try {
    const { cartId, lineId } = req.params;
    await execute(
      `DELETE FROM shop_cart_line_item WHERE id = $1 AND cart_id = $2`,
      [lineId, cartId]
    );
    await execute(`UPDATE shop_cart SET updated_at = NOW() WHERE id = $1`, [cartId]);
    const cart = await getCartWithItems(cartId);
    res.json({ id: lineId, object: "line-item", deleted: true, parent: cart });
  } catch (err) {
    console.error("[cart delete line]", err);
    res.status(500).json({ type: "server_error", message: "Failed to delete line item" });
  }
});
