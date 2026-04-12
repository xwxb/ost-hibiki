"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { addLocalSong, getLocalSongs } from "@/lib/local-storage";
import { parseSong, type OstSongItem } from "@/lib/schema";
import { filterSongs, mergeSongs } from "@/lib/song-utils";

type SongsResponse = { items: OstSongItem[] };

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

export function SearchHome() {
  const [query, setQuery] = useState("");
  const [songs, setSongs] = useState<OstSongItem[]>([]);
  const [remoteSongs, setRemoteSongs] = useState<OstSongItem[]>([]);
  const [localSongs, setLocalSongs] = useState<OstSongItem[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const initialLocal = getLocalSongs();
    setLocalSongs(initialLocal);
    void loadRemote("");
  }, []);

  useEffect(() => {
    const merged = mergeSongs(remoteSongs, localSongs);
    setSongs(filterSongs(merged, { q: query }));
  }, [localSongs, query, remoteSongs]);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "输入内容不符合 schema");
    }
  }

  return (
    <main className="search-page">
      <div className="search-ambient" />
      <section className="search-shell">
        <header className="search-header">
          <p className="eyebrow">OST HIBIKI MVP</p>
          <h1>单曲检索</h1>
          <p>按主标题、副标题、标签检索，结果自动融合 Mongo 和本地临时条目。</p>
        </header>

        <div className="search-box">
          <input
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="搜索曲名 / subtitle / tag"
          />
          <span>{isPending ? "Loading..." : `${songs.length} results`}</span>
        </div>

        <div className="song-grid">
          {songs.map((song) => (
            <Link key={song.id} href={`/song/${song.id}`} className="song-card">
              <img src={song.img_urls[0]} alt={song.song_title} />
              <div>
                <h2>{song.song_title}</h2>
                <p>{song.subtitle ?? "No subtitle"}</p>
                <div className="tags">
                  {song.tags.slice(0, 3).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
          {songs.length === 0 ? <p className="empty-tip">暂无匹配内容。</p> : null}
        </div>

        <form className="temp-form" onSubmit={handleAddTempSong}>
          <h3>添加本地临时曲目</h3>
          <div className="form-grid">
            <input value={form.song_title} onChange={(e) => updateField("song_title", e.target.value)} placeholder="song_title*" />
            <input value={form.subtitle} onChange={(e) => updateField("subtitle", e.target.value)} placeholder="subtitle" />
            <input value={form.tags} onChange={(e) => updateField("tags", e.target.value)} placeholder="tags: a,b,c" />
            <input value={form.composer} onChange={(e) => updateField("composer", e.target.value)} placeholder="composer" />
            <input value={form.bangumi_id} onChange={(e) => updateField("bangumi_id", e.target.value)} placeholder="bangumi_id" />
            <input value={form.ytb_url} onChange={(e) => updateField("ytb_url", e.target.value)} placeholder="ytb_url" />
            <input value={form.bili_url} onChange={(e) => updateField("bili_url", e.target.value)} placeholder="bili_url" />
            <input value={form.netease_url} onChange={(e) => updateField("netease_url", e.target.value)} placeholder="netease_url" />
            <input value={form.img_urls} onChange={(e) => updateField("img_urls", e.target.value)} placeholder="img_urls: url1,url2*" />
          </div>
          <button type="submit">保存到 localStorage</button>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
