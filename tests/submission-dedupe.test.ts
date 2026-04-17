import { describe, expect, it } from "vitest";
import type { SongSubmissionInput } from "@/lib/schema";
import { hasSharedMediaUrl, isDuplicateSubmission } from "@/lib/submission-dedupe";

function payload(overrides: Partial<SongSubmissionInput> = {}): SongSubmissionInput {
  return {
    song_title: "Blue Bird",
    subtitle: "OP",
    tags: ["anime"],
    composer: "Ikimonogakari",
    media_urls: {
      ytb_url: "https://www.youtube.com/watch?v=abc123",
      bili_url: undefined,
      netease_url: undefined
    },
    img_urls: ["https://img.example.com/1.jpg"],
    ...overrides
  };
}

describe("submission dedupe", () => {
  it("marks duplicate when title and media overlap", () => {
    const existing = {
      song_title: " blue bird ",
      media_urls: { ytb_url: "https://www.youtube.com/watch?v=abc123" }
    };
    expect(isDuplicateSubmission(existing, payload())).toBe(true);
  });

  it("does not mark duplicate when title differs", () => {
    const existing = {
      song_title: "Silhouette",
      media_urls: { ytb_url: "https://www.youtube.com/watch?v=abc123" }
    };
    expect(isDuplicateSubmission(existing, payload())).toBe(false);
  });

  it("detects overlap across any media field", () => {
    const existing = {
      song_title: "Blue Bird",
      media_urls: { bili_url: "https://www.bilibili.com/video/BV1xx" }
    };
    const incoming = payload({
      media_urls: {
        ytb_url: undefined,
        bili_url: "https://www.bilibili.com/video/BV1xx",
        netease_url: undefined
      }
    });
    expect(hasSharedMediaUrl(existing, incoming)).toBe(true);
  });
});

