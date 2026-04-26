"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  addLocalSong,
  exportLocalSongsJson,
  getLocalSongs,
  getSubmittedLocalSongIds,
  importLocalSongsFromJson,
  markLocalSongSubmitted,
  removeLocalSong,
  updateLocalSong,
  type ImportResult
} from "@/lib/local-storage";
import { usePreloadImages } from "@/lib/image-preloader";
import { handleImgError } from "@/lib/image-fallback";
import { parseSong, songSubmissionSchema, type OstSongItem } from "@/lib/schema";
import { filterSongs, mergeSongs } from "@/lib/song-utils";
import { ImageUrlListEditor } from "./image-url-list-editor";

type SongsResponse = { items: OstSongItem[] };
type AdminSongsResponse = { items: OstSongItem[] };
type BgmAutofillResponse = {
  data: {
    bangumi_id: number;
    song_title: string;
    subtitle?: string;
    tags: string[];
    composer?: string;
  };
};

type SourceField = "ytb_url" | "bili_url" | "netease_url";

type FormState = {
  song_title: string;
  subtitle: string;
  tags: string;
  composer: string;
  bangumi_id: string;
  img_urls: string[];
  media_urls: Record<SourceField, string>;
};

const SOURCE_OPTIONS: Array<{ key: SourceField; label: string }> = [
  { key: "ytb_url", label: "YouTube" },
  { key: "bili_url", label: "Bilibili" },
  { key: "netease_url", label: "Netease" }
];

const EMPTY_FORM: FormState = {
  song_title: "",
  subtitle: "",
  tags: "",
  composer: "",
  bangumi_id: "",
  img_urls: [],
  media_urls: {
    ytb_url: "",
    bili_url: "",
    netease_url: ""
  }
};

type AdminDraft = {
  media_urls: Record<SourceField, string>;
  img_urls: string[];
};

function toAdminDraft(song: OstSongItem): AdminDraft {
  return {
    media_urls: {
      ytb_url: song.media_urls.ytb_url ?? "",
      bili_url: song.media_urls.bili_url ?? "",
      netease_url: song.media_urls.netease_url ?? ""
    },
    img_urls: [...song.img_urls]
  };
}

const PAGE_SIZE = 9;
const DEBOUNCE_MS = 300;
const ADMIN_MODE_ENABLED = process.env.NEXT_PUBLIC_ADMIN_MODE_ENABLED === "1";

function sourceCount(song: OstSongItem) {
  return [song.media_urls.ytb_url, song.media_urls.bili_url, song.media_urls.netease_url].filter(Boolean).length;
}

function isLocalSong(song: OstSongItem) {
  return typeof song.id === "string" && song.id.startsWith("temp-");
}

function flattenIssues(issues: Array<{ path: (string | number)[]; message: string }>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "_form");
    if (!map[key]) map[key] = issue.message;
  }
  return map;
}

function buildSubmissionPayload(form: FormState) {
  return {
    song_title: form.song_title,
    subtitle: form.subtitle || undefined,
    tags: form.tags.split(",").map((value) => value.trim()).filter(Boolean),
    composer: form.composer || undefined,
    bangumi_id: form.bangumi_id ? Number(form.bangumi_id) : undefined,
    media_urls: {
      ytb_url: form.media_urls.ytb_url || undefined,
      bili_url: form.media_urls.bili_url || undefined,
      netease_url: form.media_urls.netease_url || undefined
    },
    img_urls: form.img_urls.map((url) => url.trim()).filter(Boolean)
  };
}

function songToForm(song: OstSongItem): FormState {
  return {
    song_title: song.song_title,
    subtitle: song.subtitle ?? "",
    tags: song.tags.join(","),
    composer: song.composer ?? "",
    bangumi_id: song.bangumi_id ? String(song.bangumi_id) : "",
    img_urls: [...song.img_urls],
    media_urls: {
      ytb_url: song.media_urls.ytb_url ?? "",
      bili_url: song.media_urls.bili_url ?? "",
      netease_url: song.media_urls.netease_url ?? ""
    }
  };
}

function payloadFromSong(song: OstSongItem) {
  return {
    song_title: song.song_title,
    subtitle: song.subtitle || undefined,
    tags: song.tags,
    composer: song.composer || undefined,
    bangumi_id: song.bangumi_id,
    media_urls: song.media_urls,
    img_urls: song.img_urls
  };
}

function labelBySource(key: SourceField) {
  return SOURCE_OPTIONS.find((option) => option.key === key)?.label ?? key;
}

function safeErrorMessage(status: number): string {
  if (status === 429) return "发布次数达到上限，请稍后再试。";
  if (status === 503) return "服务暂时不可用，请稍后再试。";
  if (status >= 500) return "服务忙，请稍后重试。";
  return "发布失败，请检查后重试。";
}

export function SearchHome() {
  const [query, setQuery] = useState("");
  const [remoteSongs, setRemoteSongs] = useState<OstSongItem[]>([]);
  const [localSongs, setLocalSongs] = useState<OstSongItem[]>([]);
  const [submittedLocalIds, setSubmittedLocalIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [isPending, setIsPending] = useState(false);
  const deferredQuery = useDeferredValue(query);

  const [showTempForm, setShowTempForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [importFeedback, setImportFeedback] = useState<(ImportResult & { isError?: boolean }) | null>(null);
  const [publishFeedback, setPublishFeedback] = useState<Record<string, string>>({});
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [showOptional, setShowOptional] = useState(false);
  const [sourceDraftKey, setSourceDraftKey] = useState<SourceField>("ytb_url");
  const [sourceDraftUrl, setSourceDraftUrl] = useState("");
  const [bgmAutofillLoading, setBgmAutofillLoading] = useState(false);
  const [bgmAutofillMessage, setBgmAutofillMessage] = useState("");
  const [adminPendingSongs, setAdminPendingSongs] = useState<OstSongItem[]>([]);
  const [adminDraftMap, setAdminDraftMap] = useState<Record<string, AdminDraft>>({});
  const [adminBusyId, setAdminBusyId] = useState<string | null>(null);
  const [adminFeedback, setAdminFeedback] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);
  const lastRequestedQueryRef = useRef<string | null>(null);

  useEffect(() => {
    setLocalSongs(getLocalSongs());
    setSubmittedLocalIds(new Set(getSubmittedLocalSongIds()));
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

  const nextPageStart = safePage * PAGE_SIZE;
  usePreloadImages(pagedSongs.map((song) => song.img_urls[0]).filter(Boolean), "high");
  usePreloadImages(songs.slice(nextPageStart, nextPageStart + PAGE_SIZE).map((song) => song.img_urls[0]).filter(Boolean), "low");

  const hasQuery = query.trim().length > 0;

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

  function updateMediaField(key: SourceField, value: string) {
    setForm((current) => ({
      ...current,
      media_urls: {
        ...current.media_urls,
        [key]: value
      }
    }));
    if (fieldErrors.media_urls) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.media_urls;
        return next;
      });
    }
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError("");
    setEditingId(null);
    setShowOptional(false);
    setSourceDraftKey("ytb_url");
    setSourceDraftUrl("");
    setBgmAutofillLoading(false);
    setBgmAutofillMessage("");
  }

  function openCreate() {
    resetForm();
    setShowTempForm(true);
  }

  function startEdit(song: OstSongItem) {
    setForm(songToForm(song));
    setEditingId(String(song.id));
    setShowOptional(Boolean(song.subtitle || song.composer || song.bangumi_id || song.tags.length));
    setFieldErrors({});
    setFormError("");
    setBgmAutofillMessage("");
    setShowTempForm(true);
  }

  async function autofillByBangumiId() {
    const bangumiId = form.bangumi_id.trim();
    if (!bangumiId) {
      setBgmAutofillMessage("请先填写 bangumi_id。");
      return;
    }
    if (!/^\d+$/.test(bangumiId)) {
      setBgmAutofillMessage("bangumi_id 需要是正整数。");
      return;
    }

    setBgmAutofillLoading(true);
    setBgmAutofillMessage("Bangumi 信息拉取中...");
    try {
      const response = await fetch(`/api/bgm/subject/${bangumiId}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as BgmAutofillResponse & { error?: string };
      if (!response.ok) {
        setBgmAutofillMessage(data.error || "自动填充失败，请稍后重试。");
        return;
      }

      const payload = data.data;
      setForm((current) => ({
        ...current,
        bangumi_id: String(payload.bangumi_id),
        // title 由用户手填；自动抓取仅补充 subtitle/composer/tags。
        song_title: current.song_title,
        subtitle: current.subtitle.trim() ? current.subtitle : (payload.subtitle ?? ""),
        composer: current.composer.trim() ? current.composer : (payload.composer ?? ""),
        tags: current.tags.trim() ? current.tags : payload.tags.join(",")
      }));
      if (payload.subtitle || payload.composer) {
        setShowOptional(true);
      }
      setBgmAutofillMessage("已自动填充可用字段；你可以继续手动调整。");
    } catch {
      setBgmAutofillMessage("网络波动，暂时无法拉取 Bangumi 信息。");
    } finally {
      setBgmAutofillLoading(false);
    }
  }

  function validateForm(): ReturnType<typeof buildSubmissionPayload> | null {
    const payload = buildSubmissionPayload(form);
    const result = songSubmissionSchema.safeParse(payload);
    if (!result.success) {
      setFieldErrors(flattenIssues(result.error.issues));
      setFormError("请先修正必填项后再保存。");
      return null;
    }
    setFieldErrors({});
    setFormError("");
    return payload;
  }

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
      setFormError("");
      resetForm();
      setShowTempForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "保存失败");
    }
  }

  async function handlePublishLocal(song: OstSongItem) {
    const key = String(song.id);
    if (!isLocalSong(song) || submittedLocalIds.has(key) || publishingId) return;

    const parsed = songSubmissionSchema.safeParse(payloadFromSong(song));
    if (!parsed.success) {
      setPublishFeedback((prev) => ({ ...prev, [key]: "该条目不满足发布要求，请先编辑补全。" }));
      return;
    }

    setPublishingId(key);
    setPublishFeedback((prev) => ({ ...prev, [key]: "发布中..." }));
    try {
      const response = await fetch("/api/songs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data)
      });

      if (!response.ok) {
        const retryAfter = response.headers.get("retry-after");
        const retryTip = response.status === 429 && retryAfter ? `（约 ${Math.ceil(Number(retryAfter) / 60)} 分钟后可再试）` : "";
        setPublishFeedback((prev) => ({ ...prev, [key]: `${safeErrorMessage(response.status)}${retryTip}` }));
        return;
      }

      const data = (await response.json().catch(() => ({}))) as { deduped?: boolean };
      const next = markLocalSongSubmitted(song.id);
      setSubmittedLocalIds(new Set(next));
      setPublishFeedback((prev) => ({
        ...prev,
        [key]: data?.deduped ? "云端已有同条目，已自动去重。" : "已提交云端审核。"
      }));
    } catch {
      setPublishFeedback((prev) => ({ ...prev, [key]: "网络异常，请稍后重试。" }));
    } finally {
      setPublishingId(null);
    }
  }

  function handleDeleteLocal(song: OstSongItem) {
    if (!isLocalSong(song)) return;
    if (!confirm(`确认删除本地曲目「${song.song_title}」？`)) return;
    setLocalSongs(removeLocalSong(song.id));
    if (editingId === String(song.id)) resetForm();
  }

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

  function upsertSourceDraft() {
    const nextUrl = sourceDraftUrl.trim();
    if (!nextUrl) return;
    try {
      new URL(nextUrl);
    } catch {
      setFormError("媒体链接格式不正确，请输入完整 URL。");
      return;
    }
    updateMediaField(sourceDraftKey, nextUrl);
    setSourceDraftUrl("");
    setFormError("");
  }

  function editSourceDraft(key: SourceField) {
    setSourceDraftKey(key);
    setSourceDraftUrl(form.media_urls[key]);
  }

  function removeSourceDraft(key: SourceField) {
    updateMediaField(key, "");
  }

  const activeSources = SOURCE_OPTIONS.filter((item) => Boolean(form.media_urls[item.key]));

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
          <button className="temp-entry-trigger" onClick={() => (showTempForm ? setShowTempForm(false) : openCreate())}>
            {showTempForm ? "收起表单" : "新增本地条目"}
          </button>
        </div>

        {showTempForm ? (
          <form className="temp-form temp-form-inline" onSubmit={handleSaveLocal}>
            <div className="temp-form-head">
              <div>
                <h3>{editingId ? "编辑本地条目" : "创建本地条目"}</h3>
                <p>流程固定为先存本地，再从卡片操作发布到云端。</p>
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
              <input
                value={form.tags}
                onChange={(e) => updateField("tags", e.target.value)}
                placeholder="tags: a,b,c"
              />
              <input value={form.bangumi_id} onChange={(e) => updateField("bangumi_id", e.target.value)} placeholder="bangumi_id" />
            </div>
            {fieldErrors.song_title ? <p className="field-error">song_title：{fieldErrors.song_title}</p> : null}
            <div className="bgm-autofill-row">
              <button type="button" className="btn-secondary" onClick={() => void autofillByBangumiId()} disabled={bgmAutofillLoading}>
                {bgmAutofillLoading ? "同步中..." : "根据 bangumi_id 自动填充"}
              </button>
              {bgmAutofillMessage ? <p className="io-feedback">{bgmAutofillMessage}</p> : null}
            </div>

            <div className="source-editor">
              <label className="field-label">media_urls *</label>
              <div className="source-editor-row">
                <select value={sourceDraftKey} onChange={(e) => setSourceDraftKey(e.target.value as SourceField)}>
                  {SOURCE_OPTIONS.map((option) => (
                    <option value={option.key} key={option.key}>{option.label}</option>
                  ))}
                </select>
                <input
                  value={sourceDraftUrl}
                  onChange={(e) => setSourceDraftUrl(e.target.value)}
                  placeholder="https://..."
                  className={fieldErrors.media_urls ? "is-invalid" : ""}
                />
                <button type="button" className="btn-secondary" onClick={upsertSourceDraft}>添加/更新</button>
              </div>
              <div className="source-chips">
                {activeSources.length ? (
                  activeSources.map((source) => (
                    <div className="source-chip" key={source.key}>
                      <strong>{source.label}</strong>
                      <span>{form.media_urls[source.key]}</span>
                      <button type="button" onClick={() => editSourceDraft(source.key)}>改</button>
                      <button type="button" onClick={() => removeSourceDraft(source.key)}>删</button>
                    </div>
                  ))
                ) : (
                  <p className="source-empty">至少添加一个可播放来源。</p>
                )}
              </div>
              {fieldErrors.media_urls ? <p className="field-error">media_urls：{fieldErrors.media_urls}</p> : null}
            </div>

            <label className="field-label">img_urls *</label>
            <ImageUrlListEditor
              urls={form.img_urls}
              onChange={(next) => updateField("img_urls", next)}
              invalid={Boolean(fieldErrors.img_urls)}
            />
            {fieldErrors.img_urls ? <p className="field-error">img_urls：{fieldErrors.img_urls}</p> : null}

            <button type="button" className="optional-toggle" onClick={() => setShowOptional((open) => !open)}>
              {showOptional ? "收起可选字段" : "展开可选字段"}
            </button>

            {showOptional ? (
              <div className="form-grid form-grid-optional">
                <input value={form.subtitle} onChange={(e) => updateField("subtitle", e.target.value)} placeholder="subtitle" />
                <input value={form.composer} onChange={(e) => updateField("composer", e.target.value)} placeholder="composer" />
              </div>
            ) : null}

            <div className="temp-form-actions">
              <button type="submit">{editingId ? "保存修改" : "保存到本地"}</button>
              {editingId ? (
                <button type="button" className="btn-ghost" onClick={() => { resetForm(); setShowTempForm(false); }}>
                  取消编辑
                </button>
              ) : null}
            </div>
            {formError ? <p className="form-error">{formError}</p> : null}
          </form>
        ) : null}

        <div className="song-grid">
          {pagedSongs.map((song, index) => {
            const key = String(song.id);
            const local = isLocalSong(song);
            const submitted = submittedLocalIds.has(key);
            const publishing = publishingId === key;
            return (
              <div key={key} className="song-card-wrap">
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
                      {local ? <span className="song-card-badge">Local</span> : null}
                      {local && submitted ? <span className="song-card-badge">Published</span> : null}
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
                {local ? (
                  <div className="song-card-actions">
                    <button type="button" title="编辑" onClick={() => startEdit(song)}>✎</button>
                    <button
                      type="button"
                      title={submitted ? "已发布" : "发布到云端"}
                      onClick={() => void handlePublishLocal(song)}
                      disabled={submitted || publishing}
                    >
                      {publishing ? "…" : "⇪"}
                    </button>
                    <button type="button" title="删除" onClick={() => handleDeleteLocal(song)}>✕</button>
                  </div>
                ) : null}
                {local && publishFeedback[key] ? <p className="publish-feedback">{publishFeedback[key]}</p> : null}
              </div>
            );
          })}
          {songs.length === 0 ? (
            <div className="empty-tip">
              <strong>{hasQuery ? "没有找到匹配曲目" : "还没有可展示的曲目"}</strong>
              <p>{hasQuery ? "换一个关键词试试。" : "先创建一个本地条目开始整理吧。"}</p>
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
      </section>
    </main>
  );
}
