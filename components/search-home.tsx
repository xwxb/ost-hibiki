"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { addLocalSong, getLocalSongs } from "@/lib/local-storage";
import { parseSong, type OstSongItem } from "@/lib/schema";
import { filterSongs, mergeSongs } from "@/lib/song-utils";

type SongsResponse = { items: OstSongItem[] };
const PAGE_SIZE = 9;

const EMPTY_FORM = {
  song_title: "",
  subtitle: "",
  tags: "",
  composer: "",
  ytb_url: "",
  bili_url: "",
  netease_url: "",
  img_urls: "",
  bangumi_id: ""
};

function sourceCount(song: OstSongItem) {
  return [song.media_urls.ytb_url, song.media_urls.bili_url, song.media_urls.netease_url].filter(Boolean).length;
}

export function SearchHome() {
  const [query, setQuery] = useState("");
  const [songs, setSongs] = useState<OstSongItem[]>([]);
  const [remoteSongs, setRemoteSongs] = useState<OstSongItem[]>([]);
  const [localSongs, setLocalSongs] = useState<OstSongItem[]>([]);
  const [page, setPage] = useState(1);
  const [showTempForm, setShowTempForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const initialLocal = getLocalSongs();
    setLocalSongs(initialLocal);
    void loadRemote("");
  }, []);

  useEffect(() => {
    const merged = mergeSongs(remoteSongs, localSongs);
    setSongs(filterSongs(merged, { q: deferredQuery }));
  }, [deferredQuery, localSongs, remoteSongs]);

  useEffect(() => {
    setPage(1);
  }, [deferredQuery, songs.length]);

  async function loadRemote(q: string) {
    const response = await fetch(`/api/songs?q=${encodeURIComponent(q)}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as SongsResponse;
    setRemoteSongs(data.items);
  }

  function handleSearch(value: string) {
    setQuery(value);
    startTransition(() => {
      void loadRemote(value);
    });
  }

  function updateField(key: keyof typeof EMPTY_FORM, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleAddTempSong(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const draft = parseSong({
        id: `temp-${crypto.randomUUID()}`,
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
        img_urls: form.img_urls.split(",").map((value) => value.trim()).filter(Boolean)
      });
      const nextLocal = addLocalSong(draft);
      setLocalSongs(nextLocal);
      setForm(EMPTY_FORM);
      setShowTempForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "输入内容不符合 schema");
    }
  }

  const totalPages = Math.max(1, Math.ceil(songs.length / PAGE_SIZE));
  const pagedSongs = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return songs.slice(start, start + PAGE_SIZE);
  }, [page, songs]);

  const hasQuery = query.trim().length > 0;

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
          <button className="temp-entry-trigger" onClick={() => setShowTempForm((open) => !open)}>
            {showTempForm ? "收起临时曲目" : "添加临时曲目"}
          </button>
        </div>

        <div className="song-grid">
          {pagedSongs.map((song) => (
            <Link key={String(song.id)} href={`/song/${song.id}`} className="song-card">
              <img src={song.img_urls[0]} alt={song.song_title} />
              <div className="song-card-body">
                <div className="song-card-topline">
                  <span>{sourceCount(song)} sources</span>
                  {typeof song.id === "string" && song.id.startsWith("temp-") ? <span className="song-card-badge">Local</span> : null}
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
            <button disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
              Prev
            </button>
            <span>
              {page} / {totalPages}
            </span>
            <button disabled={page === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
              Next
            </button>
          </div>
        ) : null}

        {showTempForm ? (
          <form className="temp-form" onSubmit={handleAddTempSong}>
            <div className="temp-form-head">
              <div>
                <h3>Temporary Entry</h3>
                <p>Stored only in this browser.</p>
              </div>
            </div>
            <div className="form-grid form-grid-main">
              <input value={form.song_title} onChange={(e) => updateField("song_title", e.target.value)} placeholder="song_title*" />
              <input value={form.subtitle} onChange={(e) => updateField("subtitle", e.target.value)} placeholder="subtitle" />
              <input value={form.tags} onChange={(e) => updateField("tags", e.target.value)} placeholder="tags: a,b,c" />
            </div>
            <div className="form-grid form-grid-secondary">
              <input value={form.composer} onChange={(e) => updateField("composer", e.target.value)} placeholder="composer" />
              <input value={form.ytb_url} onChange={(e) => updateField("ytb_url", e.target.value)} placeholder="ytb_url" />
              <input value={form.bili_url} onChange={(e) => updateField("bili_url", e.target.value)} placeholder="bili_url" />
            </div>
            <div className="form-grid form-grid-secondary">
              <input value={form.netease_url} onChange={(e) => updateField("netease_url", e.target.value)} placeholder="netease_url" />
              <input value={form.img_urls} onChange={(e) => updateField("img_urls", e.target.value)} placeholder="img_urls: url1,url2*" />
              <input value={form.bangumi_id} onChange={(e) => updateField("bangumi_id", e.target.value)} placeholder="bangumi_id" />
            </div>
            <button type="submit">保存到 localStorage</button>
            {error ? <p className="form-error">{error}</p> : null}
          </form>
        ) : null}
      </section>
    </main>
  );
}
