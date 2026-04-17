import { describe, expect, it } from "vitest";
import type { OstSongItem } from "@/lib/schema";
import { filterSongs, mergeSongs } from "@/lib/song-utils";

const baseSong: OstSongItem = {
  id: "song-1",
  song_title: "Way of leaving",
  subtitle: "Oshi no Ko OST",
  tags: ["OST", "Piano"],
  media_urls: {
    ytb_url: "https://www.youtube.com/watch?v=a"
  },
  img_urls: ["https://img.example.com/1.jpg"],
  status: "approved"
};

describe("song-utils", () => {
  it("filters by title and tags", () => {
    const songs = [baseSong];
    expect(filterSongs(songs, { q: "way" })).toHaveLength(1);
    expect(filterSongs(songs, { q: "unknown" })).toHaveLength(0);
    expect(filterSongs(songs, { tags: ["OST"] })).toHaveLength(1);
  });

  it("merges local songs with overwrite by id", () => {
    const remote = [baseSong];
    const local = [{ ...baseSong, subtitle: "Local Override" }];
    const merged = mergeSongs(remote, local);
    expect(merged).toHaveLength(1);
    expect(merged[0].subtitle).toBe("Local Override");
  });

  it("treats numeric and string ids as the same key when merging", () => {
    const remote = [{ ...baseSong, id: 101 }];
    const local = [{ ...baseSong, id: "101", subtitle: "Local Override" }];
    const merged = mergeSongs(remote, local);
    expect(merged).toHaveLength(1);
    expect(merged[0].subtitle).toBe("Local Override");
  });
});
