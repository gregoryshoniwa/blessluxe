/**
 * Thin wrapper over Google AI Studio REST endpoints used by the avatar /
 * product-media generators. We talk to the API by raw fetch so we don't
 * need to introduce a new SDK dependency.
 *
 * - Image generation: `gemini-2.5-flash-image-preview` (Nano Banana). Returns
 *   base64 image bytes synchronously.
 * - Video generation: `veo-3.0-generate-001`. Returns a long-running
 *   operation name that must be polled until the result is ready.
 *
 * Configure via env:
 *   GOOGLE_AI_API_KEY           — the API key
 *   GOOGLE_NANO_BANANA_MODEL    — override the image model (optional)
 *   GOOGLE_VEO_MODEL            — override the video model (optional)
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { v4 as uuid } from "uuid";

const GEN_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export interface GeneratedImage {
  /** Public URL the storefront can serve. */
  url: string;
  /** Path on disk for cleanup if needed. */
  filename: string;
  /** Mime type as reported by the API. */
  mimeType: string;
}

export interface GeneratedVideo {
  operationName: string;
}

export interface VideoPollResult {
  done: boolean;
  url?: string;
  filename?: string;
  error?: string;
}

interface GeminiInlinePart {
  inlineData: { mimeType: string; data: string };
}

interface GeminiTextPart {
  text: string;
}

type GeminiPart = GeminiInlinePart | GeminiTextPart;

function requireKey(): string {
  const k = (process.env.GOOGLE_AI_API_KEY || "").trim();
  if (!k) throw new Error("GOOGLE_AI_API_KEY is not set");
  return k;
}

function imageModel(): string {
  return (process.env.GOOGLE_NANO_BANANA_MODEL || "gemini-2.5-flash-image-preview").trim();
}

function videoModel(): string {
  return (process.env.GOOGLE_VEO_MODEL || "veo-3.0-generate-001").trim();
}

function uploadDir(): string {
  return process.env.UPLOAD_DIR || "./uploads";
}

/** Persist base64 bytes to /uploads and return a public URL. */
export async function persistBase64(
  base64: string,
  mimeType: string,
  hint = "ai"
): Promise<{ url: string; filename: string }> {
  const ext =
    mimeType.includes("png")
      ? ".png"
      : mimeType.includes("jpeg") || mimeType.includes("jpg")
        ? ".jpg"
        : mimeType.includes("webp")
          ? ".webp"
          : mimeType.includes("mp4")
            ? ".mp4"
            : ".bin";
  const filename = `${hint}-${uuid()}${ext}`;
  const dir = uploadDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), Buffer.from(base64, "base64"));
  return { url: `/uploads/${filename}`, filename };
}

/** Fetch a remote image and inline it as a Gemini image part. */
export async function fetchAsInlinePart(
  url: string
): Promise<GeminiInlinePart | null> {
  try {
    // Same-origin uploads can be passed by path.
    let absolute = url;
    if (absolute.startsWith("/uploads/")) {
      const file = path.join(uploadDir(), absolute.slice("/uploads/".length));
      const buf = await fs.readFile(file);
      const ext = path.extname(file).toLowerCase();
      const mime =
        ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
      return { inlineData: { mimeType: mime, data: buf.toString("base64") } };
    }
    const res = await fetch(absolute);
    if (!res.ok) return null;
    const mime = res.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    return { inlineData: { mimeType: mime, data: buf.toString("base64") } };
  } catch {
    return null;
  }
}

/**
 * Generate an image with Nano Banana. Returns the persisted public URL.
 * Pass `referenceParts` to use existing images as identity / wardrobe refs.
 */
export async function generateImage(opts: {
  prompt: string;
  referenceParts?: GeminiInlinePart[];
  hint?: string;
}): Promise<GeneratedImage> {
  const key = requireKey();
  const model = imageModel();
  const parts: GeminiPart[] = [{ text: opts.prompt }];
  if (opts.referenceParts) {
    for (const p of opts.referenceParts) parts.push(p);
  }

  const res = await fetch(
    `${GEN_API_BASE}/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    }
  );
  const raw = await res.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { error: { message: raw } };
  }
  if (!res.ok) {
    const errorMessage =
      ((payload.error as Record<string, unknown>)?.message as string) ||
      `Gemini image API returned ${res.status}`;
    throw new Error(errorMessage);
  }

  // Walk the candidates for the first inlineData image.
  const candidates = (payload.candidates as Array<Record<string, unknown>>) || [];
  for (const c of candidates) {
    const cParts = ((c.content as Record<string, unknown>)?.parts as Array<Record<string, unknown>>) || [];
    for (const p of cParts) {
      const inline = p.inlineData || p.inline_data;
      if (inline && typeof inline === "object") {
        const data = (inline as Record<string, unknown>).data as string;
        const mime = ((inline as Record<string, unknown>).mimeType as string) || "image/png";
        if (data) {
          const { url, filename } = await persistBase64(data, mime, opts.hint || "img");
          return { url, filename, mimeType: mime };
        }
      }
    }
  }

  throw new Error(
    "Gemini returned no image data — the model may not support image output. " +
      "Verify GOOGLE_NANO_BANANA_MODEL is an image-capable model."
  );
}

/**
 * Kick off a Veo 3 video generation. Returns the operation name to poll.
 * Pass an optional reference image to anchor the look.
 */
export async function startVideoGeneration(opts: {
  prompt: string;
  imageReference?: { mimeType: string; base64: string };
  aspectRatio?: "16:9" | "9:16" | "1:1";
  durationSeconds?: number;
}): Promise<GeneratedVideo> {
  const key = requireKey();
  const model = videoModel();
  const instance: Record<string, unknown> = { prompt: opts.prompt };
  if (opts.imageReference) {
    instance.image = {
      bytesBase64Encoded: opts.imageReference.base64,
      mimeType: opts.imageReference.mimeType,
    };
  }
  const body = {
    instances: [instance],
    parameters: {
      aspectRatio: opts.aspectRatio || "16:9",
      durationSeconds: opts.durationSeconds ?? 8,
      sampleCount: 1,
    },
  };
  const res = await fetch(
    `${GEN_API_BASE}/models/${model}:predictLongRunning?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const raw = await res.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { error: { message: raw } };
  }
  if (!res.ok) {
    const errorMessage =
      ((payload.error as Record<string, unknown>)?.message as string) ||
      `Veo predictLongRunning returned ${res.status}`;
    throw new Error(errorMessage);
  }
  const opName = String(payload.name || "");
  if (!opName) throw new Error("Veo response missing operation name");
  return { operationName: opName };
}

/**
 * Poll a Veo operation. When `done` flips true, the resulting video bytes are
 * downloaded, persisted to /uploads, and the URL is returned.
 */
export async function pollVideoOperation(
  operationName: string,
  hint = "video"
): Promise<VideoPollResult> {
  const key = requireKey();
  // Veo returns operation names like "models/veo-3.0-generate-001/operations/<id>"
  // — that's the full path under /v1beta/. Strip any leading slash and use as-is.
  const opPath = operationName.replace(/^\/+/, "");
  const res = await fetch(`${GEN_API_BASE}/${opPath}?key=${key}`);
  const raw = await res.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { error: { message: raw } };
  }
  if (!res.ok) {
    return {
      done: true,
      error:
        ((payload.error as Record<string, unknown>)?.message as string) ||
        `Veo operation poll returned ${res.status}`,
    };
  }
  if (!payload.done) return { done: false };

  const errorObj = payload.error as Record<string, unknown> | undefined;
  if (errorObj) {
    return { done: true, error: (errorObj.message as string) || "Veo generation failed" };
  }

  // Veo's payload shape varies between vertex-style and AI-Studio-style:
  //   response.generatedVideos[].video.uri              (most common)
  //   response.predictions[].bytesBase64Encoded         (legacy vertex)
  //   response.generateVideoResponse.generatedSamples[] (vertex prediction)
  const response = (payload.response as Record<string, unknown>) || {};
  const predictions =
    (response.generatedVideos as Array<Record<string, unknown>>) ||
    (response.predictions as Array<Record<string, unknown>>) ||
    ((response.generateVideoResponse as Record<string, unknown>)
      ?.generatedSamples as Array<Record<string, unknown>>) ||
    [];
  for (const p of predictions as Array<Record<string, unknown>>) {
    const video = (p.video as Record<string, unknown>) || p;
    const data =
      (video.bytesBase64Encoded as string) || (video.base64Data as string) || "";
    const mime = (video.mimeType as string) || "video/mp4";
    if (data) {
      const { url, filename } = await persistBase64(data, mime, hint);
      return { done: true, url, filename };
    }
    // Some responses give a URI instead.
    const uri = video.uri as string;
    if (uri) {
      try {
        const dl = await fetch(`${uri}&key=${key}`);
        if (dl.ok) {
          const buf = Buffer.from(await dl.arrayBuffer());
          const { url, filename } = await persistBase64(
            buf.toString("base64"),
            mime,
            hint
          );
          return { done: true, url, filename };
        }
      } catch {
        /* fall through */
      }
    }
  }

  return { done: true, error: "Veo operation finished but returned no video data" };
}
