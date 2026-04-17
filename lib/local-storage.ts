"use client";

/**
 * 本地临时曲目仓库（仅 localStorage）。
 *
 * 设计目的：
 * - 提供独立于云端 mongo 数据的纯客户端 CRUD，便于用户在没有写入权限的情况下试用 / 留存。
 * - 所有写入路径都经过 zod parse，避免脏数据污染列表。
 * - 临时数据 id 统一使用 `temp-*` 字符串，避免和服务端自增数字 id 冲突。
 */

import { parseSong, type OstSongItem } from "./schema";

export const TEMP_SONGS_KEY = "ost_hibiki_temp_songs";

export type ImportResult = {
  added: number;
  skipped: number;
  errors: string[];
};

export function getLocalSongs(): OstSongItem[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(TEMP_SONGS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    const result: OstSongItem[] = [];
    for (const item of parsed) {
      try {
        result.push(parseSong(item));
      } catch (err) {
        // 单条坏数据不影响整体读取
        console.warn("[local-storage] 跳过非法本地曲目", err);
      }
    }
    return result;
  } catch {
    return [];
  }
}

export function saveLocalSongs(items: OstSongItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TEMP_SONGS_KEY, JSON.stringify(items));
}

export function addLocalSong(song: OstSongItem): OstSongItem[] {
  const songs = getLocalSongs();
  const next = [song, ...songs.filter((item) => String(item.id) !== String(song.id))];
  saveLocalSongs(next);
  return next;
}

export function updateLocalSong(song: OstSongItem): OstSongItem[] {
  const songs = getLocalSongs();
  const targetId = String(song.id);
  const next = songs.map((item) => (String(item.id) === targetId ? song : item));
  saveLocalSongs(next);
  return next;
}

export function removeLocalSong(id: string | number): OstSongItem[] {
  const songs = getLocalSongs();
  const targetId = String(id);
  const next = songs.filter((item) => String(item.id) !== targetId);
  saveLocalSongs(next);
  return next;
}

export function replaceAllLocalSongs(items: OstSongItem[]): OstSongItem[] {
  saveLocalSongs(items);
  return items;
}

/**
 * 导出当前所有本地曲目为 JSON 字符串（pretty）。
 */
export function exportLocalSongsJson(): string {
  return JSON.stringify(getLocalSongs(), null, 2);
}

/**
 * 从 JSON 文本导入本地曲目。
 * - 支持单对象或数组
 * - 逐条 parseSong；失败的会计入 errors，不阻断
 * - mode = "merge"：与现有合并，按 id 去重，新数据覆盖旧的
 * - mode = "replace"：清空后写入
 */
export function importLocalSongsFromJson(jsonText: string, mode: "merge" | "replace" = "merge"): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (err) {
    return { added: 0, skipped: 0, errors: [`JSON 解析失败：${(err as Error).message}`] };
  }
  const list = Array.isArray(raw) ? raw : [raw];
  const valid: OstSongItem[] = [];
  const errors: string[] = [];
  list.forEach((item, idx) => {
    try {
      valid.push(parseSong(item));
    } catch (err) {
      errors.push(`#${idx + 1}: ${(err as Error).message.split("\n")[0]}`);
    }
  });

  const existing = mode === "replace" ? [] : getLocalSongs();
  const map = new Map<string, OstSongItem>();
  for (const item of existing) map.set(String(item.id), item);
  let added = 0;
  for (const item of valid) {
    map.set(String(item.id), item);
    added += 1;
  }
  saveLocalSongs([...map.values()]);
  return { added, skipped: list.length - valid.length, errors };
}
