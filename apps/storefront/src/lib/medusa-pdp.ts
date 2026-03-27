/**
 * Maps Medusa Store API product payloads to PDP variant rows (pricing + inventory + real variant ids).
 */

export type PdpVariantRow = {
  id: string;
  color: string;
  size: string;
  price: number;
  salePrice?: number;
  inStock: boolean;
  sku: string | null;
  /** Present when the Store API returns `inventory_quantity` on the variant (e.g. product fetch). */
  inventoryQuantity?: number;
};

const looksLikeSize = (value: string) => {
  const token = String(value || "").trim().toUpperCase();
  if (!token) return false;
  if (["XS", "S", "M", "L", "XL", "XXL", "XXXL"].includes(token)) return true;
  if (/^\d{2}$/.test(token)) return true;
  if (/^\d{1,2}(Y|M)$/.test(token)) return true;
  return false;
};

function centsToAmount(amountCents: number): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
  return Math.round(amountCents) / 100;
}

function variantUnitPrice(variant: Record<string, unknown>): { price: number; salePrice?: number } {
  const calc = variant.calculated_price as Record<string, unknown> | undefined;
  const rawCalculated = Number(calc?.calculated_amount ?? 0);
  const rawOriginal = Number(calc?.original_amount ?? 0);
  const prices = (variant.prices as Array<Record<string, unknown>> | undefined) || [];
  const firstPrice = Number(prices[0]?.amount ?? 0);
  const direct = Number(variant.amount ?? 0);

  if (rawOriginal > 0 && rawCalculated > 0 && rawOriginal > rawCalculated) {
    return { price: centsToAmount(rawOriginal), salePrice: centsToAmount(rawCalculated) };
  }
  const pickCents = rawCalculated || rawOriginal || firstPrice || direct;
  return { price: centsToAmount(pickCents) };
}

function optionLabels(variant: Record<string, unknown>): { color: string; size: string } {
  const opts = variant.options;
  let color = "";
  let size = "";
  if (Array.isArray(opts)) {
    for (const entry of opts) {
      if (!entry || typeof entry !== "object") continue;
      const o = entry as Record<string, unknown>;
      const opt = (o.option || o.option_id) as Record<string, unknown> | string | undefined;
      const title =
        typeof opt === "object" && opt
          ? String((opt as { title?: string }).title || "").toLowerCase()
          : "";
      const value = String(o.value ?? (o as { option_value?: string }).option_value ?? "").trim();
      if (title.includes("color") || title === "color") color = value;
      if (title.includes("size") || title === "size") size = value.toUpperCase();
    }
  }
  const title = String(variant.title || "").trim();
  if ((!color || !size) && title.includes("/")) {
    const parts = title.split(" / ").map((p) => p.trim());
    if (parts.length >= 2) {
      if (!color) color = parts[0];
      if (!size) {
        const last = parts[parts.length - 1];
        size = looksLikeSize(last) ? last.toUpperCase() : last.toUpperCase();
      }
    } else if (parts.length === 1 && looksLikeSize(parts[0])) {
      size = parts[0].toUpperCase();
      if (!color) color = "Default";
    }
  }
  return {
    color: color || "Default",
    size: size || "DEFAULT",
  };
}

function variantInStock(variant: Record<string, unknown>): boolean {
  const manage = variant.manage_inventory;
  if (manage === false) return true;
  const qty = variant.inventory_quantity;
  if (typeof qty === "number") return qty > 0;
  const items = variant.inventory_items;
  if (Array.isArray(items)) {
    return items.some((it) => {
      const row = it as Record<string, unknown>;
      return Number(row.required_quantity ?? row.stocked_quantity ?? 0) > 0;
    });
  }
  return true;
}

export function buildPdpVariantRows(raw: Record<string, unknown>): PdpVariantRow[] {
  const variants = Array.isArray(raw.variants) ? (raw.variants as Array<Record<string, unknown>>) : [];
  const rows: PdpVariantRow[] = [];
  for (const v of variants) {
    const id = String(v.id || "");
    if (!id) continue;
    const { color, size } = optionLabels(v);
    const { price, salePrice } = variantUnitPrice(v);
    const invRaw = v.inventory_quantity;
    rows.push({
      id,
      color,
      size,
      price,
      salePrice,
      inStock: variantInStock(v),
      sku: v.sku != null ? String(v.sku) : null,
      ...(typeof invRaw === "number" && Number.isFinite(invRaw) && invRaw >= 0
        ? { inventoryQuantity: invRaw }
        : {}),
    });
  }
  return rows;
}

export function findVariantRow(
  rows: PdpVariantRow[],
  colorName: string,
  sizeName: string
): PdpVariantRow | undefined {
  const c = colorName.trim().toLowerCase();
  const s = sizeName.trim().toUpperCase();
  return rows.find(
    (r) => r.color.trim().toLowerCase() === c && r.size.trim().toUpperCase() === s
  );
}
