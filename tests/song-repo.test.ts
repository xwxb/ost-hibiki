import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OstSongItem } from "@/lib/schema";
import { getSongById } from "@/lib/song-repo";
import { getMongoClient } from "@/lib/mongo";

vi.mock("@/lib/mongo", () => ({
  getMongoClient: vi.fn()
}));

const mockedGetMongoClient = vi.mocked(getMongoClient);

const baseDoc: Omit<OstSongItem, "id"> = {
  song_title: "Way of leaving (feat.o.j.o)",
  subtitle: "OST Vol.3",
  tags: ["OST"],
  composer: "Igata Takuo",
  bangumi_id: 622928,
  media_urls: {
    ytb_url: "https://www.youtube.com/watch?v=A4DaX1w7zPs"
  },
  img_urls: ["https://img.example.com/1.jpg"],
  status: "approved",
  extras: {
    prototype: true
  }
};

describe("song-repo getSongById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries both numeric and string id variants for numeric route params", async () => {
    const findOne = vi.fn().mockResolvedValue({
      ...baseDoc,
      id: "1",
      _id: "mongo-oid"
    });
    const updateOne = vi.fn().mockResolvedValue({ matchedCount: 1 });
    const collection = { findOne, updateOne };
    const db = { collection: vi.fn().mockReturnValue(collection) };

    mockedGetMongoClient.mockResolvedValue({
      db: vi.fn().mockReturnValue(db)
    } as never);

    const song = await getSongById("1");

    expect(findOne).toHaveBeenCalledWith({
      $or: expect.arrayContaining([{ id: 1 }, { id: "1" }])
    });
    expect(song?.id).toBe(1);
  });
});
