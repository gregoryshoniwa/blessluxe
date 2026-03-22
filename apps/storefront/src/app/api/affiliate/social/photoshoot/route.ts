import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import {
  createAffiliateMediaAsset,
  getAffiliateByCode,
} from "@/lib/affiliate";
import { uploadImageAsset } from "@/lib/media-upload";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const STYLE_PROMPTS: Record<string, string> = {
  editorial: "high-end fashion editorial, luxury magazine style, soft cinematic lighting, 85mm lens look",
  studio: "premium studio portrait, clean seamless backdrop, controlled softbox lighting, sharp wardrobe detail",
  street: "street style fashion campaign, natural daylight, dynamic perspective, authentic lifestyle framing",
  runway: "runway-inspired fashion lookbook, dramatic pose, spotlight lighting, premium couture framing",
};

function buildPhotoshootPrompt(input: {
  garmentDescription: string;
  characterType?: string;
  assetSummary?: string;
  assetTransferSummary?: string;
  strictnessMode?: "balanced" | "strict";
  style: string;
  stylePrompt?: string;
  cameraPrompt?: string;
  pose: string;
  customPose?: string;
  hairStylePrompt?: string;
  hairStyleName?: string;
  environmentPrompt?: string;
  mood: string;
}) {
  const stylePrompt = STYLE_PROMPTS[input.style] || STYLE_PROMPTS.editorial;
  const mergedStylePrompt = [input.stylePrompt, stylePrompt, input.cameraPrompt]
    .filter(Boolean)
    .join(", ");
  const poseDirective = [input.pose, input.customPose].filter(Boolean).join(". ");
  return [
    "Transform the provided selfie into a world-class fashion campaign image.",
    "Primary output requirement: generate a polished photorealistic fashion image, not text-only advice.",
    "Identity lock requirement: preserve the exact same person from the selfie.",
    "Critical identity rules: do not change facial structure, skin tone, age, body shape, or ethnicity.",
    "Keep hairstyle exactly unchanged unless an explicit hairstyle option is provided below.",
    "Keep eyes, nose, lips, jawline, and smile characteristics consistent with the source face.",
    "Avoid beauty-filter effects, face swapping, cartoonization, or synthetic identity drift.",
    "The output must look like the same real person wearing styled fashion.",
    "You must keep identity and outfit intent strict. Do not invent a different person or unrelated outfit.",
    input.strictnessMode === "strict"
      ? "Wardrobe transfer mandate: if any asset reference image contains a person wearing a suit, dress, or full outfit, transfer that exact outfit design onto the provided character."
      : "Wardrobe transfer preference: strongly follow the selected asset outfit while keeping photorealistic coherence.",
    input.strictnessMode === "strict"
      ? "Do not replace wardrobe with generic alternatives. Match silhouette, garment type, layering, fit, and visible design details from asset references."
      : "Match key outfit elements from selected assets (garment type, color family, and styling details).",
    input.strictnessMode === "strict"
      ? "The generated character must wear the selected asset outfit, not their original selfie clothing."
      : "Ensure selected assets are clearly reflected in the final wardrobe.",
    input.characterType ? `Character profile: ${input.characterType}.` : "",
    `Wardrobe focus: ${input.garmentDescription}.`,
    input.assetSummary ? `Assets to include and style on character: ${input.assetSummary}.` : "",
    input.assetTransferSummary ? `Strict asset transfer details: ${input.assetTransferSummary}.` : "",
    input.assetSummary
      ? "Use the attached clothing references exactly as primary wardrobe pieces on the same character."
      : "",
    `Pose direction: ${poseDirective}.`,
    input.hairStylePrompt ? `Hair direction: ${input.hairStylePrompt}` : "",
    input.hairStyleName ? `Selected hair style option: ${input.hairStyleName}.` : "",
    input.environmentPrompt ? `Environment and location direction: ${input.environmentPrompt}.` : "",
    `Mood and expression: ${input.mood}.`,
    `Visual direction: ${mergedStylePrompt}.`,
    "Maintain realistic human anatomy and facial identity.",
    "Keep the same face identity in close-up and full-body framing consistently.",
    "Do not alter the person's recognizability under any condition.",
    "Preserve garment details, fit, and fabric texture accurately.",
    "Do not ignore asset references. Ensure the generated look clearly reflects selected product assets.",
    "Deliver polished commercial photography quality suitable for social commerce.",
  ].join(" ");
}

function parseDataUrl(input: string) {
  const match = input.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    data: match[2],
  };
}

async function resolveSelfieInlinePart(selfieImageData: string, selfieImageUrl: string) {
  const dataInput = selfieImageData.trim();
  if (dataInput) {
    const parsed = parseDataUrl(dataInput);
    if (parsed) {
      return { inlineData: { mimeType: parsed.mimeType, data: parsed.data } };
    }
  }

  const urlInput = selfieImageUrl.trim();
  if (!urlInput) return null;

  if (urlInput.startsWith("/")) {
    const localFile = path.join(process.cwd(), "apps", "storefront", "public", urlInput);
    const buffer = await readFile(localFile);
    const ext = path.extname(urlInput).toLowerCase();
    const mimeType =
      ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".gif" ? "image/gif" : "image/jpeg";
    return { inlineData: { mimeType, data: buffer.toString("base64") } };
  }

  if (urlInput.startsWith("http://") || urlInput.startsWith("https://")) {
    const response = await fetch(urlInput);
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      const contentType = response.headers.get("content-type") || "image/jpeg";
      return {
        inlineData: {
          mimeType: contentType,
          data: Buffer.from(arrayBuffer).toString("base64"),
        },
      };
    }
  }

  return null;
}

async function resolveImageUrlInlinePart(imageUrl: string) {
  const trimmed = imageUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const response = await fetch(trimmed);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "image/jpeg";
    return {
      inlineData: {
        mimeType: contentType,
        data: Buffer.from(arrayBuffer).toString("base64"),
      },
    };
  }
  return null;
}

async function resolveAssetInlineParts(selectedAssets: Array<Record<string, unknown>>) {
  const candidates = selectedAssets
    .map((asset) => ({
      imageUrl: String(asset.imageUrl || "").trim(),
      title: String(asset.title || asset.productTitle || "").trim() || "Selected asset",
    }))
    .filter((entry) => entry.imageUrl)
    .filter(Boolean)
    .slice(0, 3);
  const parts: Array<{
    title: string;
    part: { inlineData: { mimeType: string; data: string } };
  }> = [];
  for (const candidate of candidates) {
    try {
      const part = await resolveImageUrlInlinePart(candidate.imageUrl);
      if (part?.inlineData?.data) {
        parts.push({
          title: candidate.title,
          part,
        });
      }
    } catch {
      // Ignore asset image fetch failures and continue.
    }
  }
  return parts;
}

async function callGeminiGenerate(input: {
  apiKey: string;
  model: string;
  prompt: string;
  selfiePart: { inlineData: { mimeType: string; data: string } } | null;
  assetParts: Array<{
    title: string;
    part: { inlineData: { mimeType: string; data: string } };
  }>;
  includeImageResponse: boolean;
}) {
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    { text: input.prompt },
  ];
  if (input.selfiePart) {
    parts.push({
      text: "Character identity reference image (must keep this same person).",
    });
    parts.push(input.selfiePart);
  }
  input.assetParts.forEach((asset, index) => {
    parts.push({
      text: `Asset reference ${index + 1}: ${asset.title}. Strictly transfer this outfit onto the same character.`,
    });
    parts.push(asset.part);
  });

  const body = {
    contents: [
      {
        role: "user",
        parts,
      },
    ],
    generationConfig: input.includeImageResponse
      ? { responseModalities: ["TEXT", "IMAGE"] }
      : undefined,
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent?key=${input.apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  const raw = await response.text();
  let payload: any = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { error: { message: raw || "Unexpected response from Gemini." } };
  }
  return { response, payload };
}

export async function POST(req: NextRequest) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer?.id) {
      return NextResponse.json({ error: "Login required." }, { status: 401 });
    }

    const body = await req.json();
    const code = String(body.code || "").trim();
    const selfieImageUrl = String(body.selfieImageUrl || "").trim();
    const selfieImageData = String(body.selfieImageData || "").trim();
    const garmentDescription = String(body.garmentDescription || "").trim();
    const characterType = String(body.characterType || "").trim();
    const customPose = String(body.customPose || "").trim();
    const environmentPrompt = String(body.environmentPrompt || "").trim();
    const stylePrompt = String(body.stylePrompt || "").trim();
    const cameraPrompt = String(body.cameraPrompt || "").trim();
    const hairStylePrompt = String(body.hairStylePrompt || "").trim();
    const hairStyleName = String(body.hairStyleName || "").trim();
    const selectedAssets = Array.isArray(body.selectedAssets)
      ? (body.selectedAssets as Array<Record<string, unknown>>)
      : [];
    const strictnessMode =
      String(body.strictnessMode || "").trim().toLowerCase() === "balanced" ? "balanced" : "strict";
    const style = String(body.style || "editorial").trim();
    const pose = String(body.pose || "confident full-body stance").trim();
    const mood = String(body.mood || "elegant and confident").trim();
    const assetSummary = selectedAssets
      .map((asset) => {
        const title = String(asset.title || asset.productTitle || "").trim();
        const desc = String(asset.description || "").trim();
        if (title && desc) return `${title} (${desc})`;
        return title || desc;
      })
      .filter(Boolean)
      .join("; ");
    const assetTransferSummary = selectedAssets
      .map((asset) => {
        const title = String(asset.title || asset.productTitle || "").trim() || "Selected asset";
        const handle = String(asset.handle || asset.productHandle || "").trim();
        return handle ? `${title} [${handle}]` : title;
      })
      .filter(Boolean)
      .join("; ");

    if ((!selfieImageUrl && !selfieImageData) || (!garmentDescription && !assetSummary) || !code) {
      return NextResponse.json(
        { error: "code, selfie image and at least one garment/asset are required." },
        { status: 400 }
      );
    }

    const affiliate = await getAffiliateByCode(code);
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found." }, { status: 404 });
    }
    if (String(customer.email).toLowerCase() !== String(affiliate.email).toLowerCase()) {
      return NextResponse.json(
        { error: "Only the affiliate owner can generate social photoshoots." },
        { status: 403 }
      );
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GOOGLE_AI_API_KEY is required for AI photoshoot generation." },
        { status: 500 }
      );
    }

    const configuredModel = (process.env.GOOGLE_NANO_BANANA_MODEL || "").trim();
    const modelCandidates = [
      configuredModel,
      "gemini-3.1-flash-image-preview",
      "gemini-2.5-flash-image",
      "gemini-2.5-flash",
    ].filter((value, index, array) => Boolean(value) && array.indexOf(value) === index);
    const prompt = buildPhotoshootPrompt({
      garmentDescription: garmentDescription || "Use selected clothing assets with realistic drape and fit.",
      characterType,
      assetSummary,
      assetTransferSummary,
      strictnessMode,
      style,
      stylePrompt,
      cameraPrompt,
      pose,
      customPose,
      hairStylePrompt,
      hairStyleName,
      environmentPrompt,
      mood,
    });
    const trimmedSelfieData = selfieImageData.length > 2_000_000 ? "" : selfieImageData;
    const selfiePart = await resolveSelfieInlinePart(trimmedSelfieData, selfieImageUrl);
    const assetParts = await resolveAssetInlineParts(selectedAssets);

    let selectedModel = modelCandidates[0] || "gemini-2.5-flash";
    let payload: any = null;
    let lastError = "AI photoshoot generation failed.";

    for (const model of modelCandidates) {
      const imageAttempt = await callGeminiGenerate({
        apiKey,
        model,
        prompt,
        selfiePart,
        assetParts,
        includeImageResponse: true,
      });
      if (imageAttempt.response.ok) {
        selectedModel = model;
        payload = imageAttempt.payload;
        break;
      }

      const fallbackAttempt = await callGeminiGenerate({
        apiKey,
        model,
        prompt,
        selfiePart,
        assetParts,
        includeImageResponse: false,
      });
      if (fallbackAttempt.response.ok) {
        selectedModel = model;
        payload = fallbackAttempt.payload;
        break;
      }

      lastError = fallbackAttempt.payload?.error?.message || imageAttempt.payload?.error?.message || lastError;
    }

    if (!payload) {
      return NextResponse.json(
        { error: lastError, prompt },
        { status: 500 }
      );
    }

    const parts = payload?.candidates?.[0]?.content?.parts || [];
    const textPart = parts.find((p: { text?: string }) => p.text)?.text;
    const inlineImage = parts.find((p: { inlineData?: { data?: string; mimeType?: string } }) => p.inlineData?.data)?.inlineData;
    let generatedImageUrl: string | null = null;
    if (inlineImage?.data) {
      const mimeType = inlineImage.mimeType || "image/png";
      const dataUrl = `data:${mimeType};base64,${inlineImage.data}`;
      const uploaded = await uploadImageAsset({
        dataUrlOrRemoteUrl: dataUrl,
        folder: "blessluxe/affiliate/generated",
      });
      generatedImageUrl = uploaded.url;
    }

    const sourceUrlForAsset = selfieImageUrl || selfieImageData;
    await createAffiliateMediaAsset({
      affiliateId: affiliate.id,
      customerId: String(customer.id),
      source: "nano-banana",
      originalUrl: sourceUrlForAsset,
      generatedUrl: generatedImageUrl,
      prompt,
      metadata: {
        model: selectedModel,
        characterType,
        style,
        stylePrompt,
        cameraPrompt,
        strictnessMode,
        pose,
        customPose,
        hairStylePrompt,
        hairStyleName,
        environmentPrompt,
        mood,
        selectedAssets,
      },
    });

    return NextResponse.json({
      ok: true,
      prompt,
      generatedCaption: textPart || "Photo generated successfully.",
      generatedImageUrl,
      usedModel: selectedModel,
      outputType: generatedImageUrl ? "image" : "text",
      note: generatedImageUrl
        ? "Generated image stored successfully."
        : "Model returned text guidance. Set GOOGLE_NANO_BANANA_MODEL to an image-output capable model in your Google account.",
    });
  } catch (error) {
    console.error("[API /affiliate/social/photoshoot] error:", error);
    return NextResponse.json({ error: "Failed to generate photoshoot output." }, { status: 500 });
  }
}

