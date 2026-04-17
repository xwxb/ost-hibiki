import type { OstSongItem } from "./schema";

export type SongFilter = {
  q?: string;
  tags?: string[];
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

export function buildSongQuery(filter: SongFilter): SongFilter {
  return {
    q: filter.q?.trim() || undefined,
    tags: (filter.tags ?? []).map((tag) => tag.trim()).filter(Boolean)
  };
}

export function matchSong(song: OstSongItem, filter: SongFilter): boolean {
  const normalized = buildSongQuery(filter);
  if (normalized.tags && normalized.tags.length > 0) {
    const loweredTags = song.tags.map(normalizeToken);
    const required = normalized.tags.map(normalizeToken);
    if (!required.every((tag) => loweredTags.includes(tag))) return false;
  }

  if (!normalized.q) return true;
  const keyword = normalizeToken(normalized.q);
  const fields = [song.song_title, song.subtitle ?? "", ...song.tags].map(normalizeToken);
  return fields.some((value) => value.includes(keyword));
}

export function filterSongs(songs: OstSongItem[], filter: SongFilter): OstSongItem[] {
  return songs.filter((song) => matchSong(song, filter));
}

export function mergeSongs(remoteSongs: OstSongItem[], localSongs: OstSongItem[]): OstSongItem[] {
  const map = new Map<string, OstSongItem>();
  for (const song of remoteSongs) map.set(String(song.id), song);
  for (const song of localSongs) map.set(String(song.id), song);
  return [...map.values()].sort((a, b) => a.song_title.localeCompare(b.song_title));
}
