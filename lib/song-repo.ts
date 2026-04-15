import type { Collection, Db, Filter, WithId } from "mongodb";
import { ObjectId } from "mongodb";
import { getMongoClient } from "./mongo";
import { parseSong, type OstSongItem } from "./schema";
import { sampleSongs } from "./sample-data";
import { buildSongQuery, filterSongs, type SongFilter } from "./song-utils";

const DB_NAME = process.env.MONGODB_DB ?? "ost_hibiki";
const COLLECTION = process.env.MONGODB_COLLECTION ?? "songs";
const COUNTER_COLLECTION = process.env.MONGODB_COUNTER_COLLECTION ?? "counters";
const SONG_ID_COUNTER_KEY = "songs";

type RawSongDoc = Omit<OstSongItem, "id"> & {
  id?: number | string;
  _id?: ObjectId | string;
};

type CounterDoc = {
  _id: string;
  seq: number;
};

function parseNumericId(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

async function ensureSongIdCounterAtLeast(db: Db, min: number): Promise<void> {
  await db
    .collection<CounterDoc>(COUNTER_COLLECTION)
    .updateOne({ _id: SONG_ID_COUNTER_KEY }, { $max: { seq: min } }, { upsert: true });
}

async function getNextSongId(db: Db): Promise<number> {
  const result = await db.collection<CounterDoc>(COUNTER_COLLECTION).findOneAndUpdate(
    { _id: SONG_ID_COUNTER_KEY },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  return result?.seq ?? 1;
}

async function ensureMongoSongId(db: Db, collection: Collection<RawSongDoc>, doc: WithId<RawSongDoc>): Promise<RawSongDoc> {
  const existingId = parseNumericId(doc.id);
  if (existingId) return doc;
  if (typeof doc.id === "string" && doc.id.trim()) return doc;

  const nextId = await getNextSongId(db);
  await collection.updateOne({ _id: doc._id }, { $set: { id: nextId } });
  return {
    ...doc,
    id: nextId
  };
}

function normalizeMongoDoc(doc: WithId<RawSongDoc> | RawSongDoc): OstSongItem {
  const idFromField = parseNumericId(doc.id) ?? (typeof doc.id === "string" ? doc.id : "");
  const id = idFromField || (typeof doc._id === "string" ? doc._id : doc._id?.toHexString()) || "";
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

  const db = client.db(DB_NAME);
  const collection = db.collection<RawSongDoc>(COLLECTION);
  const docs = await collection.find(toMongoFilter(filter)).limit(120).toArray();

  const maxExistingId = docs.reduce((max, doc) => Math.max(max, parseNumericId(doc.id) ?? 0), 0);
  if (maxExistingId > 0) {
    await ensureSongIdCounterAtLeast(db, maxExistingId);
  }

  const normalizedDocs = await Promise.all(docs.map((doc) => ensureMongoSongId(db, collection, doc)));
  return normalizedDocs.map(normalizeMongoDoc);
}

export async function getSongById(id: string): Promise<OstSongItem | null> {
  const client = await getMongoClient();
  if (!client) return sampleSongs.find((song) => String(song.id) === id) ?? null;

  const db = client.db(DB_NAME);
  const collection = db.collection<RawSongDoc>(COLLECTION);
  const clauses: Filter<RawSongDoc>[] = [];
  const numericId = parseNumericId(id);
  if (numericId) clauses.push({ id: numericId }, { id });
  if (!numericId) clauses.push({ id });
  if (ObjectId.isValid(id)) clauses.push({ _id: new ObjectId(id) });
  const doc = await collection.findOne({ $or: clauses });
  if (!doc) return null;
  const normalized = await ensureMongoSongId(db, collection, doc);
  return normalizeMongoDoc(normalized);
}
