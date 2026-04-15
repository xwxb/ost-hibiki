import { describe, expect, it } from "vitest";
import { parseSong } from "@/lib/schema";

describe("schema", () => {
  it("accepts a valid song", () => {
    const song = parseSong({
      id: "x",
      song_title: "My Song",
      tags: ["OST"],
      media_urls: {
        ytb_url: "https://www.youtube.com/watch?v=test"
      },
      img_urls: ["https://img.example.com/1.jpg"]
    });
    expect(song.song_title).toBe("My Song");
  });

  it("rejects empty media urls", () => {
    expect(() =>
      parseSong({
        id: "x",
        song_title: "My Song",
        tags: [],
        media_urls: {},
        img_urls: ["https://img.example.com/1.jpg"]
      })
    ).toThrow();
  });

  it("accepts numeric id for mongo auto-increment docs", () => {
    const song = parseSong({
      id: 1001,
      song_title: "My Song",
      tags: [],
      media_urls: {
        ytb_url: "https://www.youtube.com/watch?v=test"
      },
      img_urls: ["https://img.example.com/1.jpg"]
    });
    expect(song.id).toBe(1001);
  });
});
