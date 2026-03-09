import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

interface CategoryRow {
  id: string;
  name: string;
  handle: string;
  description: string | null;
  parent_category_id: string | null;
}

export async function GET() {
  try {
    const categories = await query<CategoryRow>(
      `SELECT id, name, handle, description, parent_category_id
       FROM product_category
       WHERE deleted_at IS NULL
       ORDER BY name ASC`
    );

    return NextResponse.json({ categories });
  } catch (error) {
    console.error("[API /catalog/categories] error:", error);
    return NextResponse.json({ categories: [] }, { status: 200 });
  }
}

