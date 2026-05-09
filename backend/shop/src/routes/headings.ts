import { Router } from "express";
import { query } from "../db/pool.ts";

export const headingsRouter = Router();

type HeadingRow = Record<string, unknown>;
type CatalogueRow = Record<string, unknown>;

function mapHeading(h: HeadingRow, catalogues: CatalogueRow[]) {
  return {
    id: h.id,
    name: h.name,
    handle: h.handle,
    description: h.description || null,
    rank: Number(h.rank ?? 0),
    is_active: h.is_active !== false,
    is_sale: Boolean(h.is_sale),
    metadata: h.metadata || null,
    catalogues: catalogues
      .filter((c) => String(c.heading_id) === String(h.id))
      .map(mapCatalogue),
    created_at: h.created_at,
    updated_at: h.updated_at,
  };
}

function mapCatalogue(c: CatalogueRow) {
  return {
    id: c.id,
    heading_id: c.heading_id,
    name: c.name,
    handle: c.handle,
    description: c.description || null,
    thumbnail: c.thumbnail || null,
    rank: Number(c.rank ?? 0),
    is_active: c.is_active !== false,
    metadata: c.metadata || null,
    created_at: c.created_at,
    updated_at: c.updated_at,
    product_count: c.product_count != null ? Number(c.product_count) : undefined,
  };
}

// GET /store/headings — returns all active headings with their nested catalogues
headingsRouter.get("/", async (req, res) => {
  try {
    const includeInactive = req.query.include_inactive === "true";
    const headingFilter = includeInactive ? "" : "WHERE is_active = true";
    const catalogueFilter = includeInactive ? "" : "WHERE c.is_active = true";

    const [headings, catalogues] = await Promise.all([
      query(
        `SELECT id, name, handle, description, rank, is_active, is_sale, metadata, created_at, updated_at
         FROM shop_heading ${headingFilter} ORDER BY rank, name`
      ),
      query(
        `SELECT c.id, c.heading_id, c.name, c.handle, c.description, c.thumbnail,
                c.rank, c.is_active, c.metadata, c.created_at, c.updated_at,
                (SELECT count(*) FROM shop_product_catalogue_map m WHERE m.catalogue_id = c.id) AS product_count
         FROM shop_catalogue c ${catalogueFilter} ORDER BY c.rank, c.name`
      ),
    ]);

    res.json({
      headings: headings.map((h) => mapHeading(h, catalogues)),
      count: headings.length,
    });
  } catch (err) {
    console.error("[headings list]", err);
    res.status(500).json({ type: "server_error", message: "Failed to list headings" });
  }
});

// GET /store/headings/:idOrHandle — single heading with catalogues
headingsRouter.get("/:idOrHandle", async (req, res) => {
  try {
    const { idOrHandle } = req.params;
    const headingRows = await query(
      `SELECT * FROM shop_heading WHERE (id = $1 OR handle = $1) AND is_active = true LIMIT 1`,
      [idOrHandle]
    );
    if (headingRows.length === 0) {
      res.status(404).json({ type: "not_found", message: "Heading not found" });
      return;
    }
    const heading = headingRows[0];
    const catalogues = await query(
      `SELECT c.id, c.heading_id, c.name, c.handle, c.description, c.thumbnail,
              c.rank, c.is_active, c.metadata, c.created_at, c.updated_at,
              (SELECT count(*) FROM shop_product_catalogue_map m WHERE m.catalogue_id = c.id) AS product_count
       FROM shop_catalogue c WHERE c.heading_id = $1 AND c.is_active = true ORDER BY c.rank, c.name`,
      [heading.id]
    );
    res.json({ heading: mapHeading(heading, catalogues) });
  } catch (err) {
    console.error("[heading by id/handle]", err);
    res.status(500).json({ type: "server_error", message: "Failed to fetch heading" });
  }
});
