import { NextRequest, NextResponse } from "next/server";
import { querySongs } from "@/lib/song-repo";

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? undefined;
  const tags = parseTags(request.nextUrl.searchParams.get("tags"));
  const items = await querySongs({ q, tags });
  return NextResponse.json({ items });
}
