import type { SongSubmissionInput } from "./schema";

type ComparableSong = {
  song_title?: string;
  media_urls?: {
    ytb_url?: string;
    bili_url?: string;
    netease_url?: string;
  };
};

function normalizeText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeUrl(value: string | undefined): string {
  return (value ?? "").trim();
}

export function hasSharedMediaUrl(existing: ComparableSong, incoming: SongSubmissionInput): boolean {
  const existingUrls = new Set(
    [existing.media_urls?.ytb_url, existing.media_urls?.bili_url, existing.media_urls?.netease_url]
      .map(normalizeUrl)
      .filter(Boolean)
  );
  if (existingUrls.size === 0) return false;

  const incomingUrls = [incoming.media_urls.ytb_url, incoming.media_urls.bili_url, incoming.media_urls.netease_url]
    .map(normalizeUrl)
    .filter(Boolean);
  return incomingUrls.some((url) => existingUrls.has(url));
}

export function isDuplicateSubmission(existing: ComparableSong, incoming: SongSubmissionInput): boolean {
  if (normalizeText(existing.song_title) !== normalizeText(incoming.song_title)) return false;
  return hasSharedMediaUrl(existing, incoming);
}

