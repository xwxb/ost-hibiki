import { songArraySchema, songSchema } from '@/lib/schema';
import { getMongoClient, getMongoDatabaseName } from '@/lib/mongo';
import { sampleSongs } from '@/lib/sample-data';
import { matchSongByQuery, normalizeSearchQuery, normalizeTag } from '@/lib/song-search';

export type SongQueryInput = {
  q?: string;
  tag?: string;
};

export async function listSongs(input: SongQueryInput = {}) {
  const query = {
    q: normalizeSearchQuery(input.q),
    tag: normalizeTag(input.tag)
  };

  try {
    const client = await getMongoClient();
    const db = client.db(getMongoDatabaseName());

    const filter: Record<string, unknown> = {};
    if (query.q) {
      filter.$or = [
        { song_title: { $regex: query.q, $options: 'i' } },
        { subtitle: { $regex: query.q, $options: 'i' } },
        { tags: { $elemMatch: { $regex: query.q, $options: 'i' } } }
      ];
    }
    if (query.tag) {
      filter.tags = query.tag;
    }

    const rawDocs = await db.collection('songs').find(filter).sort({ id: 1 }).toArray();
    return songArraySchema.parse(rawDocs);
  } catch {
    return sampleSongs.filter((item) => matchSongByQuery(item, query.q, query.tag));
  }
}

export async function getSongById(id: string) {
  try {
    const client = await getMongoClient();
    const db = client.db(getMongoDatabaseName());

    const doc = await db.collection('songs').findOne({ id });
    if (!doc) {
      return null;
    }

    return songSchema.parse(doc);
  } catch {
    const item = sampleSongs.find((song) => song.id === id);
    return item ?? null;
  }
}
