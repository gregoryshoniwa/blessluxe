import Medusa from "@medusajs/js-sdk";

const MEDUSA_BACKEND_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000";

const PUBLISHABLE_API_KEY =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || "";

export const medusa = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  debug: process.env.NODE_ENV === "development",
  ...(PUBLISHABLE_API_KEY ? { publishableKey: PUBLISHABLE_API_KEY } : {}),
});

/** Typed headers for direct `fetch` to the Medusa Store API (avoids `HeadersInit` union issues). */
export function getStoreMedusaFetchHeaders(): Record<string, string> {
  const h: Record<string, string> = { accept: "application/json" };
  const key = (
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
    process.env.MEDUSA_PUBLISHABLE_KEY ||
    ""
  ).trim();
  if (key) h["x-publishable-api-key"] = key;
  return h;
}

export { MEDUSA_BACKEND_URL };
