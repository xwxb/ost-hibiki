import type { OstSongItem } from '@/lib/schema';

export function normalizeSearchQuery(q?: string) {
  return (q ?? '').trim().toLowerCase();
}

export function normalizeTag(tag?: string) {
  return (tag ?? '').trim().toLowerCase();
}

export function matchSongByQuery(song: OstSongItem, q?: string, tag?: string) {
  const keyword = normalizeSearchQuery(q);
  const normalizedTag = normalizeTag(tag);

  const inKeyword =
    !keyword ||
    song.song_title.toLowerCase().includes(keyword) ||
    (song.subtitle ?? '').toLowerCase().includes(keyword) ||
    song.tags.some((item) => item.toLowerCase().includes(keyword));

  const inTag = !normalizedTag || song.tags.some((item) => item.toLowerCase() === normalizedTag);

  return inKeyword && inTag;
}
