"use client";

import { parseSong, type OstSongItem } from "./schema";

export const TEMP_SONGS_KEY = "ost_hibiki_temp_songs";

export function getLocalSongs(): OstSongItem[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(TEMP_SONGS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown[];
    return parsed.map((item) => parseSong(item));
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
  const next = [song, ...songs.filter((item) => item.id !== song.id)];
  saveLocalSongs(next);
  return next;
}
