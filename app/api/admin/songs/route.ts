import { NextRequest, NextResponse } from "next/server";
import { querySongsByStatus } from "@/lib/song-repo";
import { songStatusSchema } from "@/lib/schema";
import { isAdminModeEnabled } from "@/lib/runtime-config";

export async function GET(request: NextRequest) {
  if (!isAdminModeEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const statusRaw = request.nextUrl.searchParams.get("status") ?? "pending";
  const parsed = songStatusSchema.safeParse(statusRaw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const items = await querySongsByStatus(parsed.data);
  return NextResponse.json({ items });
}

