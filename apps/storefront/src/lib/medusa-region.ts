import { medusa } from "@/lib/medusa";

let cachedRegionId: string | null = null;

/** Default storefront region for calculated prices (first region from Medusa). */
export async function getDefaultStoreRegionId(): Promise<string> {
  if (cachedRegionId) return cachedRegionId;
  try {
    const res = await medusa.store.region.list({ limit: 5 });
    const id = String(res.regions?.[0]?.id || "");
    if (id) cachedRegionId = id;
    return id;
  } catch {
    return "";
  }
}

export function clearRegionCache() {
  cachedRegionId = null;
}
