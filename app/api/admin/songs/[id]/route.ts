import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { updateSongReviewFields } from "@/lib/song-repo";
import { adminSongUpdateSchema } from "@/lib/schema";
import { isAdminModeEnabled } from "@/lib/runtime-config";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!isAdminModeEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = adminSongUpdateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "字段校验失败", issues: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "未知校验错误" }, { status: 400 });
  }

  const { id } = await params;
  const item = await updateSongReviewFields(id, parsed);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, item });
}
