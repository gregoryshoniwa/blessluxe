import type { PackSlotRow } from "@/lib/packs";
import { query } from "@/lib/db";

type CustomerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  metadata: unknown;
};

export function formatCustomerDisplayName(row: CustomerRow | null | undefined): string {
  if (!row) return "";
  const full = String(row.full_name || "").trim();
  if (full) return full;
  const fn = String(row.first_name || "").trim();
  const ln = String(row.last_name || "").trim();
  if (fn && ln) return `${fn} ${ln}`;
  if (fn || ln) return fn || ln;
  const em = String(row.email || "").trim();
  if (em && em.includes("@")) return em.split("@")[0] || em;
  return "";
}

function resolveStorefrontId(slot: PackSlotRow): string {
  const meta = slot.metadata && typeof slot.metadata === "object" && !Array.isArray(slot.metadata)
    ? (slot.metadata as Record<string, unknown>)
    : {};
  const sf = typeof meta.storefront_customer_id === "string" ? meta.storefront_customer_id.trim() : "";
  const cid = slot.customer_id ? String(slot.customer_id).trim() : "";
  if (sf && !sf.startsWith("cus_")) return sf;
  if (cid && !cid.startsWith("cus_")) return cid;
  return sf || cid;
}

/**
 * Public label for occupied slots (name or collection code per customer preference).
 */
export async function enrichPackSlotsWithOccupantLabels(
  slots: PackSlotRow[]
): Promise<Array<PackSlotRow & { occupant_label: string | null }>> {
  const occupied = slots.filter((s) => s.status === "reserved" || s.status === "paid");
  if (occupied.length === 0) {
    return slots.map((s) => ({ ...s, occupant_label: null }));
  }

  const ids = [...new Set(occupied.map(resolveStorefrontId).filter(Boolean))];
  let customers: CustomerRow[] = [];
  if (ids.length > 0) {
    try {
      customers = await query<CustomerRow>(
        `SELECT id, first_name, last_name, full_name, email, metadata FROM customer_account WHERE id = ANY($1::text[])`,
        [ids]
      );
    } catch {
      customers = [];
    }
  }
  const byId = new Map(customers.map((c) => [c.id, c]));

  return slots.map((slot) => {
    if (slot.status !== "reserved" && slot.status !== "paid") {
      return { ...slot, occupant_label: null };
    }

    const meta =
      slot.metadata && typeof slot.metadata === "object" && !Array.isArray(slot.metadata)
        ? (slot.metadata as Record<string, unknown>)
        : {};
    const collectionCode =
      typeof meta.collection_code === "string" ? meta.collection_code.trim() : typeof slot.collection_code === "string"
        ? slot.collection_code.trim()
        : "";

    const sf = resolveStorefrontId(slot);
    const crow = sf ? byId.get(sf) : undefined;
    const custMeta =
      crow?.metadata && typeof crow.metadata === "object" && !Array.isArray(crow.metadata)
        ? (crow.metadata as Record<string, unknown>)
        : {};
    const useCode = custMeta.pack_public_display === "code";

    const tail = slot.status === "reserved" ? "reserved" : "paid";

    if (useCode && collectionCode) {
      return { ...slot, occupant_label: `${collectionCode} : ${tail}` };
    }

    const name = formatCustomerDisplayName(crow);
    if (name) {
      return { ...slot, occupant_label: `${name} : ${tail}` };
    }
    if (collectionCode) {
      return { ...slot, occupant_label: `${collectionCode} : ${tail}` };
    }
    return { ...slot, occupant_label: `Participant : ${tail}` };
  });
}
