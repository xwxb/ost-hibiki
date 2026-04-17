"use client";

/**
 * 首页：搜索 + 临时曲目管理 + 云端投稿。
 *
 * 模块拆分：
 * 1. 搜索 / 分页：和后端只在 q 变化时拉取（现保持简单实现）。
 * 2. 临时曲目（localStorage）：增 / 改 / 删 / 导入 / 导出。
 * 3. 云端投稿：复用同一表单，按下「提交云端审核」走 POST /api/songs，
 *    成功后同时落一份到 localStorage，避免用户刷新就找不到。
 */

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  addLocalSong,
  exportLocalSongsJson,
  getLocalSongs,
  importLocalSongsFromJson,
  removeLocalSong,
  updateLocalSong,
  type ImportResult
} from "@/lib/local-storage";
import { usePreloadImages } from "@/lib/image-preloader";
import { parseSong, songSubmissionSchema, type OstSongItem } from "@/lib/schema";
import { filterSongs, mergeSongs } from "@/lib/song-utils";
import { handleImgError } from "@/lib/image-fallback";
import { ImageUrlListEditor } from "./image-url-list-editor";


//=== 表单类型与初始值
type FormState = {
  song_title: string;
  subtitle: string;
  tags: string;
  composer: string;
  ytb_url: string;
  bili_url: string;
  netease_url: string;
  img_urls: string[];
  bangumi_id: string;
};

const EMPTY_FORM: FormState = {
  song_title: "",
  subtitle: "",
  tags: "",
  composer: "",
  ytb_url: "",
  bili_url: "",
  netease_url: "",
  img_urls: [],
  bangumi_id: ""
};

type SongsResponse = { items: OstSongItem[] };
const PAGE_SIZE = 9;
const DEBOUNCE_MS = 300;


//=== 工具函数
function sourceCount(song: OstSongItem) {
  return [song.media_urls.ytb_url, song.media_urls.bili_url, song.media_urls.netease_url].filter(Boolean).length;
}

function isLocalSong(song: OstSongItem) {
  return typeof song.id === "string" && song.id.startsWith("temp-");
}

// 把 zod issues 拍平到 fieldErrors map：以顶层字段名作 key，仅取首个错误。
function flattenIssues(issues: Array<{ path: (string | number)[]; message: string }>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "_form");
    if (!map[key]) map[key] = issue.message;
  }
  return map;
}

// 把表单 state 转成可被 schema 校验的对象（不含 id/status）。
function buildSubmissionPayload(form: FormState) {
  return {
    song_title: form.song_title,
    subtitle: form.subtitle || undefined,
    tags: form.tags.split(",").map((value) => value.trim()).filter(Boolean),
    composer: form.composer || undefined,
    bangumi_id: form.bangumi_id ? Number(form.bangumi_id) : undefined,
    media_urls: {
      ytb_url: form.ytb_url || undefined,
      bili_url: form.bili_url || undefined,
      netease_url: form.netease_url || undefined
    },
    img_urls: form.img_urls.map((url) => url.trim()).filter(Boolean)
  };
}

// 把已有 song 反向回填到表单（编辑模式用）。
function songToForm(song: OstSongItem): FormState {
  return {
    song_title: song.song_title,
    subtitle: song.subtitle ?? "",
    tags: song.tags.join(","),
    composer: song.composer ?? "",
    ytb_url: song.media_urls.ytb_url ?? "",
    bili_url: song.media_urls.bili_url ?? "",
    netease_url: song.media_urls.netease_url ?? "",
    img_urls: [...song.img_urls],
    bangumi_id: song.bangumi_id ? String(song.bangumi_id) : ""
  };
}


export function SearchHome() {
  //=== 列表 / 搜索状态
  const [query, setQuery] = useState("");
  const [remoteSongs, setRemoteSongs] = useState<OstSongItem[]>([]);
  const [localSongs, setLocalSongs] = useState<OstSongItem[]>([]);
  const [page, setPage] = useState(1);
  const [isPending, setIsPending] = useState(false);
  const deferredQuery = useDeferredValue(query);


  //=== 表单 / 编辑模式
  const [showTempForm, setShowTempForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [importFeedback, setImportFeedback] = useState<(ImportResult & { isError?: boolean }) | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);
  const lastRequestedQueryRef = useRef<string | null>(null);


  //=== 初始化 & 派生
  useEffect(() => {
    setLocalSongs(getLocalSongs());
    setIsPending(true);
    triggerRemoteLoad("");
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const songs = useMemo(() => {
    const merged = mergeSongs(remoteSongs, localSongs);
    return filterSongs(merged, { q: deferredQuery });
  }, [deferredQuery, localSongs, remoteSongs]);

  useEffect(() => {
    setPage(1);
  }, [deferredQuery, songs.length]);

  const totalPages = Math.max(1, Math.ceil(songs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedSongs = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return songs.slice(start, start + PAGE_SIZE);
  }, [safePage, songs]);
  const hasQuery = query.trim().length > 0;

  const nextPageStart = safePage * PAGE_SIZE;
  usePreloadImages(pagedSongs.map((song) => song.img_urls[0]).filter(Boolean), "high");
  usePreloadImages(songs.slice(nextPageStart, nextPageStart + PAGE_SIZE).map((song) => song.img_urls[0]).filter(Boolean), "low");


  //=== 后端 / 搜索
  async function loadRemote(q: string, signal: AbortSignal, requestSeq: number) {
    try {
      const response = await fetch(`/api/songs?q=${encodeURIComponent(q)}`, { cache: "no-store", signal });
      if (!response.ok) return;
      const data = (await response.json()) as SongsResponse;
      if (signal.aborted || requestSeq !== requestSeqRef.current) return;
      setRemoteSongs(data.items);
    } catch {
      if (signal.aborted || requestSeq !== requestSeqRef.current) return;
    } finally {
      if (!signal.aborted && requestSeq === requestSeqRef.current) {
        setIsPending(false);
      }
    }
  }

  function triggerRemoteLoad(value: string) {
    if (value === lastRequestedQueryRef.current) {
      setIsPending(false);
      return;
    }
    lastRequestedQueryRef.current = value;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const nextSeq = requestSeqRef.current + 1;
    requestSeqRef.current = nextSeq;
    void loadRemote(value, controller.signal, nextSeq);
  }

  function handleSearch(value: string) {
    setQuery(value);
    setPage(1);
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    setIsPending(true);
    debounceRef.current = setTimeout(() => {
      triggerRemoteLoad(value);
    }, DEBOUNCE_MS);
  }


  //=== 表单基础操作
  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (fieldErrors[key as string]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key as string];
        return next;
      });
    }
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError("");
    setEditingId(null);
  }

  function openCreate() {
    resetForm();
    setShowTempForm(true);
  }

  function startEdit(song: OstSongItem) {
    setForm(songToForm(song));
    setEditingId(String(song.id));
    setFieldErrors({});
    setFormError("");
    setShowTempForm(true);
  }

  // 表单校验：返回校验后的 payload，若失败设置 fieldErrors 并返回 null。
  function validateForm(): ReturnType<typeof buildSubmissionPayload> | null {
    const payload = buildSubmissionPayload(form);
    const result = songSubmissionSchema.safeParse(payload);
    if (!result.success) {
      setFieldErrors(flattenIssues(result.error.issues));
      setFormError("请修正标红字段后再提交");
      return null;
    }
    setFieldErrors({});
    setFormError("");
    return payload;
  }


  //=== 本地保存（创建 / 编辑）
  function handleSaveLocal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = validateForm();
    if (!payload) return;
    try {
      if (editingId) {
        const draft = parseSong({ ...payload, id: editingId });
        setLocalSongs(updateLocalSong(draft));
      } else {
        const draft = parseSong({ ...payload, id: `temp-${crypto.randomUUID()}` });
        setLocalSongs(addLocalSong(draft));
      }
      resetForm();
      setShowTempForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "保存失败");
    }
  }


  //=== 本地删除
  function handleDeleteLocal(song: OstSongItem) {
    if (!isLocalSong(song)) return;
    if (!confirm(`确认删除本地曲目「${song.song_title}」？`)) return;
    setLocalSongs(removeLocalSong(song.id));
    if (editingId === String(song.id)) resetForm();
  }


  //=== 云端投稿
  async function handleSubmitCloud() {
    const payload = validateForm();
    if (!payload) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/songs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (response.status === 429) {
        setFormError("提交过于频繁，请稍后再试");
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setFormError(typeof data?.error === "string" ? data.error : `提交失败（${response.status}）`);
        return;
      }
      // 提交成功：同时落一份到本地，让当前浏览器立即可见，避免审核期间空窗
      try {
        const local = parseSong({ ...payload, id: `temp-${crypto.randomUUID()}` });
        setLocalSongs(addLocalSong(local));
      } catch {
        // 本地落库失败不影响主流程
      }
      resetForm();
      setShowTempForm(false);
      alert("已提交云端，待管理员审核通过后将公开展示。");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "网络错误");
    } finally {
      setSubmitting(false);
    }
  }


  //=== 导入 / 导出
  function handleExport() {
    const blob = new Blob([exportLocalSongsJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ost-hibiki-local-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const result = importLocalSongsFromJson(text, "merge");
      setLocalSongs(getLocalSongs());
      setImportFeedback({ ...result, isError: result.errors.length > 0 && result.added === 0 });
    } catch (err) {
      setImportFeedback({ added: 0, skipped: 0, errors: [(err as Error).message], isError: true });
    }
  }


  //=== 渲染
  return (
    <main className="search-page">
      <div className="search-ambient" />
      <section className="search-shell">
        <header className="search-header">
          <p className="eyebrow">Ost Hibiki</p>
          <h1>音の余韻</h1>
          <p>Search by title, subtitle, or tag.</p>
        </header>

        <div className="search-toolbar">
          <div className="search-box">
            <input
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="搜索曲名 / subtitle / tag"
            />
            <span>{isPending ? "Searching..." : `${songs.length} songs`}</span>
          </div>
          <button
            className="temp-entry-trigger"
            onClick={() => (showTempForm ? (resetForm(), setShowTempForm(false)) : openCreate())}
          >
            {showTempForm ? "收起表单" : "添加临时曲目"}
          </button>
        </div>

        <div className="song-grid">
          {pagedSongs.map((song, index) => (
            <div key={String(song.id)} className="song-card-wrap">
              <Link href={`/song/${song.id}`} className="song-card">
                <img
                  src={song.img_urls[0]}
                  alt={song.song_title}
                  onError={handleImgError}
                  decoding="async"
                  loading={index < 3 ? "eager" : "lazy"}
                  fetchPriority={index < 3 ? "high" : "low"}
                />
                <div className="song-card-body">
                  <div className="song-card-topline">
                    <span>{sourceCount(song)} sources</span>
                    {isLocalSong(song) ? <span className="song-card-badge">Local</span> : null}
                  </div>
                  <h2>{song.song_title}</h2>
                  <p>{song.subtitle ?? " "}</p>
                  <div className="song-card-meta">
                    <span>{song.composer ?? "Unknown composer"}</span>
                  </div>
                  <div className="tags">
                    {song.tags.slice(0, 3).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </div>
              </Link>
              {isLocalSong(song) ? (
                <div className="song-card-actions">
                  <button type="button" title="编辑" onClick={() => startEdit(song)}>✎</button>
                  <button type="button" title="删除" onClick={() => handleDeleteLocal(song)}>✕</button>
                </div>
              ) : null}
            </div>
          ))}
          {songs.length === 0 ? (
            <div className="empty-tip">
              <strong>{hasQuery ? "没有找到匹配曲目" : "还没有可展示的曲目"}</strong>
              <p>{hasQuery ? "换一个标题、标签或副标题关键词试试。" : "连接 Mongo 后会显示正式数据，也可以先添加本地临时曲目。"}</p>
            </div>
          ) : null}
        </div>

        {songs.length > PAGE_SIZE ? (
          <div className="pager">
            <button disabled={safePage === 1} onClick={() => setPage(Math.max(1, safePage - 1))}>
              Prev
            </button>
            <span>
              {safePage} / {totalPages}
            </span>
            <button disabled={safePage === totalPages} onClick={() => setPage(Math.min(totalPages, safePage + 1))}>
              Next
            </button>
          </div>
        ) : null}

        {showTempForm ? (
          <form className="temp-form" onSubmit={handleSaveLocal}>
            <div className="temp-form-head">
              <div>
                <h3>{editingId ? "Edit Local Entry" : "Temporary Entry"}</h3>
                <p>{editingId ? "更新已有本地曲目。" : "默认仅存浏览器；提交云端将进入待审。"}</p>
              </div>
              <div className="temp-form-actions">
                <button type="button" className="btn-ghost" onClick={handleExport}>导出 JSON</button>
                <button type="button" className="btn-ghost" onClick={handleImportClick}>导入 JSON</button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportFile}
                  style={{ display: "none" }}
                />
              </div>
            </div>

            {importFeedback ? (
              <p className={`io-feedback ${importFeedback.isError ? "is-error" : ""}`}>
                导入完成：成功 {importFeedback.added} 条，跳过 {importFeedback.skipped} 条
                {importFeedback.errors.length ? `；错误：${importFeedback.errors.slice(0, 2).join(" / ")}` : ""}
              </p>
            ) : null}

            <div className="form-grid form-grid-main">
              <input
                value={form.song_title}
                onChange={(e) => updateField("song_title", e.target.value)}
                placeholder="song_title*"
                className={fieldErrors.song_title ? "is-invalid" : ""}
              />
              <input value={form.subtitle} onChange={(e) => updateField("subtitle", e.target.value)} placeholder="subtitle" />
              <input value={form.tags} onChange={(e) => updateField("tags", e.target.value)} placeholder="tags: a,b,c" />
            </div>
            {fieldErrors.song_title ? <p className="field-error">song_title：{fieldErrors.song_title}</p> : null}

            <div className="form-grid form-grid-secondary">
              <input value={form.composer} onChange={(e) => updateField("composer", e.target.value)} placeholder="composer" />
              <input
                value={form.ytb_url}
                onChange={(e) => updateField("ytb_url", e.target.value)}
                placeholder="ytb_url"
                className={fieldErrors.media_urls ? "is-invalid" : ""}
              />
              <input
                value={form.bili_url}
                onChange={(e) => updateField("bili_url", e.target.value)}
                placeholder="bili_url"
                className={fieldErrors.media_urls ? "is-invalid" : ""}
              />
            </div>

            <div className="form-grid form-grid-secondary">
              <input
                value={form.netease_url}
                onChange={(e) => updateField("netease_url", e.target.value)}
                placeholder="netease_url"
                className={fieldErrors.media_urls ? "is-invalid" : ""}
              />
              <input
                value={form.bangumi_id}
                onChange={(e) => updateField("bangumi_id", e.target.value)}
                placeholder="bangumi_id"
              />
              <div />
            </div>
            {fieldErrors.media_urls ? <p className="field-error">media_urls：{fieldErrors.media_urls}</p> : null}

            <label className="field-label">img_urls *</label>
            <ImageUrlListEditor
              urls={form.img_urls}
              onChange={(next) => updateField("img_urls", next)}
              invalid={Boolean(fieldErrors.img_urls)}
            />
            {fieldErrors.img_urls ? <p className="field-error">img_urls：{fieldErrors.img_urls}</p> : null}

            <div className="temp-form-actions">
              <button type="submit" disabled={submitting}>
                {editingId ? "保存修改" : "保存到 localStorage"}
              </button>
              {!editingId ? (
                <button type="button" className="btn-secondary" onClick={handleSubmitCloud} disabled={submitting}>
                  {submitting ? "提交中..." : "提交云端审核"}
                </button>
              ) : null}
              {editingId ? (
                <button type="button" className="btn-ghost" onClick={() => { resetForm(); setShowTempForm(false); }}>
                  取消编辑
                </button>
              ) : null}
            </div>
            {formError ? <p className="form-error">{formError}</p> : null}
          </form>
        ) : null}
      </section>
    </main>
  );
}
