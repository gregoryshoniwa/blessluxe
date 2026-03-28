import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/admin-auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Admin: list pack definitions (same DB as Medusa after migration). */
export async function GET(req: NextRequest) {
  try {
    const deny = await requireAdminRequest(req);
    if (deny) return deny;

    const rows = await query<Record<string, unknown>>(
      `SELECT id, product_id, title, handle, description, status, created_at, updated_at
       FROM pack_definition
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC`
    );

    return NextResponse.json({ definitions: rows });
  } catch (e) {
    console.error("[admin/packs/definitions]", e);
    return NextResponse.json({ error: "Failed to load pack definitions." }, { status: 500 });
  }
}
