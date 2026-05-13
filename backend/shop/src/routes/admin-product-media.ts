import { Router } from "express";
import { v4 as uuid } from "uuid";
import { query, queryOne, execute } from "../db/pool.ts";
import {
  generateImage,
  startVideoGeneration,
  pollVideoOperation,
  fetchAsInlinePart,
} from "../lib/google-ai.ts";

export const adminProductMediaRouter = Router();
const newId = (p: string) => `${p}_${uuid().replace(/-/g, "")}`;

// ─── List media for a product ───────────────────────────────────────────
adminProductMediaRouter.get("/products/:id/media", async (req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM shop_product_media
        WHERE product_id = $1
        ORDER BY position, created_at`,
      [req.params.id]
    );
    res.json({ media: rows });
  } catch (err) {
    console.error("[admin product media list]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Attach an uploaded asset directly ──────────────────────────────────
adminProductMediaRouter.post("/products/:id/media", async (req, res) => {
  try {
    const b = req.body as {
      media_url: string;
      thumbnail_url?: string;
      media_type?: string;
      alt_text?: string;
      is_primary?: boolean;
      position?: number;
    };
    if (!b.media_url?.trim()) return res.status(400).json({ error: "media_url required" });
    const exists = await queryOne(`SELECT id FROM shop_product WHERE id = $1`, [
      req.params.id,
    ]);
    if (!exists) return res.status(404).json({ error: "Product not found" });

    if (b.is_primary) {
      await execute(
        `UPDATE shop_product_media SET is_primary = false WHERE product_id = $1`,
        [req.params.id]
      );
    }
    const id = newId("pmed");
    await execute(
      `INSERT INTO shop_product_media
        (id, product_id, media_type, media_url, thumbnail_url, alt_text,
         source_kind, is_primary, position, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'upload', $7, $8, 'ready')`,
      [
        id,
        req.params.id,
        b.media_type || "image",
        b.media_url,
        b.thumbnail_url || null,
        b.alt_text?.trim() || null,
        Boolean(b.is_primary),
        Number.isFinite(b.position) ? b.position : 0,
      ]
    );
    const row = await queryOne(`SELECT * FROM shop_product_media WHERE id = $1`, [id]);
    res.status(201).json({ media: row });
  } catch (err) {
    console.error("[admin product media create]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Generate IMAGE of model wearing this product (Nano Banana) ─────────
adminProductMediaRouter.post(
  "/products/:id/media/generate-image",
  async (req, res) => {
    try {
      const b = req.body as {
        model_id?: string;
        prompt?: string;
        angle?: string;
        scene?: string;
      };
      const product = await queryOne(
        `SELECT id, title, description FROM shop_product WHERE id = $1`,
        [req.params.id]
      );
      if (!product) return res.status(404).json({ error: "Product not found" });

      let modelRefParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
      let modelIdentity = "";
      if (b.model_id) {
        const model = await queryOne(`SELECT * FROM shop_model WHERE id = $1`, [b.model_id]);
        if (!model) return res.status(400).json({ error: "Model not found" });
        modelIdentity =
          (model.prompt_template as string)?.trim() ||
          [model.gender, model.age_range && `aged ${model.age_range}`, model.ethnicity]
            .filter(Boolean)
            .join(", ") ||
          (model.description as string) ||
          "";
        const refs = await query(
          `SELECT media_url FROM shop_model_asset
            WHERE model_id = $1 AND media_type = 'image' AND status = 'ready'
            ORDER BY position, created_at LIMIT 3`,
          [b.model_id]
        );
        const parts = await Promise.all(
          refs.map((r) => fetchAsInlinePart(String(r.media_url)))
        );
        modelRefParts = parts.filter(Boolean) as never;
      }

      // Inline an existing product image (if any) as wardrobe reference.
      const productImg = await queryOne(
        `SELECT media_url FROM shop_product_media
          WHERE product_id = $1 AND media_type = 'image' AND status = 'ready'
          ORDER BY is_primary DESC, position ASC, created_at ASC LIMIT 1`,
        [req.params.id]
      );
      const productRef = productImg
        ? await fetchAsInlinePart(String(productImg.media_url))
        : null;

      const prompt = [
        "Generate a luxury fashion campaign image (16:9).",
        modelIdentity ? `Subject: ${modelIdentity}.` : "",
        "Identity lock: if reference images of the subject are provided, preserve facial features exactly. Do not invent a new person.",
        `Outfit: ${product.title}${product.description ? ` — ${product.description}` : ""}.`,
        "Wardrobe transfer: if a product reference image is provided, dress the subject in that exact garment, preserving silhouette, fabric, and details.",
        b.angle && `Camera angle: ${b.angle}.`,
        b.scene && `Setting / scene: ${b.scene}.`,
        b.prompt?.trim(),
        "Use cinematic luxury lighting, soft cream and gold palette, sharp wardrobe detail, 50mm lens look, gentle film grain. No text overlays. Output a polished photo, not commentary.",
      ]
        .filter(Boolean)
        .join(" ");

      const refs = [...modelRefParts];
      if (productRef) refs.push(productRef);

      const generated = await generateImage({
        prompt,
        referenceParts: refs,
        hint: `prod-${(product.title as string).toLowerCase().replace(/\s+/g, "-").slice(0, 24)}`,
      });

      const id = newId("pmed");
      await execute(
        `INSERT INTO shop_product_media
          (id, product_id, media_type, media_url, source_kind, source_model_id,
           prompt, generation_meta, status, position)
         VALUES ($1, $2, 'image', $3, 'generated_image', $4, $5, $6, 'ready',
           COALESCE((SELECT MAX(position)+1 FROM shop_product_media WHERE product_id = $2), 0))`,
        [
          id,
          req.params.id,
          generated.url,
          b.model_id || null,
          prompt,
          JSON.stringify({ mimeType: generated.mimeType, model: process.env.GOOGLE_NANO_BANANA_MODEL }),
        ]
      );
      const row = await queryOne(`SELECT * FROM shop_product_media WHERE id = $1`, [id]);
      res.status(201).json({ media: row });
    } catch (err) {
      console.error("[admin product media gen image]", err);
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : "Generation failed" });
    }
  }
);

// ─── Kick off VIDEO of model wearing this product (Veo 3) ───────────────
adminProductMediaRouter.post(
  "/products/:id/media/generate-video",
  async (req, res) => {
    try {
      const b = req.body as {
        model_id?: string;
        reference_asset_id?: string;
        prompt?: string;
        duration_seconds?: number;
        aspect_ratio?: "16:9" | "9:16" | "1:1";
      };
      const product = await queryOne(
        `SELECT id, title, description FROM shop_product WHERE id = $1`,
        [req.params.id]
      );
      if (!product) return res.status(404).json({ error: "Product not found" });

      let modelIdentity = "";
      let imageReference: { mimeType: string; base64: string } | undefined;

      if (b.model_id) {
        const model = await queryOne(`SELECT * FROM shop_model WHERE id = $1`, [b.model_id]);
        if (model) {
          modelIdentity =
            (model.prompt_template as string)?.trim() ||
            [model.gender, model.age_range && `aged ${model.age_range}`, model.ethnicity]
              .filter(Boolean)
              .join(", ") ||
            "";
        }
      }

      // Prefer caller-specified reference, then product image, then model asset.
      let refUrl: string | null = null;
      if (b.reference_asset_id) {
        const r = await queryOne(
          `SELECT media_url FROM shop_product_media
            WHERE id = $1 AND media_type = 'image' AND product_id = $2`,
          [b.reference_asset_id, req.params.id]
        );
        if (r) refUrl = String(r.media_url);
      }
      if (!refUrl) {
        const r = await queryOne(
          `SELECT media_url FROM shop_product_media
            WHERE product_id = $1 AND media_type = 'image' AND status = 'ready'
            ORDER BY is_primary DESC, position ASC, created_at ASC LIMIT 1`,
          [req.params.id]
        );
        if (r) refUrl = String(r.media_url);
      }
      if (!refUrl && b.model_id) {
        const r = await queryOne(
          `SELECT media_url FROM shop_model_asset
            WHERE model_id = $1 AND media_type = 'image' AND status = 'ready'
            ORDER BY position, created_at LIMIT 1`,
          [b.model_id]
        );
        if (r) refUrl = String(r.media_url);
      }
      if (refUrl) {
        const part = await fetchAsInlinePart(refUrl);
        if (part) {
          imageReference = {
            mimeType: part.inlineData.mimeType,
            base64: part.inlineData.data,
          };
        }
      }

      const identityLock = imageReference
        ? "Critical: the reference image shows the exact subject. Preserve the same facial structure, skin tone, hair, and body proportions throughout the entire clip. Do not invent a different person. Dress the subject in the garment described below — do not change the garment to something else."
        : "";

      const prompt = [
        `8-second cinematic fashion campaign video.`,
        modelIdentity ? `Subject: ${modelIdentity}.` : "",
        identityLock,
        `Featuring: ${product.title}${product.description ? ` — ${product.description}` : ""}.`,
        "Slow elegant motion: a gentle dolly + reveal of the garment, warm cinematic grade, soft directional light, luxury atmosphere.",
        b.prompt?.trim(),
      ]
        .filter(Boolean)
        .join(" ");

      const op = await startVideoGeneration({
        prompt,
        imageReference,
        aspectRatio: b.aspect_ratio || "16:9",
        durationSeconds: b.duration_seconds || 8,
      });

      const id = newId("pmed");
      await execute(
        `INSERT INTO shop_product_media
          (id, product_id, media_type, media_url, source_kind, source_model_id,
           prompt, generation_meta, status, operation_name, position)
         VALUES ($1, $2, 'video', $3, 'generated_video', $4, $5, $6, 'pending', $7,
           COALESCE((SELECT MAX(position)+1 FROM shop_product_media WHERE product_id = $2), 0))`,
        [
          id,
          req.params.id,
          "",
          b.model_id || null,
          prompt,
          JSON.stringify({
            model: process.env.GOOGLE_VEO_MODEL,
            aspectRatio: b.aspect_ratio || "16:9",
          }),
          op.operationName,
        ]
      );
      const row = await queryOne(`SELECT * FROM shop_product_media WHERE id = $1`, [id]);
      res.status(202).json({ media: row, message: "Generation started — poll for completion." });
    } catch (err) {
      console.error("[admin product media gen video]", err);
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : "Generation failed" });
    }
  }
);

// ─── Poll a pending video and update it when ready ──────────────────────
adminProductMediaRouter.post(
  "/products/:id/media/:mediaId/poll",
  async (req, res) => {
    try {
      const m = await queryOne(
        `SELECT * FROM shop_product_media WHERE id = $1 AND product_id = $2`,
        [req.params.mediaId, req.params.id]
      );
      if (!m) return res.status(404).json({ error: "Media not found" });
      if (m.status !== "pending" || !m.operation_name) return res.json({ media: m });
      const result = await pollVideoOperation(
        String(m.operation_name),
        `prod-video-${(m.product_id as string).slice(0, 8)}`
      );
      if (!result.done) return res.json({ media: m, done: false });
      if (result.error) {
        await execute(
          `UPDATE shop_product_media SET status='failed', status_message=$1, updated_at=NOW()
            WHERE id=$2`,
          [result.error, m.id]
        );
      } else {
        await execute(
          `UPDATE shop_product_media SET status='ready', media_url=$1, updated_at=NOW()
            WHERE id=$2`,
          [result.url || "", m.id]
        );
      }
      const updated = await queryOne(`SELECT * FROM shop_product_media WHERE id = $1`, [
        m.id,
      ]);
      res.json({ media: updated, done: true });
    } catch (err) {
      console.error("[admin product media poll]", err);
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : "Poll failed" });
    }
  }
);

// ─── Update / reorder / mark primary ────────────────────────────────────
adminProductMediaRouter.patch("/products/:id/media/:mediaId", async (req, res) => {
  try {
    const b = req.body as Partial<Record<string, unknown>>;
    if (b.is_primary === true) {
      await execute(
        `UPDATE shop_product_media SET is_primary = false WHERE product_id = $1`,
        [req.params.id]
      );
    }
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    const set = (col: string, val: unknown) => {
      sets.push(`${col} = $${i++}`);
      params.push(val);
    };
    if (b.media_type !== undefined) set("media_type", String(b.media_type));
    if (b.thumbnail_url !== undefined)
      set("thumbnail_url", b.thumbnail_url ? String(b.thumbnail_url) : null);
    if (b.alt_text !== undefined) set("alt_text", b.alt_text ? String(b.alt_text) : null);
    if (b.is_primary !== undefined) set("is_primary", Boolean(b.is_primary));
    if (b.position !== undefined) set("position", Number(b.position));
    if (sets.length > 0) {
      sets.push("updated_at = NOW()");
      params.push(req.params.mediaId);
      params.push(req.params.id);
      await execute(
        `UPDATE shop_product_media SET ${sets.join(", ")} WHERE id = $${i} AND product_id = $${i + 1}`,
        params
      );
    }
    const row = await queryOne(`SELECT * FROM shop_product_media WHERE id = $1`, [
      req.params.mediaId,
    ]);
    res.json({ media: row });
  } catch (err) {
    console.error("[admin product media update]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminProductMediaRouter.delete("/products/:id/media/:mediaId", async (req, res) => {
  try {
    await execute(
      `DELETE FROM shop_product_media WHERE id = $1 AND product_id = $2`,
      [req.params.mediaId, req.params.id]
    );
    res.json({ deleted: true });
  } catch (err) {
    console.error("[admin product media delete]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Reorder a list of media in one shot ───────────────────────────────
adminProductMediaRouter.post("/products/:id/media/reorder", async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : [];
    let i = 0;
    for (const id of ids) {
      await execute(
        `UPDATE shop_product_media SET position = $1, updated_at = NOW()
          WHERE id = $2 AND product_id = $3`,
        [i++, id, req.params.id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin product media reorder]", err);
    res.status(500).json({ error: "Failed" });
  }
});
