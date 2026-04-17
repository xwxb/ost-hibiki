# OST Schema（MVP）

约束：一个文档就是一首曲子。  
当前页面只面向单曲展示，不做专辑文档。

```ts
interface OstSongItem {
  id: number | string;

  // 展示与搜索
  song_title: string; // 主搜索字段
  subtitle?: string; // 可搜索
  tags: string[]; // 标签过滤

  // 额外基础信息
  composer?: string;

  // 预留给 Bangumi 跳转（当前不参与核心逻辑）
  bangumi_id?: number;

  // 固定媒体源（iframe）
  media_urls: {
    ytb_url?: string;
    bili_url?: string;
    netease_url?: string;
  };

  // 核心图片（封面/背景）
  img_urls: string[];

  // 审核状态：approved / pending / rejected
  // - 老文档无此字段时一律按 approved 处理（schema 默认）
  // - 用户经 POST /api/songs 投稿写入时，服务端强制 status="pending"
  status: "pending" | "approved" | "rejected";

  // 灵活扩展字段
  extras?: Record<string, string | number | boolean | string[]>;
}
```

## 自增 ID（Mongo）

1. 正式歌曲文档建议使用 `id: number`，由 `counters` 集合维护自增序号。
2. `counters` 集合最小结构：

```ts
interface CounterDoc {
  _id: "songs";
  seq: number; // 当前已分配的最大 song id
}
```

3. 历史文档若缺失 `id`，可在读取时按计数器补齐并回写。
4. 本地临时曲目仍可使用字符串 id（如 `temp-*`）以避免与正式数据冲突。
5. **正式上线 song id 起点为 100000**。上线前手动执行：

```js
db.counters.updateOne(
  { _id: "songs" },
  { $max: { seq: 100000 } },
  { upsert: true }
);
```

## 最小校验

1. `song_title` 必填。
2. `tags` 必填（可为空数组）。
3. `img_urls` 必填（至少 1 张）。
4. `media_urls.ytb_url` / `media_urls.bili_url` / `media_urls.netease_url` 至少一个有值。

## 搜索范围（MVP）

1. 按 `song_title` / `subtitle` / `tags` 关键词搜索。
2. 按 `tags` 过滤，后续实现。
3. 默认仅返回 `status === "approved"` 或不存在 `status` 字段的文档。

## 云端投稿（MVP 简版）

1. 提交入口：`POST /api/songs`，body 与 song 文档一致但不接受 `id` / `status`。
2. 服务端强制 `status="pending"`，`id` 走 counter 自增。
3. 接口含 IP 限流：10 分钟最多 5 次（进程内，未来切 upstash）。
4. 审批暂无后台界面，直接在 mongo 把 `status` 改 `approved` 即可对外可见。
