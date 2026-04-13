'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  LOCAL_SONGS_KEY,
  mergeRemoteAndLocalSongs,
  parseLocalSongs,
  serializeLocalSongs,
  upsertLocalSong
} from '@/lib/local-songs';
import { songSchema, type OstSongItem } from '@/lib/schema';

type ApiPayload = {
  items: OstSongItem[];
  total: number;
};

type FormState = {
  id: string;
  song_title: string;
  subtitle: string;
  tags: string;
  composer: string;
  ytb_url: string;
  bili_url: string;
  netease_url: string;
  img_url: string;
};

const EMPTY_FORM: FormState = {
  id: '',
  song_title: '',
  subtitle: '',
  tags: '',
  composer: '',
  ytb_url: '',
  bili_url: '',
  netease_url: '',
  img_url: ''
};

function buildLocalSong(form: FormState) {
  const id = form.id.trim() || `local-${Date.now().toString(36)}`;

  const candidate = {
    id,
    song_title: form.song_title.trim(),
    subtitle: form.subtitle.trim() || undefined,
    tags: form.tags
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    composer: form.composer.trim() || undefined,
    media_urls: {
      ytb_url: form.ytb_url.trim() || undefined,
      bili_url: form.bili_url.trim() || undefined,
      netease_url: form.netease_url.trim() || undefined
    },
    img_urls: [form.img_url.trim()].filter(Boolean),
    extras: {
      local_only: true
    }
  };

  return songSchema.parse(candidate);
}

export function HomeClient() {
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [remoteSongs, setRemoteSongs] = useState<OstSongItem[]>([]);
  const [localSongs, setLocalSongs] = useState<OstSongItem[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(LOCAL_SONGS_KEY);
    setLocalSongs(parseLocalSongs(raw));
  }, []);

  useEffect(() => {
    const url = new URL('/api/songs', window.location.origin);
    if (q.trim()) {
      url.searchParams.set('q', q.trim());
    }
    if (tag.trim()) {
      url.searchParams.set('tag', tag.trim());
    }

    fetch(url.toString())
      .then((res) => {
        if (!res.ok) {
          throw new Error('failed');
        }
        return res.json() as Promise<ApiPayload>;
      })
      .then((data) => setRemoteSongs(data.items))
      .catch(() => setRemoteSongs([]));
  }, [q, tag]);

  const mergedSongs = useMemo(
    () =>
      mergeRemoteAndLocalSongs({
        remoteSongs,
        localSongs,
        q,
        tag
      }),
    [remoteSongs, localSongs, q, tag]
  );

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleAddLocalSong() {
    try {
      const parsed = buildLocalSong(form);
      const next = upsertLocalSong(localSongs, parsed);
      setLocalSongs(next);
      window.localStorage.setItem(LOCAL_SONGS_KEY, serializeLocalSongs(next));
      setForm(EMPTY_FORM);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '输入数据不合法');
    }
  }

  return (
    <div className="home-shell">
      <div className="home-container">
        <header className="home-header">
          <div>
            <h1 className="home-title">OST Hibiki</h1>
            <div className="home-subtitle">极简搜索：song_title / subtitle / tags</div>
          </div>
        </header>

        <div className="search-row">
          <input
            className="search-input"
            placeholder="关键词（song_title / subtitle / tags）"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <input
            className="tag-input"
            placeholder="标签精确过滤（例如 OST）"
            value={tag}
            onChange={(event) => setTag(event.target.value)}
          />
        </div>

        {mergedSongs.length === 0 ? <p className="empty-tip">没有匹配结果。</p> : null}
        <section className="song-grid">
          {mergedSongs.map((song) => {
            const isLocal = Boolean(song.extras?.local_only);

            return (
              <Link href={`/song/${song.id}`} key={song.id} className="song-card">
                <div className="song-card-bg" style={{ backgroundImage: `url(${song.img_urls[0]})` }} />
                {isLocal ? <span className="local-badge">LOCAL</span> : null}
                <div className="song-card-content">
                  <h2 className="song-title">{song.song_title}</h2>
                  {song.subtitle ? <p className="song-subtitle">{song.subtitle}</p> : null}
                  <div className="song-tags">
                    {song.tags.map((item) => (
                      <span className="song-tag" key={item}>
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            );
          })}
        </section>

        <section className="panel">
          <h2 className="panel-title">添加临时曲目（localStorage）</h2>
          <div className="form-grid">
            <input
              className="form-input"
              placeholder="id（可空，自动生成）"
              value={form.id}
              onChange={(event) => updateForm('id', event.target.value)}
            />
            <input
              className="form-input"
              placeholder="song_title（必填）"
              value={form.song_title}
              onChange={(event) => updateForm('song_title', event.target.value)}
            />
            <input
              className="form-input"
              placeholder="subtitle"
              value={form.subtitle}
              onChange={(event) => updateForm('subtitle', event.target.value)}
            />
            <input
              className="form-input"
              placeholder="composer"
              value={form.composer}
              onChange={(event) => updateForm('composer', event.target.value)}
            />
            <input
              className="form-input"
              placeholder="tags，英文逗号分隔"
              value={form.tags}
              onChange={(event) => updateForm('tags', event.target.value)}
            />
            <input
              className="form-input"
              placeholder="img_url（必填）"
              value={form.img_url}
              onChange={(event) => updateForm('img_url', event.target.value)}
            />
            <input
              className="form-input"
              placeholder="ytb_url / bili_url / netease_url 至少填一个"
              value={form.ytb_url}
              onChange={(event) => updateForm('ytb_url', event.target.value)}
            />
            <input
              className="form-input"
              placeholder="bili_url"
              value={form.bili_url}
              onChange={(event) => updateForm('bili_url', event.target.value)}
            />
            <input
              className="form-input"
              placeholder="netease_url"
              value={form.netease_url}
              onChange={(event) => updateForm('netease_url', event.target.value)}
            />
          </div>
          {error ? <p className="song-subtitle">{error}</p> : null}
          <div className="button-row">
            <button type="button" className="button" onClick={handleAddLocalSong}>
              保存临时数据
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
