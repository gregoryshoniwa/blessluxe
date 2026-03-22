import { NextRequest, NextResponse } from "next/server";
import { execute, query } from "@/lib/db";
import { ensureAffiliateSchema } from "@/lib/affiliate";
import { ensureBlitsSchema } from "@/lib/blits";
import { requireAdminRequest } from "@/lib/admin-auth";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const denyResponse = await requireAdminRequest(req);
    if (denyResponse) return denyResponse;

    await ensureAffiliateSchema();
    await ensureBlitsSchema();

    const rows = await query<Record<string, unknown>>(
      `SELECT id, name, description, emoji, cost_blits, sort_order, active, created_at
       FROM blits_gift_type
       ORDER BY sort_order ASC, created_at ASC`
    );
    return NextResponse.json({ giftTypes: rows });
  } catch (error) {
    console.error("[API /admin/blits/gift-types] GET error:", error);
    return NextResponse.json({ error: "Failed to load gift types." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const denyResponse = await requireAdminRequest(req);
    if (denyResponse) return denyResponse;

    await ensureAffiliateSchema();
    await ensureBlitsSchema();

    const body = await req.json();
    const name = String(body.name || "").trim();
    const costBlits = Math.max(0, Math.floor(Number(body.cost_blits) || 0));
    if (!name || costBlits <= 0) {
      return NextResponse.json({ error: "name and positive cost_blits are required." }, { status: 400 });
    }

    const id = randomUUID();
    await execute(
      `INSERT INTO blits_gift_type (id, name, description, emoji, cost_blits, sort_order, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [
        id,
        name,
        body.description ? String(body.description) : null,
        body.emoji ? String(body.emoji) : null,
        costBlits,
        Math.floor(Number(body.sort_order) || 0),
        body.active !== false,
      ]
    );

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("[API /admin/blits/gift-types] POST error:", error);
    return NextResponse.json({ error: "Failed to create gift type." }, { status: 500 });
  }
}
