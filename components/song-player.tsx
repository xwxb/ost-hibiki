'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import styles from '@/components/song-player.module.css';
import { LOCAL_SONGS_KEY, parseLocalSongs } from '@/lib/local-songs';
import type { OstSongItem } from '@/lib/schema';

type SourceType = 'youtube' | 'bilibili' | 'netease';

const SVG_PLAY = 'M8 5v14l11-7z';
const SVG_PAUSE = 'M6 19h4V5H6v14zm8-14v14h4V5h-4z';
const AUTO_MS = 6500;

function getYouTubeVideoId(url?: string) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.slice(1);
    }

    return parsed.searchParams.get('v');
  } catch {
    return null;
  }
}

function getBiliBvid(url?: string) {
  if (!url) {
    return null;
  }

  const match = url.match(/BV[0-9A-Za-z]+/);
  return match?.[0] ?? null;
}

function buildSourceLabel(source: SourceType) {
  if (source === 'youtube') {
    return 'YouTube Engine';
  }

  if (source === 'bilibili') {
    return 'Bilibili Engine';
  }

  return 'Netease Engine';
}

function getAvailableSources(song: OstSongItem): SourceType[] {
  const result: SourceType[] = [];

  if (song.media_urls.ytb_url) {
    result.push('youtube');
  }
  if (song.media_urls.bili_url) {
    result.push('bilibili');
  }
  if (song.media_urls.netease_url) {
    result.push('netease');
  }

  return result;
}

function buildEmbedUrl(song: OstSongItem, source: SourceType, playing: boolean) {
  if (source === 'youtube') {
    const videoId = getYouTubeVideoId(song.media_urls.ytb_url);
    if (!videoId) {
      return null;
    }

    return `https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0&autoplay=${playing ? '1' : '0'}`;
  }

  if (source === 'bilibili') {
    const bvid = getBiliBvid(song.media_urls.bili_url);
    if (!bvid) {
      return null;
    }

    return `https://player.bilibili.com/player.html?bvid=${bvid}&page=1&high_quality=1&danmaku=0`;
  }

  return song.media_urls.netease_url ?? null;
}

export function SongPlayer({ id }: { id: string }) {
  const [song, setSong] = useState<OstSongItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'preview' | 'immersive'>('preview');
  const [playing, setPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [activeLayer, setActiveLayer] = useState<'a' | 'b'>('a');
  const [layerImages, setLayerImages] = useState({ a: '', b: '' });
  const [source, setSource] = useState<SourceType>('youtube');
  const [showDebug, setShowDebug] = useState(false);
  const [idle, setIdle] = useState(false);

  const autoTimerRef = useRef<NodeJS.Timeout | null>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadSong() {
      setLoading(true);
      try {
        const res = await fetch(`/api/songs/${id}`);
        if (res.ok) {
          const data = (await res.json()) as OstSongItem;
          if (isMounted) {
            setSong(data);
          }
          return;
        }
      } catch {
        // noop
      }

      const localRaw = window.localStorage.getItem(LOCAL_SONGS_KEY);
      const localSongs = parseLocalSongs(localRaw);
      const localSong = localSongs.find((item) => item.id === id) ?? null;
      if (isMounted) {
        setSong(localSong);
      }
    }

    void loadSong().finally(() => {
      if (isMounted) {
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [id]);

  const availableSources = useMemo(() => {
    if (!song) {
      return [] as SourceType[];
    }

    return getAvailableSources(song);
  }, [song]);

  useEffect(() => {
    if (!song) {
      return;
    }

    const firstImage = song.img_urls[0] ?? '';
    setCurrentFrame(0);
    setLayerImages({ a: firstImage, b: firstImage });
    setActiveLayer('a');

    const sourceCandidate = getAvailableSources(song)[0] ?? 'youtube';
    setSource(sourceCandidate);
  }, [song]);

  useEffect(() => {
    if (!song || song.img_urls.length === 0) {
      return;
    }

    const nextUrl = song.img_urls[currentFrame] ?? song.img_urls[0];
    if (!nextUrl) {
      return;
    }

    const nextLayer = activeLayer === 'a' ? 'b' : 'a';
    setLayerImages((prev) => ({ ...prev, [nextLayer]: nextUrl }));

    const rafId = requestAnimationFrame(() => {
      setActiveLayer(nextLayer);
    });

    return () => cancelAnimationFrame(rafId);
  }, [currentFrame, song, activeLayer]);

  useEffect(() => {
    if (!song || mode !== 'immersive' || !playing || song.img_urls.length <= 1) {
      if (autoTimerRef.current) {
        clearInterval(autoTimerRef.current);
      }
      autoTimerRef.current = null;
      return;
    }

    autoTimerRef.current = setInterval(() => {
      setCurrentFrame((prev) => (prev + 1) % song.img_urls.length);
    }, AUTO_MS);

    return () => {
      if (autoTimerRef.current) {
        clearInterval(autoTimerRef.current);
        autoTimerRef.current = null;
      }
    };
  }, [mode, playing, song]);

  function wakeUpUi() {
    if (mode !== 'immersive') {
      return;
    }

    setIdle(false);
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }

    idleTimerRef.current = setTimeout(() => {
      if (playing) {
        setIdle(true);
      }
    }, 2500);
  }

  useEffect(() => {
    if (mode === 'immersive' && playing) {
      wakeUpUi();
    } else {
      setIdle(false);
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    }
  }, [mode, playing]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && mode === 'immersive') {
        setMode('preview');
      }

      if (event.code === 'Space' && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault();
        setPlaying((prev) => !prev);
        wakeUpUi();
      }

      if (event.key === 'ArrowRight' && mode === 'preview' && song) {
        setCurrentFrame((prev) => (prev + 1) % song.img_urls.length);
      }

      if (event.key === 'ArrowLeft' && mode === 'preview' && song) {
        setCurrentFrame((prev) => (prev - 1 + song.img_urls.length) % song.img_urls.length);
      }
    }

    function onMouseMove() {
      wakeUpUi();
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchstart', onMouseMove);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchstart', onMouseMove);
    };
  }, [mode, song, playing]);

  useEffect(() => {
    return () => {
      if (autoTimerRef.current) {
        clearInterval(autoTimerRef.current);
      }
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, []);

  if (loading) {
    return <div className={styles.loading}>Loading…</div>;
  }

  if (!song) {
    return (
      <div className={styles.notFound}>
        <div>
          <p>未找到该曲目。</p>
          <Link href="/">返回首页</Link>
        </div>
      </div>
    );
  }

  const rootClassName = [
    styles.shell,
    mode === 'preview' ? styles.modePreview : styles.modeImmersive,
    playing ? styles.isPlaying : '',
    idle ? styles.isIdle : ''
  ]
    .filter(Boolean)
    .join(' ');

  const currentBackground = song.img_urls[currentFrame] ?? song.img_urls[0];
  const playPath = playing ? SVG_PAUSE : SVG_PLAY;
  const mediaUrl = buildEmbedUrl(song, source, playing);
  const showBiliHint = source === 'bilibili' && playing;

  const sourceLink =
    source === 'youtube'
      ? song.media_urls.ytb_url
      : source === 'bilibili'
        ? song.media_urls.bili_url
        : song.media_urls.netease_url;

  return (
    <div className={rootClassName}>
      <div className={styles.globalAmbient} style={{ backgroundImage: `url(${currentBackground})` }} />
      <div className={styles.centerGlow} />
      <div className={styles.aveeRing} />
      <div className={`${styles.aveeRing} ${styles.delay1}`} />
      <div className={`${styles.aveeRing} ${styles.delay2}`} />
      <div className={`${styles.aveeRing} ${styles.delay3}`} />
      <div className={styles.filmGrain} />

      <header className={`${styles.immUi} ${styles.immTop}`}>
        <button type="button" className={styles.iconBtn} title="Exit Immersive" onClick={() => setMode('preview')}>
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div style={{ textAlign: 'center' }}>
          <div className={`${styles.fontEn}`} style={{ fontSize: '1.1rem', fontWeight: 600 }}>
            {song.song_title}
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{song.subtitle}</div>
        </div>
        <div style={{ width: 44 }} />
      </header>

      <main className={styles.app}>
        <section className={styles.artCol}>
          <div
            className={styles.artCanvas}
            onClick={() => {
              if (mode === 'preview') {
                setMode('immersive');
                if (!playing) {
                  setPlaying(true);
                }
              } else {
                setPlaying((prev) => !prev);
              }
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                if (mode === 'preview') {
                  setMode('immersive');
                  if (!playing) {
                    setPlaying(true);
                  }
                } else {
                  setPlaying((prev) => !prev);
                }
              }
            }}
          >
            <div
              className={`${styles.frameLayer} ${activeLayer === 'a' ? styles.frameLayerActive : ''}`}
              aria-hidden={activeLayer !== 'a'}
            >
              <img className={styles.imgBg} src={layerImages.a} alt="bg" />
              <img className={styles.imgFg} src={layerImages.a} alt={song.song_title} />
            </div>
            <div
              className={`${styles.frameLayer} ${activeLayer === 'b' ? styles.frameLayerActive : ''}`}
              aria-hidden={activeLayer !== 'b'}
            >
              <img className={styles.imgBg} src={layerImages.b} alt="bg" />
              <img className={styles.imgFg} src={layerImages.b} alt={song.song_title} />
            </div>

            <div className={styles.hoverExpandOverlay}>
              <div className={styles.glassPlayBtn}>
                <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor">
                  <path d={playPath} />
                </svg>
              </div>
            </div>
          </div>

          <div className={styles.dotsContainer}>
            {song.img_urls.map((_item, index) => (
              <button
                key={`${song.id}-dot-${index}`}
                type="button"
                className={`${styles.dot} ${index === currentFrame ? styles.dotActive : ''}`}
                onClick={() => {
                  if (mode === 'preview') {
                    setCurrentFrame(index);
                  }
                }}
              />
            ))}
          </div>
        </section>

        <section className={styles.infoCol}>
          <h1 className={styles.title}>{song.song_title}</h1>
          {song.subtitle ? <p className={styles.subtitle}>{song.subtitle}</p> : null}

          <div className={styles.tagWrap}>
            {song.tags.map((tag) => (
              <span key={tag} className={styles.tag}>
                {tag}
              </span>
            ))}
          </div>

          <div className={styles.meta}>
            <span className={styles.metaLabel}>Composer</span>
            <span>{song.composer ?? '未知'}</span>
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.mainPlayBtn} onClick={() => setPlaying((prev) => !prev)}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d={playPath} />
              </svg>
              <span>{playing ? 'Pause' : 'Play Track'}</span>
            </button>

            <button type="button" className={styles.btnSecondary} onClick={() => setMode('immersive')}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
              Immersive
            </button>

            {showBiliHint ? <div className={styles.biliHint}>* Bilibili 需在下方面板中手动播放</div> : null}
          </div>

          <div className={styles.copyrightArea}>
            <p>本项目为非营利性质，所有版权归原作者所有。</p>
            <p>侵权删改联系: i@045510.xyz</p>

            <div className={styles.sourceRow}>
              {sourceLink ? (
                <a href={sourceLink} target="_blank" rel="noreferrer" className={styles.sourceLink}>
                  Original Source
                </a>
              ) : (
                <span className={styles.sourceLink}>Original Source</span>
              )}
              <button type="button" className={styles.sourceToggle} onClick={() => setShowDebug((prev) => !prev)}>
                Sources & Debug
              </button>
            </div>

            <div className={`${styles.debugPopover} ${showDebug || showBiliHint ? styles.debugPopoverOpen : ''}`}>
              <select
                className={styles.selectTrigger}
                value={source}
                onChange={(event) => setSource(event.target.value as SourceType)}
              >
                {availableSources.map((item) => (
                  <option key={item} value={item}>
                    {buildSourceLabel(item)}
                  </option>
                ))}
              </select>

              <div className={styles.playerWrapper}>
                {mediaUrl ? (
                  <iframe
                    className={styles.playerIframe}
                    src={mediaUrl}
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                    title={`${song.song_title}-${source}`}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className={`${styles.immUi} ${styles.immBottom}`}>
        <div className={styles.playerPill}>
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.iconBtnPrimary}`}
            onClick={() => setPlaying((prev) => !prev)}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d={playPath} />
            </svg>
          </button>

          <div className={styles.eqVisualizer}>
            <div className={styles.eqBar} />
            <div className={styles.eqBar} />
            <div className={styles.eqBar} />
            <div className={styles.eqBar} />
            <div className={styles.eqBar} />
          </div>
        </div>
      </footer>
    </div>
  );
}
