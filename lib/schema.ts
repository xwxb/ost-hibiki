import { z } from "zod";

const mediaUrlSchema = z
  .string()
  .trim()
  .url()
  .or(z.literal(""))
  .transform((value) => value.trim());

export const mediaUrlsSchema = z.object({
  ytb_url: mediaUrlSchema.optional(),
  bili_url: mediaUrlSchema.optional(),
  netease_url: mediaUrlSchema.optional()
});

export const ostSongSchema = z
  .object({
    id: z.union([z.number().int().positive(), z.string().trim().min(1)]),
    song_title: z.string().trim().min(1),
    subtitle: z.string().trim().optional(),
    tags: z.array(z.string().trim()).default([]),
    composer: z.string().trim().optional(),
    bangumi_id: z.number().int().positive().optional(),
    media_urls: mediaUrlsSchema,
    img_urls: z.array(z.string().trim().url()).min(1),
    extras: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).optional()
  })
  .superRefine((value, ctx) => {
    const hasMedia = Boolean(value.media_urls.ytb_url || value.media_urls.bili_url || value.media_urls.netease_url);
    if (!hasMedia) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["media_urls"],
        message: "至少需要一个媒体链接"
      });
    }
  });

export type OstSongItem = z.infer<typeof ostSongSchema>;

export function parseSong(input: unknown): OstSongItem {
  return ostSongSchema.parse(input);
}
