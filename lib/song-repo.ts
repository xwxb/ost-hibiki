import type { Collection, Db, Filter, WithId } from "mongodb";
import { ObjectId } from "mongodb";
import { getMongoClient } from "./mongo";
import { parseSong, type OstSongItem, type SongStatus, type SongSubmissionInput } from "./schema";
import { sampleSongs } from "./sample-data";
import { isDuplicateSubmission } from "./submission-dedupe";
import { buildSongQuery, filterSongs, type SongFilter } from "./song-utils";
import { isReviewEnabled } from "./runtime-config";

const DB_NAME = process.env.MONGODB_DB ?? "ost_hibiki";
const COLLECTION = process.env.MONGODB_COLLECTION ?? "songs";
const COUNTER_COLLECTION = process.env.MONGODB_COUNTER_COLLECTION ?? "counters";
const SONG_ID_COUNTER_KEY = "songs";

/**
 * 自增 ID 起点说明（重要，运维相关）：
 * - 正式上线前需要把 counters 集合中 _id="songs" 的 seq 至少推到 99999，
 *   这样 getNextSongId 第一次 $inc 后会返回 100000。
 * - 推送命令（mongosh）：
 *     db.counters.updateOne(
 *       { _id: "songs" },
 *       { $max: { seq: 99999 } },
 *       { upsert: true }
 *     )
 * - 这里的代码不主动写 99999：避免本地 / 测试环境被意外抬高。
 *   ensureSongIdCounterAtLeast 仅在读到老数据 max(id) 时把 seq 抬到与之对齐，
 *   不会越过 99999 这条线。
 */

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

function buildSongIdClauses(id: string): Filter<RawSongDoc>[] {
  const clauses: Filter<RawSongDoc>[] = [];
  const numericId = parseNumericId(id);
  if (numericId) {
    clauses.push({ id: numericId });
    clauses.push({ id: String(numericId) });
  }
  clauses.push({ id });
  if (ObjectId.isValid(id)) clauses.push({ _id: new ObjectId(id) });
  return clauses;
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

  // 默认仅展示已审核通过的曲目；老数据没有 status 字段时按"已通过"对待，避免老库突然全部不可见。
  const statusClause: Filter<RawSongDoc> = { $or: [{ status: "approved" }, { status: { $exists: false } }] };
  if (mongoFilter.$or) {
    return { $and: [{ $or: mongoFilter.$or }, statusClause, ...(mongoFilter.tags ? [{ tags: mongoFilter.tags }] : [])] } as Filter<RawSongDoc>;
  }
  return { ...mongoFilter, ...statusClause };
}

export async function querySongs(filter: SongFilter): Promise<OstSongItem[]> {
  const client = await getMongoClient();
  if (!client) {
    // 本地无 mongo：sample data 一律视为 approved（schema 默认值已处理）
    return filterSongs(sampleSongs, filter);
  }

  const db = client.db(DB_NAME);
  const collection = db.collection<RawSongDoc>(COLLECTION);
  const docs = await collection.find(toMongoFilter(filter)).limit(120).toArray();

  const hasMissingId = docs.some((doc) => doc.id === undefined || doc.id === null || doc.id === "");
  const maxExistingId = docs.reduce((max, doc) => Math.max(max, parseNumericId(doc.id) ?? 0), 0);
  if (hasMissingId && maxExistingId > 0) {
    await ensureSongIdCounterAtLeast(db, maxExistingId);
  }

  const normalizedDocs: RawSongDoc[] = [];
  for (const doc of docs) {
    normalizedDocs.push(await ensureMongoSongId(db, collection, doc));
  }
  return normalizedDocs.map(normalizeMongoDoc);
}

export async function getSongById(id: string): Promise<OstSongItem | null> {
  const client = await getMongoClient();
  if (!client) return sampleSongs.find((song) => String(song.id) === id) ?? null;

  const db = client.db(DB_NAME);
  const collection = db.collection<RawSongDoc>(COLLECTION);
  const doc = await collection.findOne({ $or: buildSongIdClauses(id) });
  if (!doc) return null;
  const normalized = await ensureMongoSongId(db, collection, doc);
  return normalizeMongoDoc(normalized);
}

export async function querySongsByStatus(status: SongStatus, limit = 120): Promise<OstSongItem[]> {
  const client = await getMongoClient();
  if (!client) return sampleSongs.filter((song) => song.status === status).slice(0, limit);

  const db = client.db(DB_NAME);
  const collection = db.collection<RawSongDoc>(COLLECTION);
  const docs = await collection.find({ status }).limit(limit).toArray();
  const normalizedDocs: RawSongDoc[] = [];
  for (const doc of docs) {
    normalizedDocs.push(await ensureMongoSongId(db, collection, doc));
  }
  return normalizedDocs.map(normalizeMongoDoc);
}

export async function updateSongReviewFields(
  id: string,
  patch: {
    status?: SongStatus;
    media_urls?: OstSongItem["media_urls"];
    img_urls?: string[];
  }
): Promise<OstSongItem | null> {
  const client = await getMongoClient();
  if (!client) return null;

  const db = client.db(DB_NAME);
  const collection = db.collection<RawSongDoc>(COLLECTION);
  const updateSet: Partial<RawSongDoc> = {};
  if (patch.status) updateSet.status = patch.status;
  if (patch.media_urls) updateSet.media_urls = patch.media_urls;
  if (patch.img_urls) updateSet.img_urls = patch.img_urls;
  if (!Object.keys(updateSet).length) return null;

  const result = await collection.findOneAndUpdate({ $or: buildSongIdClauses(id) }, { $set: updateSet }, { returnDocument: "after" });
  if (!result) return null;
  const normalized = await ensureMongoSongId(db, collection, result);
  return normalizeMongoDoc(normalized);
}

/**
 * 用户云端投稿写入：强制 status=pending，id 走自增。
 * 失败抛错由路由层统一兜底返回 500。
 */
export async function createPendingSong(
  input: SongSubmissionInput
): Promise<{ id: number | string; deduped: boolean; status: "pending" | "approved" | "rejected" } | null> {
  const client = await getMongoClient();
  if (!client) return null;

  const db = client.db(DB_NAME);
  const collection = db.collection<RawSongDoc>(COLLECTION);
  const sameTitleDocs = await collection
    .find({ song_title: new RegExp(`^${input.song_title.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") })
    .limit(50)
    .toArray();
  const duplicated = sameTitleDocs.find((doc) => isDuplicateSubmission(doc, input));
  if (duplicated) {
    const objectId = duplicated._id instanceof ObjectId ? duplicated._id.toHexString() : typeof duplicated._id === "string" ? duplicated._id : "";
    const duplicatedId =
      parseNumericId(duplicated.id) ??
      (typeof duplicated.id === "string" && duplicated.id.trim() ? duplicated.id : objectId);
    if (duplicatedId) {
      return {
        id: duplicatedId,
        deduped: true,
        status: duplicated.status === "pending" || duplicated.status === "rejected" ? duplicated.status : "approved"
      };
    }
  }

  const id = await getNextSongId(db);
  const status: SongStatus = isReviewEnabled() ? "pending" : "approved";
  await collection.insertOne({
    ...input,
    id,
    status
  } as RawSongDoc);
  return { id, deduped: false, status };
}
