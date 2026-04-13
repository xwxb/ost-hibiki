import { matchSongByQuery } from '@/lib/song-search';
import { songArraySchema, type OstSongItem } from '@/lib/schema';

export const LOCAL_SONGS_KEY = 'ost_hibiki_local_songs';

export function parseLocalSongs(raw: string | null | undefined) {
  if (!raw) {
    return [] as OstSongItem[];
  }

  try {
    const parsed = JSON.parse(raw);
    return songArraySchema.parse(parsed);
  } catch {
    return [] as OstSongItem[];
  }
}

export function serializeLocalSongs(songs: OstSongItem[]) {
  return JSON.stringify(songs);
}

export function upsertLocalSong(currentSongs: OstSongItem[], nextSong: OstSongItem) {
  const cloned = [...currentSongs];
  const idx = cloned.findIndex((item) => item.id === nextSong.id);

  if (idx >= 0) {
    cloned[idx] = nextSong;
    return cloned;
  }

  return [nextSong, ...cloned];
}

export function mergeRemoteAndLocalSongs(options: {
  remoteSongs: OstSongItem[];
  localSongs: OstSongItem[];
  q?: string;
  tag?: string;
}) {
  const combined = [...options.localSongs, ...options.remoteSongs];
  const uniq = combined.filter((item, index, arr) => arr.findIndex((x) => x.id === item.id) === index);

  return uniq.filter((song) => matchSongByQuery(song, options.q, options.tag));
}
