import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { createPendingSong, querySongs } from "@/lib/song-repo";
import { songSubmissionSchema } from "@/lib/schema";
import { rateLimit } from "@/lib/rate-limit";

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

// 取请求方 IP：优先 x-forwarded-for（Vercel 会带），fallback unknown 兜底。
function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

const SUBMIT_WINDOW_MS = 10 * 60 * 1000;
const SUBMIT_MAX = 5;

/**
 * 用户云端投稿入口。
 * - 服务端强制 status=pending
 * - 简单 IP 限流 10 分钟 5 次（见 lib/rate-limit.ts）
 * - mongo 不可用时返回 503，避免静默丢弃
 */
export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const limit = rateLimit(`submit:${ip}`, { windowMs: SUBMIT_WINDOW_MS, max: SUBMIT_MAX });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "提交过于频繁，请稍后再试" },
      { status: 429, headers: { "retry-after": Math.ceil(limit.retryAfterMs / 1000).toString() } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = songSubmissionSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "字段校验失败", issues: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "未知校验错误" }, { status: 400 });
  }

  try {
    const created = await createPendingSong(parsed);
    if (!created) {
      return NextResponse.json({ error: "数据库未配置，无法接收投稿" }, { status: 503 });
    }
    return NextResponse.json({ ok: true, id: created.id, status: "pending" }, { status: 201 });
  } catch (err) {
    console.error("[api/songs POST] insert failed", err);
    return NextResponse.json({ error: "写入失败" }, { status: 500 });
  }
}
