import { Router } from "express";
import { queryOne } from "../db/pool.ts";

export const variantsRouter = Router();

variantsRouter.get("/:variantId", async (req, res) => {
  try {
    const { variantId } = req.params;
    const row = await queryOne(
      `SELECT id, inventory_quantity FROM shop_product_variant WHERE id = $1`,
      [variantId]
    );
    if (!row) {
      res.status(404).json({ type: "not_found", message: "Variant not found" });
      return;
    }
    res.json({
      variant: {
        id: row.id,
        inventory_quantity: row.inventory_quantity ?? 0,
      },
    });
  } catch (err) {
    console.error("[variants]", err);
    res.status(500).json({ type: "server_error", message: "Failed to fetch variant" });
  }
});
