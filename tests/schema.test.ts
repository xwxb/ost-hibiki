import { describe, expect, it } from "vitest";
import { parseSong, songSubmissionSchema } from "@/lib/schema";

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

  it("defaults status to approved when missing", () => {
    const song = parseSong({
      id: 1,
      song_title: "X",
      tags: [],
      media_urls: { ytb_url: "https://www.youtube.com/watch?v=t" },
      img_urls: ["https://img.example.com/1.jpg"]
    });
    expect(song.status).toBe("approved");
  });

  it("preserves explicit status", () => {
    const song = parseSong({
      id: 1,
      song_title: "X",
      tags: [],
      media_urls: { ytb_url: "https://www.youtube.com/watch?v=t" },
      img_urls: ["https://img.example.com/1.jpg"],
      status: "pending"
    });
    expect(song.status).toBe("pending");
  });
});

describe("songSubmissionSchema", () => {
  const validInput = {
    song_title: "X",
    tags: [],
    media_urls: { ytb_url: "https://www.youtube.com/watch?v=t" },
    img_urls: ["https://img.example.com/1.jpg"]
  };

  it("accepts a clean submission", () => {
    const parsed = songSubmissionSchema.parse(validInput);
    expect(parsed.song_title).toBe("X");
    expect(parsed.img_urls).toHaveLength(1);
  });

  it("rejects submissions with no media url", () => {
    expect(() =>
      songSubmissionSchema.parse({
        ...validInput,
        media_urls: {}
      })
    ).toThrow();
  });

  it("rejects submissions with empty img_urls", () => {
    expect(() =>
      songSubmissionSchema.parse({
        ...validInput,
        img_urls: []
      })
    ).toThrow();
  });
});
