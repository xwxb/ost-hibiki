import type { Filter, WithId } from "mongodb";
import { ObjectId } from "mongodb";
import { getMongoClient } from "./mongo";
import { parseSong, type OstSongItem } from "./schema";
import { sampleSongs } from "./sample-data";
import { buildSongQuery, filterSongs, type SongFilter } from "./song-utils";

const DB_NAME = process.env.MONGODB_DB ?? "ost_hibiki";
const COLLECTION = process.env.MONGODB_COLLECTION ?? "songs";

type RawSongDoc = Omit<OstSongItem, "id"> & {
  id?: string;
  _id?: ObjectId | string;
};

function normalizeMongoDoc(doc: WithId<RawSongDoc> | RawSongDoc): OstSongItem {
  const id = doc.id || (typeof doc._id === "string" ? doc._id : doc._id?.toHexString()) || "";
  return parseSong({
    ...doc,
    id
  });
}

function toMongoFilter(filter: SongFilter): Filter<RawSongDoc> {
  const normalized = buildSongQuery(filter);
  const mongoFilter: Filter<RawSongDoc> = {};

  if (normalized.tags && normalized.tags.length > 0) {
    mongoFilter.tags = { $all: normalized.tags };
  }

  if (normalized.q) {
    const regex = new RegExp(normalized.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    mongoFilter.$or = [{ song_title: regex }, { subtitle: regex }, { tags: regex }];
  }

  return mongoFilter;
}

export async function querySongs(filter: SongFilter): Promise<OstSongItem[]> {
  const client = await getMongoClient();
  if (!client) return filterSongs(sampleSongs, filter);

  const collection = client.db(DB_NAME).collection<RawSongDoc>(COLLECTION);
  const docs = await collection.find(toMongoFilter(filter)).limit(120).toArray();
  return docs.map(normalizeMongoDoc);
}

export async function getSongById(id: string): Promise<OstSongItem | null> {
  const client = await getMongoClient();
  if (!client) return sampleSongs.find((song) => song.id === id) ?? null;

  const collection = client.db(DB_NAME).collection<RawSongDoc>(COLLECTION);
  const clauses: Filter<RawSongDoc>[] = [{ id }];
  if (ObjectId.isValid(id)) clauses.push({ _id: new ObjectId(id) });
  const doc = await collection.findOne({ $or: clauses });
  if (!doc) return null;
  return normalizeMongoDoc(doc);
}
