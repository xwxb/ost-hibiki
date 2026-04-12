# OST MVP 计划（单轮交付版）

## 目标

忠实复现 `prototype` 原型作为主页面体验。  
首页只做极简搜索，按 `song_title`、`subtitle`、`tags` 查询 Mongo。  
支持用户在前端手动添加临时曲目并存入 `localStorage`，与 API 数据合并展示。

## 范围

1. 前端两页：
- `/`：搜索页（风格与原型一致）
- `/song/[id]`：曲目展示页（核心页面，复现原型）
2. API（Vercel Serverless）：
- `GET /api/songs`：列表 + 关键词/标签过滤
- `GET /api/songs/:id`：单曲详情
3. 数据：
- Mongo 为远端主数据
- localStorage 为本地临时补充数据（仅当前用户可见）
4. 测试：
- schema 校验测试
- API 路由测试
- 搜索合并逻辑测试（Mongo 数据 + localStorage 数据）

## 实施顺序

1. 定稿 schema（以 `docs/schema.md` 为准）。
2. 实现最小 API（可直接被前端联调）。
3. 按原型完成主页面复现（沉浸模式去掉背景波纹动效，其余尽量忠实）。
4. 补首页搜索与 localStorage 临时添加。
5. 补测试并跑通。

## 非目标（本轮不做）

1. Bangumi 自动同步/定时抓取。
2. 专辑文档模型（当前只做 song 文档）。
3. 用户系统、后台管理、审核流。
4. 提交 localStorage 到后端的持久化接口（后续再做）。
