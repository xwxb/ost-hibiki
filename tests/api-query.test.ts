import { describe, expect, it } from "vitest";
import { buildSongQuery } from "@/lib/song-utils";

describe("api-query", () => {
  it("normalizes q and tags", () => {
    const result = buildSongQuery({
      q: "  test  ",
      tags: [" OST ", "", "Piano"]
    });
    expect(result).toEqual({
      q: "test",
      tags: ["OST", "Piano"]
    });
  });
});
