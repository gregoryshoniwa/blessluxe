import { NextRequest, NextResponse } from "next/server";
import { shopFetch } from "@/lib/shop-backend-client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const position = req.nextUrl.searchParams.get("position") || "hero";
  const res = await shopFetch<{ announcements: unknown[] }>(
    `/store/announcements?position=${encodeURIComponent(position)}`
  );
  if (!res.ok || !res.data) return NextResponse.json({ announcements: [] });
  return NextResponse.json(res.data);
}
