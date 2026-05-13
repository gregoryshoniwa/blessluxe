import { Router } from "express";
import { v4 as uuid } from "uuid";
import { query, queryOne, execute } from "../db/pool.ts";
import { resolveCustomerId } from "./customer-auth.ts";

export const storePackCampaignsRouter = Router();

const newId = (p: string) => `${p}_${uuid().replace(/-/g, "")}`;

/** Short customer-friendly campaign code: BLP-XXXX-XXXX */
function generatePublicCode(): string {
  const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ0123456789"; // dropped I, L, O, U for legibility
  const block = () =>
    Array.from(
      { length: 4 },
      () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
    ).join("");
  return `BLP-${block()}-${block()}`;
}

/**
 * Host a new campaign as a customer. Requires a published pack_definition.
 * Creates one slot per variant of the underlying product and returns the
 * shareable public_code so the host can invite others to claim slots.
 */
storePackCampaignsRouter.post("/host", async (req, res) => {
  try {
    const customerId = await resolveCustomerId(req.headers.authorization);
    if (!customerId) {
      return res.status(401).json({ error: "Sign in to host a pack" });
    }
    const b = req.body as {
      pack_definition_id: string;
      title?: string;
      expires_at?: string;
    };
    if (!b.pack_definition_id?.trim()) {
      return res.status(400).json({ error: "pack_definition_id required" });
    }
    const def = await queryOne(
      `SELECT * FROM pack_definition
        WHERE id = $1 AND deleted_at IS NULL AND status = 'published'`,
      [b.pack_definition_id]
    );
    if (!def) {
      return res.status(400).json({
        error: "Pack is not currently available for hosting",
      });
    }
    // For multi-product packs we sweep variants across every linked product;
    // single packs fall back to the legacy product_id column. pov.value is
    // the actual size label — vov is only the variant↔option-value join.
    const variants = await query(
      `SELECT v.id, v.title, v.product_id, MAX(pov.value) AS size_value
         FROM shop_product_variant v
         LEFT JOIN shop_variant_option_value vov ON vov.variant_id = v.id
         LEFT JOIN shop_product_option_value pov ON pov.id = vov.option_value_id
         LEFT JOIN shop_product_option po
           ON po.id = pov.option_id AND LOWER(po.title) IN ('size', 'sizes')
        WHERE v.product_id IN (
          SELECT product_id FROM pack_definition_product WHERE pack_definition_id = $1
          UNION
          SELECT $2::text WHERE $2::text IS NOT NULL
        )
        GROUP BY v.id`,
      [def.id, def.product_id]
    );
    if (variants.length === 0) {
      return res.status(400).json({ error: "Pack products have no variants" });
    }

    // Generate a unique public code (retry on rare collision).
    let publicCode = generatePublicCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const exists = await queryOne(
        `SELECT id FROM pack_campaign WHERE public_code = $1 AND deleted_at IS NULL`,
        [publicCode]
      );
      if (!exists) break;
      publicCode = generatePublicCode();
    }

    const campaignId = newId("packcamp");
    await execute(
      `INSERT INTO pack_campaign
        (id, pack_definition_id, host_kind, customer_id, public_code, status,
         expires_at, title)
       VALUES ($1,$2,'customer',$3,$4,'open',$5,$6)`,
      [
        campaignId,
        def.id,
        customerId,
        publicCode,
        b.expires_at || null,
        b.title?.trim() || `${def.title} — group buy`,
      ]
    );
    for (const v of variants) {
      await execute(
        `INSERT INTO pack_slot (id, pack_campaign_id, variant_id, size_label, status)
         VALUES ($1,$2,$3,$4,'available')`,
        [
          newId("packslot"),
          campaignId,
          v.id,
          String(v.size_value || v.title || "One size"),
        ]
      );
    }
    const campaign = await queryOne(
      `SELECT * FROM pack_campaign WHERE id = $1`,
      [campaignId]
    );
    res.status(201).json({ campaign, public_code: publicCode });
  } catch (err) {
    console.error("[store pack-campaigns host]", err);
    const message = err instanceof Error ? err.message : "Failed to host pack";
    res.status(500).json({ error: message });
  }
});

/** Campaigns the authenticated customer hosts. */
storePackCampaignsRouter.get("/hosted", async (req, res) => {
  try {
    const customerId = await resolveCustomerId(req.headers.authorization);
    if (!customerId) return res.status(401).json({ error: "Not authenticated" });
    const rows = await query(
      `SELECT c.id, c.public_code, c.title, c.status, c.created_at, c.expires_at,
              d.title AS pack_title, d.handle AS pack_handle, d.product_id,
              (SELECT count(*)::int FROM pack_slot WHERE pack_campaign_id = c.id) AS slot_count,
              (SELECT count(*)::int FROM pack_slot
                WHERE pack_campaign_id = c.id AND status IN ('paid','reserved')) AS claimed_count
         FROM pack_campaign c
         JOIN pack_definition d ON d.id = c.pack_definition_id
        WHERE c.customer_id = $1 AND c.deleted_at IS NULL
        ORDER BY c.created_at DESC
        LIMIT 100`,
      [customerId]
    );
    res.json({ campaigns: rows });
  } catch (err) {
    console.error("[store pack-campaigns hosted]", err);
    res.status(500).json({ error: "Failed" });
  }
});

/** Public lookup by code so anyone with a share link can join. */
storePackCampaignsRouter.get("/by-code/:code", async (req, res) => {
  try {
    const code = String(req.params.code || "").toUpperCase().trim();
    const campaign = await queryOne(
      `SELECT c.*, d.title AS pack_title, d.handle AS pack_handle,
              d.description AS pack_description, d.product_id
         FROM pack_campaign c
         JOIN pack_definition d ON d.id = c.pack_definition_id
        WHERE c.public_code = $1 AND c.deleted_at IS NULL`,
      [code]
    );
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    const slots = await query(
      `SELECT id, variant_id, size_label, status, customer_id
         FROM pack_slot
        WHERE pack_campaign_id = $1 AND deleted_at IS NULL
        ORDER BY size_label`,
      [campaign.id]
    );
    res.json({ campaign: { ...campaign, slots } });
  } catch (err) {
    console.error("[store pack-campaigns by-code]", err);
    res.status(500).json({ error: "Failed" });
  }
});
