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

// status 用于云端审核流程：
// - approved：公开可见（querySongs 默认只返回此状态以及 status 缺失的老文档）
// - pending：用户通过 /api/songs POST 投稿后默认状态，需人工审核
// - rejected：审核驳回，不再公开
// 默认值取 approved 是为了不破坏历史数据 parse；POST 路由会在服务端强制覆盖为 pending，避免客户端绕过。
export const songStatusSchema = z.enum(["pending", "approved", "rejected"]);
export type SongStatus = z.infer<typeof songStatusSchema>;

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
    status: songStatusSchema.default("approved"),
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

// 云端投稿入参：客户端不应自行决定 id / status。
// 复用主 schema 但去掉这两个字段，配合 superRefine 校验媒体源至少一个。
export const songSubmissionSchema = z
  .object({
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

export type SongSubmissionInput = z.infer<typeof songSubmissionSchema>;
