import { MEDUSA_BACKEND_URL, getStoreMedusaFetchHeaders } from "@/lib/medusa";

let cachedRegionId: string | null = null;
let inflight: Promise<string> | null = null;

/** Default storefront region (first one returned by the shop backend). */
export async function getDefaultStoreRegionId(): Promise<string> {
  if (cachedRegionId) return cachedRegionId;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const url = new URL("/store/regions", MEDUSA_BACKEND_URL);
      url.searchParams.set("limit", "5");
      const res = await fetch(url.toString(), {
        headers: getStoreMedusaFetchHeaders(),
        cache: "no-store",
      });
      if (!res.ok) {
        console.error("[regions]", res.status, await res.text().catch(() => ""));
        return "";
      }
      const data = (await res.json()) as { regions?: Array<{ id: string }> };
      const id = String(data.regions?.[0]?.id || "");
      if (id) cachedRegionId = id;
      return id;
    } catch (err) {
      console.error("[regions] fetch failed", err);
      return "";
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function clearRegionCache() {
  cachedRegionId = null;
}
