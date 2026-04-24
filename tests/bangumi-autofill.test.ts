import { describe, expect, it } from "vitest";
import { collectTags, mapBangumiToAutofill, pickComposer, type BangumiRelatedPerson, type BangumiSubject } from "@/lib/bangumi-autofill";

describe("bangumi-autofill", () => {
  it("maps subject fields for autofill payload", () => {
    const subject: BangumiSubject = {
      id: 622928,
      name: "Way of leaving (feat.o.j.o)",
      name_cn: "离去之路",
      tags: [{ name: "OST" }, { name: "Piano" }],
      meta_tags: ["Emotional"]
    };
    const persons: BangumiRelatedPerson[] = [{ name: "伊賀拓郎", relation: "作曲" }];

    expect(mapBangumiToAutofill(subject, persons)).toEqual({
      bangumi_id: 622928,
      song_title: "Way of leaving (feat.o.j.o)",
      subtitle: "离去之路",
      tags: ["OST", "Piano", "Emotional"],
      composer: "伊賀拓郎"
    });
  });

  it("extracts composer from infobox when person relation is missing", () => {
    const subject: BangumiSubject = {
      id: 100,
      name: "Sample",
      infobox: [{ key: "作曲", value: [{ v: "菅野よう子" }] }]
    };

    expect(pickComposer(subject, [])).toBe("菅野よう子");
  });

  it("deduplicates tags case-insensitively", () => {
    const subject: BangumiSubject = {
      id: 1,
      name: "x",
      tags: [{ name: "OST" }, { name: "ost" }, { name: "Piano" }],
      meta_tags: ["piano", "Anime"]
    };

    expect(collectTags(subject)).toEqual(["OST", "Piano", "Anime"]);
  });
});
