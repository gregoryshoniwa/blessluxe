import { Router } from "express";
import { v4 as uuid } from "uuid";
import { query, queryOne, execute } from "../db/pool.ts";
import {
  generateImage,
  startVideoGeneration,
  pollVideoOperation,
  fetchAsInlinePart,
} from "../lib/google-ai.ts";

export const adminModelsRouter = Router();
const newId = (p: string) => `${p}_${uuid().replace(/-/g, "")}`;

// ─── List models ────────────────────────────────────────────────────────
adminModelsRouter.get("/models", async (_req, res) => {
  try {
    const rows = await query(
      `SELECT m.*,
              a.media_url     AS primary_media_url,
              a.thumbnail_url AS primary_thumbnail_url,
              a.media_type    AS primary_media_type,
              (SELECT count(*)::int FROM shop_model_asset WHERE model_id = m.id) AS asset_count
       FROM shop_model m
       LEFT JOIN shop_model_asset a ON a.id = m.primary_asset_id
       ORDER BY m.created_at DESC`
    );
    res.json({ models: rows });
  } catch (err) {
    console.error("[admin models list]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Detail with assets ─────────────────────────────────────────────────
adminModelsRouter.get("/models/:id", async (req, res) => {
  try {
    const model = await queryOne(`SELECT * FROM shop_model WHERE id = $1`, [
      req.params.id,
    ]);
    if (!model) return res.status(404).json({ error: "Not found" });
    const assets = await query(
      `SELECT * FROM shop_model_asset WHERE model_id = $1 ORDER BY position, created_at`,
      [req.params.id]
    );
    res.json({ model: { ...model, assets } });
  } catch (err) {
    console.error("[admin model detail]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Create / update / delete ───────────────────────────────────────────
adminModelsRouter.post("/models", async (req, res) => {
  try {
    const b = req.body as {
      name: string;
      description?: string;
      gender?: string;
      age_range?: string;
      ethnicity?: string;
      prompt_template?: string;
    };
    if (!b.name?.trim()) return res.status(400).json({ error: "name required" });
    const id = newId("model");
    await execute(
      `INSERT INTO shop_model (id, name, description, gender, age_range, ethnicity, prompt_template)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        id,
        b.name.trim(),
        b.description?.trim() || null,
        b.gender?.trim() || null,
        b.age_range?.trim() || null,
        b.ethnicity?.trim() || null,
        b.prompt_template?.trim() || null,
      ]
    );
    const row = await queryOne(`SELECT * FROM shop_model WHERE id = $1`, [id]);
    res.status(201).json({ model: row });
  } catch (err) {
    console.error("[admin model create]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminModelsRouter.patch("/models/:id", async (req, res) => {
  try {
    const b = req.body as Partial<Record<string, unknown>>;
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    const set = (col: string, val: unknown) => {
      sets.push(`${col} = $${i++}`);
      params.push(val);
    };
    if (b.name !== undefined) set("name", String(b.name).trim());
    if (b.description !== undefined)
      set("description", b.description ? String(b.description).trim() : null);
    if (b.gender !== undefined) set("gender", b.gender ? String(b.gender) : null);
    if (b.age_range !== undefined)
      set("age_range", b.age_range ? String(b.age_range) : null);
    if (b.ethnicity !== undefined)
      set("ethnicity", b.ethnicity ? String(b.ethnicity) : null);
    if (b.prompt_template !== undefined)
      set("prompt_template", b.prompt_template ? String(b.prompt_template) : null);
    if (b.is_active !== undefined) set("is_active", Boolean(b.is_active));
    if (b.primary_asset_id !== undefined)
      set("primary_asset_id", b.primary_asset_id || null);
    if (sets.length > 0) {
      sets.push("updated_at = NOW()");
      params.push(req.params.id);
      await execute(`UPDATE shop_model SET ${sets.join(", ")} WHERE id = $${i}`, params);
    }
    const row = await queryOne(`SELECT * FROM shop_model WHERE id = $1`, [req.params.id]);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ model: row });
  } catch (err) {
    console.error("[admin model update]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminModelsRouter.delete("/models/:id", async (req, res) => {
  try {
    await execute(`DELETE FROM shop_model WHERE id = $1`, [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error("[admin model delete]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Add asset via direct upload URL (already on /uploads) ──────────────
adminModelsRouter.post("/models/:id/assets", async (req, res) => {
  try {
    const b = req.body as {
      media_url: string;
      thumbnail_url?: string;
      media_type?: string;
      caption?: string;
      source_kind?: string;
    };
    if (!b.media_url?.trim()) return res.status(400).json({ error: "media_url required" });
    const model = await queryOne(`SELECT id, primary_asset_id FROM shop_model WHERE id = $1`, [
      req.params.id,
    ]);
    if (!model) return res.status(404).json({ error: "Model not found" });
    const id = newId("masset");
    await execute(
      `INSERT INTO shop_model_asset
        (id, model_id, source_kind, media_type, media_url, thumbnail_url, caption, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ready')`,
      [
        id,
        req.params.id,
        b.source_kind || "upload",
        b.media_type || "image",
        b.media_url,
        b.thumbnail_url || null,
        b.caption?.trim() || null,
      ]
    );
    // First asset becomes primary automatically.
    if (!model.primary_asset_id) {
      await execute(`UPDATE shop_model SET primary_asset_id = $1 WHERE id = $2`, [
        id,
        req.params.id,
      ]);
    }
    const row = await queryOne(`SELECT * FROM shop_model_asset WHERE id = $1`, [id]);
    res.status(201).json({ asset: row });
  } catch (err) {
    console.error("[admin model add asset]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Generate a new IMAGE for this model (Nano Banana) ──────────────────
adminModelsRouter.post("/models/:id/assets/generate-image", async (req, res) => {
  try {
    const b = req.body as {
      prompt?: string;
      pose?: string;
      angle?: string;
      lighting?: string;
      backdrop?: string;
      use_existing_as_reference?: boolean;
    };
    const model = await queryOne(`SELECT * FROM shop_model WHERE id = $1`, [
      req.params.id,
    ]);
    if (!model) return res.status(404).json({ error: "Model not found" });

    const identityPrompt =
      (model.prompt_template as string)?.trim() ||
      [
        model.gender && `${model.gender}`,
        model.age_range && `aged ${model.age_range}`,
        model.ethnicity && `${model.ethnicity}`,
      ]
        .filter(Boolean)
        .join(", ") ||
      (model.description as string) ||
      "BLESSLUXE house model";

    const extras = [
      b.pose && `pose: ${b.pose}`,
      b.angle && `camera angle: ${b.angle}`,
      b.lighting && `lighting: ${b.lighting}`,
      b.backdrop && `backdrop: ${b.backdrop}`,
    ]
      .filter(Boolean)
      .join("; ");

    const prompt = [
      "Generate a high-end editorial fashion photograph (16:9).",
      `Subject: ${identityPrompt}.`,
      "Keep the same facial identity if a reference image is provided — do not invent a new face.",
      extras,
      b.prompt?.trim(),
      "Use cinematic luxury lighting, soft cream and gold palette, 50mm lens look, gentle film grain. No text overlays.",
    ]
      .filter(Boolean)
      .join(" ");

    // Inline existing assets as identity references when requested (or by default).
    let referenceParts: Awaited<ReturnType<typeof fetchAsInlinePart>>[] = [];
    if (b.use_existing_as_reference !== false) {
      const refs = await query(
        `SELECT media_url FROM shop_model_asset
          WHERE model_id = $1 AND media_type = 'image' AND status = 'ready'
          ORDER BY position, created_at LIMIT 3`,
        [req.params.id]
      );
      const parts = await Promise.all(
        refs.map((r) => fetchAsInlinePart(String(r.media_url)))
      );
      referenceParts = parts.filter(Boolean);
    }

    const generated = await generateImage({
      prompt,
      referenceParts: referenceParts.filter(Boolean) as Awaited<
        ReturnType<typeof fetchAsInlinePart>
      >[] as never,
      hint: `model-${(model.name as string).toLowerCase().replace(/\s+/g, "-")}`,
    });

    const id = newId("masset");
    await execute(
      `INSERT INTO shop_model_asset
        (id, model_id, source_kind, media_type, media_url, caption, prompt,
         generation_meta, status)
       VALUES ($1, $2, 'generated_image', 'image', $3, $4, $5, $6, 'ready')`,
      [
        id,
        req.params.id,
        generated.url,
        b.pose || b.angle || "Generated angle",
        prompt,
        JSON.stringify({ mimeType: generated.mimeType, model: process.env.GOOGLE_NANO_BANANA_MODEL }),
      ]
    );
    if (!model.primary_asset_id) {
      await execute(`UPDATE shop_model SET primary_asset_id = $1 WHERE id = $2`, [
        id,
        req.params.id,
      ]);
    }
    const row = await queryOne(`SELECT * FROM shop_model_asset WHERE id = $1`, [id]);
    res.status(201).json({ asset: row });
  } catch (err) {
    console.error("[admin model gen image]", err);
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "Generation failed" });
  }
});

// ─── Kick off VEO video generation (returns immediately, async) ─────────
adminModelsRouter.post("/models/:id/assets/generate-video", async (req, res) => {
  try {
    const b = req.body as {
      prompt?: string;
      duration_seconds?: number;
      aspect_ratio?: "16:9" | "9:16" | "1:1";
      reference_asset_id?: string;
    };
    const model = await queryOne(`SELECT * FROM shop_model WHERE id = $1`, [
      req.params.id,
    ]);
    if (!model) return res.status(404).json({ error: "Model not found" });

    // Resolve identity-reference image: explicit choice → model primary →
    // first ready image asset. Veo without a reference invents a new face,
    // so this chain is what keeps the character consistent across clips.
    let refAsset: Record<string, unknown> | null = null;
    if (b.reference_asset_id) {
      refAsset = await queryOne(
        `SELECT media_url FROM shop_model_asset
          WHERE id = $1 AND media_type = 'image' AND status = 'ready'`,
        [b.reference_asset_id]
      );
    }
    if (!refAsset && model.primary_asset_id) {
      refAsset = await queryOne(
        `SELECT media_url FROM shop_model_asset
          WHERE id = $1 AND media_type = 'image' AND status = 'ready'`,
        [model.primary_asset_id]
      );
    }
    if (!refAsset) {
      refAsset = await queryOne(
        `SELECT media_url FROM shop_model_asset
          WHERE model_id = $1 AND media_type = 'image' AND status = 'ready'
          ORDER BY position, created_at LIMIT 1`,
        [req.params.id]
      );
    }

    let imageReference: { mimeType: string; base64: string } | undefined;
    if (refAsset) {
      const part = await fetchAsInlinePart(String(refAsset.media_url));
      if (part) {
        imageReference = {
          mimeType: part.inlineData.mimeType,
          base64: part.inlineData.data,
        };
      }
    }

    const identityPrompt =
      (model.prompt_template as string)?.trim() ||
      [model.gender, model.age_range && `aged ${model.age_range}`, model.ethnicity]
        .filter(Boolean)
        .join(", ") ||
      "BLESSLUXE house model";

    // Emphasise identity-lock when we have a reference image. Veo will
    // otherwise treat the image as a scene starter rather than an identity
    // anchor and drift to a different face mid-clip.
    const identityLock = imageReference
      ? "Critical: the reference image shows the exact subject. Preserve the same facial structure, skin tone, hair, and body proportions throughout the entire clip. Do not invent a different person."
      : "";

    const prompt = [
      `8-second cinematic editorial fashion video.`,
      `Subject: ${identityPrompt}.`,
      identityLock,
      "Slow dolly shot, warm cinematic grade, soft golden lighting, ambient luxury vibe.",
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

    const id = newId("masset");
    await execute(
      `INSERT INTO shop_model_asset
        (id, model_id, source_kind, media_type, media_url, prompt,
         generation_meta, status, operation_name)
       VALUES ($1, $2, 'generated_video', 'video', $3, $4, $5, 'pending', $6)`,
      [
        id,
        req.params.id,
        "", // filled when ready
        prompt,
        JSON.stringify({ model: process.env.GOOGLE_VEO_MODEL, aspectRatio: b.aspect_ratio || "16:9" }),
        op.operationName,
      ]
    );
    const row = await queryOne(`SELECT * FROM shop_model_asset WHERE id = $1`, [id]);
    res.status(202).json({ asset: row, message: "Generation started — poll for completion." });
  } catch (err) {
    console.error("[admin model gen video]", err);
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "Generation failed" });
  }
});

// ─── Poll a pending video asset and update it when ready ────────────────
adminModelsRouter.post("/models/:id/assets/:assetId/poll", async (req, res) => {
  try {
    const asset = await queryOne(
      `SELECT * FROM shop_model_asset WHERE id = $1 AND model_id = $2`,
      [req.params.assetId, req.params.id]
    );
    if (!asset) return res.status(404).json({ error: "Asset not found" });
    if (asset.status !== "pending" || !asset.operation_name) {
      return res.json({ asset });
    }
    const result = await pollVideoOperation(
      String(asset.operation_name),
      `model-video-${(asset.model_id as string).slice(0, 8)}`
    );
    if (!result.done) return res.json({ asset, done: false });
    if (result.error) {
      await execute(
        `UPDATE shop_model_asset
            SET status = 'failed', status_message = $1, updated_at = NOW()
          WHERE id = $2`,
        [result.error, asset.id]
      );
    } else {
      await execute(
        `UPDATE shop_model_asset
            SET status = 'ready', media_url = $1, updated_at = NOW()
          WHERE id = $2`,
        [result.url || "", asset.id]
      );
    }
    const updated = await queryOne(`SELECT * FROM shop_model_asset WHERE id = $1`, [
      asset.id,
    ]);
    res.json({ asset: updated, done: true });
  } catch (err) {
    console.error("[admin model poll]", err);
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "Poll failed" });
  }
});

adminModelsRouter.delete("/models/:id/assets/:assetId", async (req, res) => {
  try {
    await execute(`DELETE FROM shop_model_asset WHERE id = $1 AND model_id = $2`, [
      req.params.assetId,
      req.params.id,
    ]);
    res.json({ deleted: true });
  } catch (err) {
    console.error("[admin model delete asset]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminModelsRouter.post("/models/:id/assets/:assetId/primary", async (req, res) => {
  try {
    await execute(`UPDATE shop_model SET primary_asset_id = $1 WHERE id = $2`, [
      req.params.assetId,
      req.params.id,
    ]);
    const row = await queryOne(`SELECT * FROM shop_model WHERE id = $1`, [req.params.id]);
    res.json({ model: row });
  } catch (err) {
    console.error("[admin model set primary]", err);
    res.status(500).json({ error: "Failed" });
  }
});
