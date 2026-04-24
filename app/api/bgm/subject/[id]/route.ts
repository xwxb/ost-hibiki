import { NextResponse } from "next/server";
import { mapBangumiToAutofill, type BangumiRelatedPerson, type BangumiSubject } from "@/lib/bangumi-autofill";

const BGM_API_BASE = "https://api.bgm.tv/v0";
const APP_USER_AGENT = "ost-hibiki/1.0 (+https://hibiki.045510.xyz)";

type RouteParams = { params: Promise<{ id: string }> };

function makeHeaders(token: string) {
  return {
    Accept: "application/json",
    "User-Agent": APP_USER_AGENT,
    Authorization: `Bearer ${token}`
  };
}

function toPositiveInt(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function GET(_: Request, { params }: RouteParams) {
  const token = process.env.BGM_AK?.trim();
  if (!token) {
    return NextResponse.json({ error: "Bangumi 数据源暂不可用，请稍后再试。" }, { status: 503 });
  }

  const { id } = await params;
  const bgmId = toPositiveInt(id);
  if (!bgmId) {
    return NextResponse.json({ error: "bangumi_id 必须是正整数。" }, { status: 400 });
  }

  const headers = makeHeaders(token);
  const subjectUrl = `${BGM_API_BASE}/subjects/${bgmId}`;
  const personsUrl = `${BGM_API_BASE}/subjects/${bgmId}/persons`;

  const subjectRes = await fetch(subjectUrl, {
    method: "GET",
    headers,
    cache: "no-store"
  });

  if (subjectRes.status === 404) {
    return NextResponse.json({ error: "未找到对应 Bangumi 条目，请确认 ID。" }, { status: 404 });
  }

  if (subjectRes.status === 401 || subjectRes.status === 403) {
    return NextResponse.json({ error: "Bangumi 鉴权失败，请检查服务配置。" }, { status: 502 });
  }

  if (!subjectRes.ok) {
    return NextResponse.json({ error: "Bangumi 服务暂时不可用，请稍后重试。" }, { status: 502 });
  }

  const subject = (await subjectRes.json()) as BangumiSubject;

  let persons: BangumiRelatedPerson[] = [];
  try {
    const personsRes = await fetch(personsUrl, {
      method: "GET",
      headers,
      cache: "no-store"
    });
    if (personsRes.ok) {
      persons = (await personsRes.json()) as BangumiRelatedPerson[];
    }
  } catch {
    persons = [];
  }

  try {
    const data = mapBangumiToAutofill(subject, persons);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Bangumi 条目信息不完整，无法自动填充。" }, { status: 422 });
  }
}
