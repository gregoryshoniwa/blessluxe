import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

function getSupabaseStorageConfig() {
  return {
    url: (process.env.SUPABASE_URL || "").trim().replace(/\/$/, ""),
    serviceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
    bucket: (process.env.SUPABASE_STORAGE_BUCKET || "affiliate-media").trim(),
  };
}

type UploadResult = {
  url: string;
  provider: "supabase" | "local" | "remote-url";
  warning?: string;
};

export async function uploadImageAsset(input: {
  dataUrlOrRemoteUrl: string;
  folder: string;
}): Promise<UploadResult> {
  const supabase = await uploadToSupabase(input.dataUrlOrRemoteUrl, input.folder);
  if (supabase) return supabase;

  return await storeImageLocally(input.dataUrlOrRemoteUrl, input.folder, {
    warning: "Supabase not configured. Stored image locally as fallback.",
  });
}

async function uploadToSupabase(
  dataUrlOrRemoteUrl: string,
  folder: string
): Promise<UploadResult | null> {
  const { url, serviceRoleKey, bucket } = getSupabaseStorageConfig();
  if (!url || !serviceRoleKey || !bucket) return null;

  const parsed = parseDataUrl(dataUrlOrRemoteUrl.trim());
  if (!parsed) {
    return {
      url: dataUrlOrRemoteUrl.trim(),
      provider: "remote-url" as const,
      warning: "Supabase configured, but received remote URL. Keeping provided URL as-is.",
    };
  }

  const safeFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, "");
  const objectPath = `${safeFolder}/${Date.now()}-${randomUUID()}.${parsed.extension}`.replace(
    /\/{2,}/g,
    "/"
  );

  const uploadResponse = await fetch(
    `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "content-type": parsed.mimeType,
        "x-upsert": "true",
      },
      body: parsed.buffer,
    }
  );

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    return {
      ...(await storeImageLocally(dataUrlOrRemoteUrl, folder)),
      warning: `Supabase upload failed (${uploadResponse.status}). ${errorText || ""}`.trim(),
    };
  }

  const delivery = await buildSupabaseDeliveryUrl({
    baseUrl: url,
    bucket,
    objectPath,
    serviceRoleKey,
  });

  return {
    url: delivery.url,
    provider: "supabase" as const,
    warning: delivery.warning,
  };
}

async function buildSupabaseDeliveryUrl(input: {
  baseUrl: string;
  bucket: string;
  objectPath: string;
  serviceRoleKey: string;
}): Promise<{ url: string; warning?: string }> {
  const base = input.baseUrl;
  const bucket = encodeURIComponent(input.bucket);
  const pathPart = input.objectPath;
  const authHeaders = {
    Authorization: `Bearer ${input.serviceRoleKey}`,
    apikey: input.serviceRoleKey,
    "content-type": "application/json",
  };

  // Prefer transformed delivery to reduce payload size on the storefront.
  const signedWithTransform = await fetch(
    `${base}/storage/v1/object/sign/${bucket}/${pathPart}`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        expiresIn: 60 * 60 * 24 * 30,
        transform: { width: 1280, quality: 72, resize: "contain" },
      }),
    }
  );
  if (signedWithTransform.ok) {
    const payload = await signedWithTransform.json();
    if (payload?.signedURL) {
      return { url: `${base}/storage/v1${String(payload.signedURL)}` };
    }
  }

  // Fallback for private buckets.
  const signed = await fetch(`${base}/storage/v1/object/sign/${bucket}/${pathPart}`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ expiresIn: 60 * 60 * 24 * 30 }),
  });
  if (signed.ok) {
    const payload = await signed.json();
    if (payload?.signedURL) {
      return { url: `${base}/storage/v1${String(payload.signedURL)}` };
    }
  }

  // Public bucket fallback (transformed + original).
  return {
    url: `${base}/storage/v1/render/image/public/${bucket}/${pathPart}?width=1280&quality=72`,
    warning:
      "Using public render URL fallback. Ensure bucket visibility or signed URL access is configured.",
  };
}

function parseDataUrl(input: string) {
  const dataUrlMatch = input.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!dataUrlMatch) return null;

  const mimeType = dataUrlMatch[1].toLowerCase();
  const base64Data = dataUrlMatch[2];
  const extension = mimeType.includes("png")
    ? "png"
    : mimeType.includes("webp")
      ? "webp"
      : mimeType.includes("gif")
        ? "gif"
        : "jpg";

  return {
    mimeType,
    extension,
    buffer: Buffer.from(base64Data, "base64"),
  };
}

async function storeImageLocally(
  dataUrlOrRemoteUrl: string,
  folder: string,
  options?: { warning?: string }
): Promise<UploadResult> {
  const input = dataUrlOrRemoteUrl.trim();
  const parsed = parseDataUrl(input);
  if (!parsed) {
    return {
      url: input,
      provider: "remote-url" as const,
      warning:
        options?.warning ||
        "Using provided remote URL directly.",
    };
  }

  const safeFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, "");
  const folderSegments = safeFolder.split("/").filter(Boolean);
  const relativeDir = path.join("uploads", ...folderSegments);
  const publicRoot = path.join(process.cwd(), "apps", "storefront", "public");
  const absDir = path.join(publicRoot, relativeDir);
  await mkdir(absDir, { recursive: true });

  const filename = `${Date.now()}-${randomUUID()}.${parsed.extension}`;
  const absFile = path.join(absDir, filename);
  await writeFile(absFile, parsed.buffer);

  return {
    url: `/${relativeDir.replaceAll("\\", "/")}/${filename}`,
    provider: "local" as const,
    warning:
      options?.warning ||
      "Stored locally because Supabase is not configured/available.",
  };
}

