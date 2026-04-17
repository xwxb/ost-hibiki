type SourceType = "youtube" | "bilibili" | "netease";

function safeUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function youtubeIdFrom(value: string): string {
  const url = safeUrl(value);
  if (!url) return value;
  if (url.hostname.includes("youtu.be")) return url.pathname.replace("/", "");
  return url.searchParams.get("v") ?? value;
}

function bilibiliBvidFrom(value: string): string {
  const url = safeUrl(value);
  if (!url) return value;
  const match = url.pathname.match(/\/video\/(BV[\w]+)/i);
  return match?.[1] ?? value;
}

export function buildEmbedUrl(source: SourceType, rawUrl: string, autoplay = false): string {
  if (source === "youtube") {
    const id = youtubeIdFrom(rawUrl);
    const params = new URLSearchParams({
      rel: "0",
      controls: "1",
      playsinline: "1",
      autoplay: autoplay ? "1" : "0"
    });
    return `https://www.youtube.com/embed/${id}?${params.toString()}`;
  }

  if (source === "bilibili") {
    const bvid = bilibiliBvidFrom(rawUrl);
    return `https://player.bilibili.com/player.html?bvid=${bvid}&page=1&high_quality=1&danmaku=0`;
  }

  return rawUrl;
}
