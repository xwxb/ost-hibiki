"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { OstSongItem } from "@/lib/schema";
import { buildEmbedUrl } from "@/lib/media";
import { handleImgError } from "@/lib/image-fallback";

type SourceType = "youtube" | "bilibili" | "netease";
type ModeType = "preview" | "immersive";

const AUTO_MS = 6500;

function sourceName(source: SourceType) {
  if (source === "youtube") return "YouTube Engine";
  if (source === "bilibili") return "Bilibili Engine";
  return "Netease Engine";
}

function sourceLabel(source: SourceType) {
  if (source === "youtube") return "YouTube";
  if (source === "bilibili") return "Bilibili";
  return "Netease";
}

function SourceGlyph({ source }: { source: SourceType }) {
  if (source === "youtube") {
    return (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
        <path d="M21.582 6.186a2.635 2.635 0 0 0-1.85-1.87C18.096 3.88 12 3.88 12 3.88s-6.096 0-7.732.436a2.635 2.635 0 0 0-1.85 1.87C2 7.842 2 12 2 12s0 4.158.418 5.814a2.635 2.635 0 0 0 1.85 1.87C5.904 20.12 12 20.12 12 20.12s6.096 0 7.732-.436a2.635 2.635 0 0 0 1.85-1.87C22 16.158 22 12 22 12s0-4.158-.418-5.814zM9.912 15.176v-6.352l5.776 3.176-5.776 3.176z" />
      </svg>
    );
  }

  if (source === "bilibili") {
    return (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M7 7.5 4.5 5M17 7.5 19.5 5M7.5 8h9A3.5 3.5 0 0 1 20 11.5v4A3.5 3.5 0 0 1 16.5 19h-9A3.5 3.5 0 0 1 4 15.5v-4A3.5 3.5 0 0 1 7.5 8Z" />
        <path d="M9.5 12.5v.01M14.5 12.5v.01" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 3v13M8 7a6 6 0 1 0 6 6" />
    </svg>
  );
}

function sourceOrder(song: OstSongItem): SourceType[] {
  const list: SourceType[] = [];
  if (song.media_urls.ytb_url) list.push("youtube");
  if (song.media_urls.bili_url) list.push("bilibili");
  if (song.media_urls.netease_url) list.push("netease");
  return list.length ? list : ["youtube"];
}

function splitSongTitle(title: string) {
  const match = title.match(/^(.*?)(\s*\([^)]*\))$/);
  if (!match) return { main: title, suffix: "" };
  return { main: match[1].trim(), suffix: match[2].trim() };
}

export function SongShowcase({ song }: { song: OstSongItem }) {
  const [mode, setMode] = useState<ModeType>("preview");
  const [playing, setPlaying] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);
  const [extOpen, setExtOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [idle, setIdle] = useState(false);
  const [centerHover, setCenterHover] = useState(false);
  const [playerNonce, setPlayerNonce] = useState(0);
  const [prevImage, setPrevImage] = useState<string | null>(null);

  const sources = useMemo(() => sourceOrder(song), [song]);
  const [source, setSource] = useState<SourceType>(sources[0]);

  const activeImage = song.img_urls[frameIndex] ?? song.img_urls[0];
  const prevImageRef = useRef(activeImage);
  if (prevImageRef.current !== activeImage) {
    setPrevImage(prevImageRef.current);
    prevImageRef.current = activeImage;
  }
  const frameMotionKey = `${frameIndex}-${activeImage}`;
  const titleParts = splitSongTitle(song.song_title);
  const sourceUrl =
    source === "youtube"
      ? song.media_urls.ytb_url
      : source === "bilibili"
        ? song.media_urls.bili_url
        : song.media_urls.netease_url;

  useEffect(() => {
    document.title = `${song.song_title} | OST Hibiki`;
  }, [song.song_title]);

  useEffect(() => {
    if (!prevImage) return;
    const timer = setTimeout(() => setPrevImage(null), 1000);
    return () => clearTimeout(timer);
  }, [prevImage]);

  useEffect(() => {
    if (!(playing && mode === "immersive")) return;
    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % song.img_urls.length);
    }, AUTO_MS);
    return () => window.clearInterval(timer);
  }, [mode, playing, song.img_urls.length]);

  useEffect(() => {
    if (mode !== "immersive") return;
    const wake = () => {
      setIdle(false);
      window.clearTimeout((window as Window & { __idle_timer?: number }).__idle_timer);
      (window as Window & { __idle_timer?: number }).__idle_timer = window.setTimeout(() => {
        if (playing) setIdle(true);
      }, 2500);
    };
    wake();
    window.addEventListener("mousemove", wake);
    window.addEventListener("touchstart", wake);
    return () => {
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("touchstart", wake);
      window.clearTimeout((window as Window & { __idle_timer?: number }).__idle_timer);
    };
  }, [mode, playing]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mode === "immersive") setMode("preview");
      if (e.code === "Space" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === "ArrowRight" && mode === "preview") {
        setFrameIndex((current) => (current + 1) % song.img_urls.length);
      }
      if (e.key === "ArrowLeft" && mode === "preview") {
        setFrameIndex((current) => (current - 1 + song.img_urls.length) % song.img_urls.length);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, song.img_urls.length]);

  useEffect(() => {
    if (source !== "bilibili" || !playing) return;
    setExtOpen(true);
  }, [playing, source]);

  function togglePlay(force = false) {
    setPlaying((prev) => {
      const next = force ? true : !prev;
      setPlayerNonce((n) => n + 1);
      return next;
    });
  }

  function onCanvasClick() {
    if (mode === "preview") {
      setMode("immersive");
      if (!playing) togglePlay(true);
      return;
    }
    togglePlay();
  }

  function goNextFrame() {
    setFrameIndex((current) => (current + 1) % song.img_urls.length);
  }

  function goPrevFrame() {
    setFrameIndex((current) => (current - 1 + song.img_urls.length) % song.img_urls.length);
  }

  function onCanvasMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (mode !== "immersive") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / rect.width;
    const cy = (e.clientY - rect.top) / rect.height;
    setCenterHover(cx > 0.3 && cx < 0.7 && cy > 0.3 && cy < 0.7);
  }

  function onCanvasMouseLeave() {
    setCenterHover(false);
  }

  function renderPlayer() {
    if (!sourceUrl) return <p className="player-empty">当前源暂无链接</p>;
    const embedUrl = buildEmbedUrl(source, sourceUrl, playing && source === "youtube");
    return (
      <iframe
        key={`${source}-${playerNonce}-${playing ? "playing" : "paused"}`}
        src={embedUrl}
        width="100%"
        height="100%"
        frameBorder="0"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        title={`${song.song_title}-${source}`}
      />
    );
  }

  return (
    <div className={`song-root mode-${mode} ${playing ? "is-playing" : ""} ${idle ? "is-idle" : ""} ${centerHover ? "center-hover" : ""}`}>
      <div className="global-ambient" style={{ backgroundImage: `url(${activeImage})` }} />
      <div className="global-ambient global-ambient-float" style={{ backgroundImage: `url(${activeImage})` }} />
      <div className="film-grain" />

      <header className="imm-ui imm-top">
        <button className="icon-btn" onClick={() => setMode("preview")} title="Exit Immersive">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="imm-title-wrap">
          <div className="imm-title">{song.song_title}</div>
          <div className="imm-sub">{song.subtitle ?? ""}</div>
        </div>
        <div style={{ width: 44 }} />
      </header>

      <div id="app">
        <section className="art-col">
          <div className="art-canvas" onClick={onCanvasClick} onMouseMove={onCanvasMouseMove} onMouseLeave={onCanvasMouseLeave}>
            {prevImage && prevImage !== activeImage && (
              <div className="frame-layer active">
                <img className="img-bg" src={prevImage} alt="bg" onError={handleImgError} />
                <img className="img-fg" src={prevImage} alt="" onError={handleImgError} />
              </div>
            )}
            <div key={frameMotionKey} className="frame-layer active frame-layer-animated">
              <img className="img-bg" src={activeImage} alt="bg" onError={handleImgError} />
              <img className={`img-fg ${mode === "immersive" && playing ? "zooming" : ""}`} src={activeImage} alt={song.song_title} onError={handleImgError} />
            </div>
            <div className="hover-expand-overlay">
              <div className="glass-play-btn">
                <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor">
                  <path d={playing ? "M6 19h4V5H6v14zm8-14v14h4V5h-4z" : "M8 5v14l11-7z"} />
                </svg>
              </div>
            </div>
          </div>

          <div className="dots-container">
            {song.img_urls.map((_, index) => (
              <button
                key={index}
                className={`dot ${frameIndex === index ? "active" : ""}`}
                onClick={() => mode === "preview" && setFrameIndex(index)}
                aria-label={`image-${index + 1}`}
              />
            ))}
          </div>
        </section>

        <section className="info-col">
          <h1 className="song-title">
            <span className="song-title-main">{titleParts.main}</span>
            {titleParts.suffix ? <span className="song-title-suffix">{titleParts.suffix}</span> : null}
          </h1>
          <p className="subtitle">{song.subtitle ?? ""}</p>
          <div className="tag-list">
            {song.tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>

          <div className="composer">
            <span>Composer</span>
            <strong>{song.composer ?? "Unknown"}</strong>
          </div>

          <div className="button-row">
            <button className="main-play-btn" onClick={() => togglePlay()}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d={playing ? "M6 19h4V5H6v14zm8-14v14h4V5h-4z" : "M8 5v14l11-7z"} />
              </svg>
              <span>{playing ? "Pause" : "Play Track"}</span>
            </button>
            <button className="btn-secondary" onClick={() => setMode("immersive")}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
              Immersive
            </button>
          </div>

          {source === "bilibili" ? <p className="bili-hint">* 检测到 Bilibili 源，请在下方播放器手动点击播放</p> : null}

          <div className="copyright-area">
            <div className="source-row">
              <div className="source-row-cluster">
                <a href={sourceUrl ?? "#"} target="_blank" rel="noreferrer" className="source-link">
                  <span className="source-link-main">
                    <SourceGlyph source={source} />
                    <span>{sourceLabel(source)}</span>
                  </span>
                </a>
                <button className="legal-toggle" onClick={() => setLegalOpen((open) => !open)}>
                  {legalOpen ? "Hide notice" : "Notice"}
                </button>
              </div>
              <div className="source-row-cluster source-row-meta">
                <a href={sourceUrl ?? "#"} target="_blank" rel="noreferrer" className="source-link-sub">
                  Open source
                </a>
                <button onClick={() => setExtOpen((open) => !open)}>{extOpen ? "Hide sources" : "Sources"}</button>
              </div>
            </div>
            {legalOpen ? (
              <div className="legal-copy">
                <p>本项目为非营利性质，所有版权归原作者所有。</p>
                <p>侵权删改联系: i@045510.xyz</p>
              </div>
            ) : null}
            <div className={`debug-popover ${extOpen ? "open" : ""}`}>
              <div className="source-pills">
                {sources.map((item) => (
                  <button
                    key={item}
                    className={`source-pill ${source === item ? "active" : ""}`}
                    onClick={() => setSource(item)}
                  >
                    {sourceName(item)}
                  </button>
                ))}
              </div>
              <div className="player-wrapper">{renderPlayer()}</div>
            </div>
          </div>
        </section>
      </div>

      <footer className="imm-ui imm-bottom">
        <div className="player-pill">
          <button className="icon-btn primary" onClick={() => togglePlay()}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d={playing ? "M6 19h4V5H6v14zm8-14v14h4V5h-4z" : "M8 5v14l11-7z"} />
            </svg>
          </button>
          <div className="eq-visualizer">
            <div className="eq-bar" />
            <div className="eq-bar" />
            <div className="eq-bar" />
            <div className="eq-bar" />
            <div className="eq-bar" />
          </div>
        </div>
      </footer>
    </div>
  );
}
