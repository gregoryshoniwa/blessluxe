import { NextRequest, NextResponse } from "next/server";
import { execute, queryOne } from "@/lib/db";
import { ensureAffiliateSchema } from "@/lib/affiliate";
import { ensureBlitsSchema } from "@/lib/blits";
import { requireAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const denyResponse = await requireAdminRequest(req);
    if (denyResponse) return denyResponse;

    await ensureAffiliateSchema();
    await ensureBlitsSchema();

    const { id } = await params;
    const body = await req.json();

    const row = await queryOne<{
      name: string;
      description: string | null;
      emoji: string | null;
      cost_blits: string;
      sort_order: string;
      active: boolean;
    }>(`SELECT name, description, emoji, cost_blits, sort_order, active FROM blits_gift_type WHERE id = $1`, [id]);
    if (!row) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const name = body.name !== undefined ? String(body.name).trim() : row.name;
    const description =
      body.description !== undefined ? (body.description ? String(body.description) : null) : row.description;
    const emoji = body.emoji !== undefined ? (body.emoji ? String(body.emoji) : null) : row.emoji;
    const costBlits =
      body.cost_blits !== undefined
        ? Math.max(1, Math.floor(Number(body.cost_blits)))
        : Number(row.cost_blits);
    const sortOrder =
      body.sort_order !== undefined ? Math.floor(Number(body.sort_order)) : Number(row.sort_order);
    const active = body.active !== undefined ? Boolean(body.active) : Boolean(row.active);

    await execute(
      `UPDATE blits_gift_type
       SET name = $1, description = $2, emoji = $3, cost_blits = $4, sort_order = $5, active = $6, updated_at = NOW()
       WHERE id = $7`,
      [name, description, emoji, costBlits, sortOrder, active, id]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /admin/blits/gift-types/[id]] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update gift type." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const denyResponse = await requireAdminRequest(req);
    if (denyResponse) return denyResponse;

    await ensureAffiliateSchema();
    await ensureBlitsSchema();

    const { id } = await params;
    await execute(`DELETE FROM blits_gift_type WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /admin/blits/gift-types/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete gift type." }, { status: 500 });
  }
}
