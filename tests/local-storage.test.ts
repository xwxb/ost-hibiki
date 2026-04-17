import { afterEach, beforeEach, describe, expect, it } from "vitest";

// 自实现最小 localStorage，避免引入 jsdom 依赖。
// 仅覆盖 lib/local-storage.ts 用到的 getItem / setItem / removeItem。
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

const memoryStorage = new MemoryStorage();
(globalThis as unknown as { window: { localStorage: MemoryStorage } }).window = {
  localStorage: memoryStorage
};
import {
  SUBMITTED_LOCAL_SONG_IDS_KEY,
  TEMP_SONGS_KEY,
  addLocalSong,
  exportLocalSongsJson,
  getLocalSongs,
  getSubmittedLocalSongIds,
  importLocalSongsFromJson,
  markLocalSongSubmitted,
  removeLocalSong,
  updateLocalSong
} from "@/lib/local-storage";
import { parseSong, type OstSongItem } from "@/lib/schema";

function makeSong(idSuffix: string, overrides: Partial<OstSongItem> = {}): OstSongItem {
  return parseSong({
    id: `temp-${idSuffix}`,
    song_title: `Song ${idSuffix}`,
    tags: ["OST"],
    media_urls: { ytb_url: "https://www.youtube.com/watch?v=test" },
    img_urls: ["https://img.example.com/1.jpg"],
    ...overrides
  });
}

beforeEach(() => {
  memoryStorage.clear();
});

afterEach(() => {
  memoryStorage.clear();
});

describe("local-storage CRUD", () => {
  it("adds a song and reads it back", () => {
    const song = makeSong("a");
    addLocalSong(song);
    const list = getLocalSongs();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("temp-a");
  });

  it("updates an existing song by id", () => {
    addLocalSong(makeSong("a", { song_title: "Old" }));
    updateLocalSong(makeSong("a", { song_title: "New" }));
    const list = getLocalSongs();
    expect(list).toHaveLength(1);
    expect(list[0].song_title).toBe("New");
  });

  it("removes a song by id", () => {
    addLocalSong(makeSong("a"));
    addLocalSong(makeSong("b"));
    removeLocalSong("temp-a");
    const list = getLocalSongs();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("temp-b");
  });

  it("addLocalSong de-dupes by id (latest wins, kept first)", () => {
    addLocalSong(makeSong("a", { song_title: "First" }));
    addLocalSong(makeSong("a", { song_title: "Second" }));
    const list = getLocalSongs();
    expect(list).toHaveLength(1);
    expect(list[0].song_title).toBe("Second");
  });

  it("export -> import round trip preserves data", () => {
    addLocalSong(makeSong("a"));
    addLocalSong(makeSong("b"));
    const json = exportLocalSongsJson();
    memoryStorage.removeItem(TEMP_SONGS_KEY);
    const result = importLocalSongsFromJson(json, "replace");
    expect(result.added).toBe(2);
    expect(result.errors).toEqual([]);
    expect(getLocalSongs()).toHaveLength(2);
  });

  it("import collects errors but keeps valid items", () => {
    const result = importLocalSongsFromJson(
      JSON.stringify([
        // valid
        {
          id: "temp-x",
          song_title: "OK",
          tags: [],
          media_urls: { ytb_url: "https://www.youtube.com/watch?v=t" },
          img_urls: ["https://img.example.com/1.jpg"]
        },
        // invalid: no media url
        {
          id: "temp-y",
          song_title: "Bad",
          tags: [],
          media_urls: {},
          img_urls: ["https://img.example.com/1.jpg"]
        }
      ])
    );
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(getLocalSongs()).toHaveLength(1);
  });

  it("import handles malformed JSON gracefully", () => {
    const result = importLocalSongsFromJson("not-json");
    expect(result.added).toBe(0);
    expect(result.errors).toHaveLength(1);
  });

  it("marks submitted local songs without duplicates", () => {
    const first = markLocalSongSubmitted("temp-a");
    expect(first).toEqual(["temp-a"]);
    const second = markLocalSongSubmitted("temp-a");
    expect(second).toEqual(["temp-a"]);
    expect(getSubmittedLocalSongIds()).toEqual(["temp-a"]);
    expect(memoryStorage.getItem(SUBMITTED_LOCAL_SONG_IDS_KEY)).toBe(JSON.stringify(["temp-a"]));
  });
});
