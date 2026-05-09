import { Router } from "express";
import { v4 as uuid } from "uuid";
import { query, queryOne, execute } from "../db/pool.ts";
import { resolveCustomerId } from "./customer-auth.ts";
import { isValidPackageCode } from "../lib/package-codes.ts";

export const storePackagesRouter = Router();
const newId = (p: string) => `${p}_${uuid().replace(/-/g, "")}`;

interface PackageView {
  id: string;
  package_code: string;
  status: string;
  carrier: string | null;
  carrier_tracking_number: string | null;
  current_location: string | null;
  estimated_delivery_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  is_pack: boolean;
  shipping_address: Record<string, unknown> | null;
  order_number: string;
  customer_email: string | null;
  created_at: string;
  items: Array<{
    id: string;
    product_title: string;
    variant_title: string | null;
    sku: string | null;
    quantity: number;
    sub_code: string | null;
    status: string;
    claimed_at: string | null;
    /** True only when the requesting customer owns this pack slot. */
    is_yours?: boolean;
  }>;
  events: Array<{
    id: string;
    status: string;
    location: string | null;
    notes: string | null;
    created_at: string;
  }>;
}

async function loadPackageByCode(code: string): Promise<PackageView | null> {
  const pkg = await queryOne(
    `SELECT p.*, o.order_number
     FROM shop_package p
     JOIN shop_order o ON o.id = p.order_id
     WHERE p.package_code = $1`,
    [code]
  );
  if (!pkg) return null;

  const [items, events] = await Promise.all([
    query(
      `SELECT id, product_title, variant_title, sku, quantity, sub_code, status,
              claimed_at, pack_slot_id
       FROM shop_package_item WHERE package_id = $1 ORDER BY created_at`,
      [pkg.id]
    ),
    query(
      `SELECT id, status, location, notes, created_at
       FROM shop_package_event WHERE package_id = $1 ORDER BY created_at`,
      [pkg.id]
    ),
  ]);

  return {
    id: String(pkg.id),
    package_code: String(pkg.package_code),
    status: String(pkg.status),
    carrier: pkg.carrier as string | null,
    carrier_tracking_number: pkg.carrier_tracking_number as string | null,
    current_location: pkg.current_location as string | null,
    estimated_delivery_at: pkg.estimated_delivery_at as string | null,
    shipped_at: pkg.shipped_at as string | null,
    delivered_at: pkg.delivered_at as string | null,
    is_pack: Boolean(pkg.is_pack),
    shipping_address: (pkg.shipping_address as Record<string, unknown>) || null,
    order_number: String(pkg.order_number),
    customer_email: pkg.customer_email as string | null,
    created_at: String(pkg.created_at),
    items: items.map((it) => ({
      id: String(it.id),
      product_title: String(it.product_title),
      variant_title: it.variant_title as string | null,
      sku: it.sku as string | null,
      quantity: Number(it.quantity),
      sub_code: it.sub_code as string | null,
      status: String(it.status),
      claimed_at: it.claimed_at as string | null,
    })),
    events: events.map((e) => ({
      id: String(e.id),
      status: String(e.status),
      location: e.location as string | null,
      notes: e.notes as string | null,
      created_at: String(e.created_at),
    })),
  };
}

// ─── GET /store/packages/:code ─────────────────────────────────────────
// Public tracking lookup. Anyone with the code (printed on the receipt or
// scanned QR) can see the timeline. Sub-codes / personal data are NOT
// included unless the request is authenticated as the slot owner.
storePackagesRouter.get("/:code", async (req, res) => {
  try {
    const code = String(req.params.code || "").toUpperCase().trim();
    if (!isValidPackageCode(code)) {
      return res.status(400).json({ error: "Invalid tracking code" });
    }
    const view = await loadPackageByCode(code);
    if (!view) return res.status(404).json({ error: "Package not found" });

    const customerId = await resolveCustomerId(req.headers.authorization);
    if (view.is_pack) {
      // For packs, redact sub-codes that don't belong to the requester.
      view.items = await Promise.all(
        view.items.map(async (item) => {
          if (!item.sub_code) return item;
          const slot = await queryOne(
            `SELECT customer_id FROM pack_slot WHERE pack_slot.id = $1
             OR pack_slot.id = (SELECT pack_slot_id FROM shop_package_item WHERE id = $2)`,
            [item.id, item.id]
          );
          const ownerId = slot?.customer_id ? String(slot.customer_id) : null;
          const isYours = customerId != null && ownerId === customerId;
          return {
            ...item,
            is_yours: isYours,
            sub_code: isYours ? item.sub_code : `${item.sub_code.slice(0, 3)}-•••••-•••••-•-••`,
          };
        })
      );
    }

    res.json({ package: view });
  } catch (err) {
    console.error("[store package by code]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── GET /store/packages/me ────────────────────────────────────────────
// Authenticated customer's own packages.
storePackagesRouter.get("/", async (req, res) => {
  try {
    const customerId = await resolveCustomerId(req.headers.authorization);
    // Email fallback: the storefront and shop backend use separate auth, so
    // a customer browsing /account may not have a shop JWT. The proxy can
    // pass ?email=... so we match on email as well.
    const emailParam = String((req.query.email as string) || "").trim().toLowerCase();
    if (!customerId && !emailParam) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const conds: string[] = [];
    const params: unknown[] = [];
    if (customerId) {
      params.push(customerId);
      conds.push(`p.customer_id = $${params.length}`);
    }
    if (emailParam) {
      params.push(emailParam);
      conds.push(`LOWER(p.customer_email) = $${params.length}`);
    }
    const rows = await query(
      `SELECT p.id, p.package_code, p.status, p.carrier, p.is_pack,
              p.shipped_at, p.delivered_at, p.created_at, o.order_number, o.total, o.currency_code
       FROM shop_package p
       JOIN shop_order o ON o.id = p.order_id
       WHERE ${conds.join(" OR ")}
       ORDER BY p.created_at DESC LIMIT 200`,
      params
    );
    res.json({ packages: rows });
  } catch (err) {
    console.error("[store packages me]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── POST /store/packages/:code/claim ──────────────────────────────────
// A pack-slot owner scans their sub-code at collection. We verify the
// authenticated customer is the slot owner before marking it claimed.
storePackagesRouter.post("/:code/claim", async (req, res) => {
  try {
    const customerId = await resolveCustomerId(req.headers.authorization);
    if (!customerId) return res.status(401).json({ error: "Sign in to claim your item" });

    const code = String(req.params.code || "").toUpperCase().trim();
    const { sub_code } = req.body as { sub_code: string };
    if (!sub_code) return res.status(400).json({ error: "sub_code required" });

    const item = await queryOne(
      `SELECT pi.id, pi.pack_slot_id, pi.status, ps.customer_id AS slot_customer_id
       FROM shop_package_item pi
       LEFT JOIN pack_slot ps ON ps.id = pi.pack_slot_id
       WHERE pi.sub_code = $1`,
      [sub_code]
    );
    if (!item) return res.status(404).json({ error: "Sub-code not found" });
    if (item.status === "claimed") {
      return res.status(409).json({ error: "Already claimed" });
    }
    if (item.slot_customer_id && String(item.slot_customer_id) !== customerId) {
      return res
        .status(403)
        .json({ error: "This sub-code belongs to a different customer." });
    }

    await execute(
      `UPDATE shop_package_item
         SET status = 'claimed', claimed_at = NOW(), claimed_by = $1, updated_at = NOW()
       WHERE id = $2`,
      [customerId, item.id]
    );
    await execute(
      `INSERT INTO shop_package_event (id, package_id, status, location, notes, created_by)
       VALUES ($1, (SELECT package_id FROM shop_package_item WHERE id = $2), 'claimed', $3, $4, 'customer')`,
      [
        newId("pkge"),
        item.id,
        "Collection point",
        `Sub-code ${sub_code} claimed by customer`,
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[store package claim]", err);
    res.status(500).json({ error: "Failed" });
  }
});
