import { NextRequest, NextResponse } from "next/server";
import { getPackDefinitionByHandle } from "@/lib/packs";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ handle: string }> }) {
  try {
    const { handle } = await ctx.params;
    const pack = await getPackDefinitionByHandle(decodeURIComponent(handle));
    if (!pack) {
      return NextResponse.json({ error: "Pack not found." }, { status: 404 });
    }
    return NextResponse.json({ pack });
  } catch (e) {
    console.error("[API /packs/[handle]] GET", e);
    return NextResponse.json({ error: "Failed to load pack." }, { status: 500 });
  }
}
