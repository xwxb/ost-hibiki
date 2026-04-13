import { z } from 'zod';

export const mediaUrlsSchema = z
  .object({
    ytb_url: z.string().url().optional(),
    bili_url: z.string().url().optional(),
    netease_url: z.string().url().optional()
  })
  .refine((value) => Boolean(value.ytb_url || value.bili_url || value.netease_url), {
    message: 'media_urls 至少需要一个有效地址'
  });

const extrasValueSchema: z.ZodType<string | number | boolean | string[]> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string())
]);

export const songSchema = z.object({
  id: z.string().min(1),
  song_title: z.string().min(1, 'song_title 必填'),
  subtitle: z.string().optional(),
  tags: z.array(z.string()).default([]),
  composer: z.string().optional(),
  bangumi_id: z.number().int().optional(),
  media_urls: mediaUrlsSchema,
  img_urls: z.array(z.string().url()).min(1, 'img_urls 至少 1 张'),
  extras: z.record(extrasValueSchema).optional()
});

export const songArraySchema = z.array(songSchema);

export type OstSongItem = z.infer<typeof songSchema>;
