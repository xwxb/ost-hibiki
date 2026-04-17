"use client";

/**
 * 并发图片预加载器
 * 通过优先级队列控制加载顺序和并发数，避免带宽饱和。
 * 利用浏览器缓存机制：预加载完成后，<img src> 直接命中内存/磁盘缓存。
 */

import { useEffect } from "react";

export type ImagePriority = "high" | "medium" | "low";

interface QueueItem {
  url: string;
  priority: ImagePriority;
}

const PRIORITY_WEIGHT: Record<ImagePriority, number> = { high: 0, medium: 1, low: 2 };
const IDLE_TIMEOUT_MS = 1200;

type NetworkConnection = {
  saveData?: boolean;
  effectiveType?: string;
};

type NavigatorWithConnection = Navigator & {
  connection?: NetworkConnection;
};

type WindowWithIdle = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

function resolveMaxConcurrent() {
  if (typeof navigator === "undefined") return 3;
  const connection = (navigator as NavigatorWithConnection).connection;
  if (connection?.saveData) return 1;
  if (connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") return 1;
  if (connection?.effectiveType === "3g") return 2;
  return 3;
}

class ImagePreloader {
  private queue: Record<ImagePriority, string[]> = { high: [], medium: [], low: [] };
  private queuedPriority = new Map<string, ImagePriority>();
  private active = 0;
  private maxConcurrent = resolveMaxConcurrent();
  private loaded = new Set<string>();
  private inflight = new Set<string>();
  private idleFlushToken: number | null = null;

  preload(url: string, priority: ImagePriority = "medium") {
    if (!url || this.loaded.has(url) || this.inflight.has(url)) return;

    const existingPriority = this.queuedPriority.get(url);
    if (existingPriority) {
      this.promote(url, existingPriority, priority);
      return;
    }

    this.queue[priority].push(url);
    this.queuedPriority.set(url, priority);
    this.flush();
  }

  isLoaded(url: string): boolean {
    return this.loaded.has(url);
  }

  private promote(url: string, from: ImagePriority, to: ImagePriority) {
    if (PRIORITY_WEIGHT[to] >= PRIORITY_WEIGHT[from]) return;
    const fromQueue = this.queue[from];
    const index = fromQueue.indexOf(url);
    if (index === -1) return;
    fromQueue.splice(index, 1);
    this.queue[to].push(url);
    this.queuedPriority.set(url, to);
  }

  private hasUrgentQueue() {
    return this.queue.high.length > 0 || this.queue.medium.length > 0;
  }

  private popNext(allowLow: boolean): QueueItem | null {
    const high = this.queue.high.shift();
    if (high) {
      this.queuedPriority.delete(high);
      return { url: high, priority: "high" };
    }
    const medium = this.queue.medium.shift();
    if (medium) {
      this.queuedPriority.delete(medium);
      return { url: medium, priority: "medium" };
    }
    if (!allowLow) return null;
    const low = this.queue.low.shift();
    if (!low) return null;
    this.queuedPriority.delete(low);
    return { url: low, priority: "low" };
  }

  private scheduleIdleFlush() {
    if (this.idleFlushToken !== null || this.queue.low.length === 0) return;
    const win = window as WindowWithIdle;
    if (typeof win.requestIdleCallback === "function") {
      this.idleFlushToken = win.requestIdleCallback(
        () => {
          this.idleFlushToken = null;
          this.flush(true);
        },
        { timeout: IDLE_TIMEOUT_MS }
      );
      return;
    }
    this.idleFlushToken = window.setTimeout(() => {
      this.idleFlushToken = null;
      this.flush(true);
    }, 300);
  }

  private flush(allowLow = false) {
    while (this.active < this.maxConcurrent) {
      const item = this.popNext(allowLow);
      if (!item) break;
      if (this.loaded.has(item.url) || this.inflight.has(item.url)) continue;

      this.active++;
      this.inflight.add(item.url);

      const img = new Image();
      const done = () => {
        this.active--;
        this.inflight.delete(item.url);
        this.loaded.add(item.url);
        this.flush();
      };
      img.onload = done;
      img.onerror = done;
      img.src = item.url;
    }

    if (!allowLow && this.active < this.maxConcurrent && !this.hasUrgentQueue() && this.queue.low.length > 0) {
      this.scheduleIdleFlush();
    }
  }
}

export const imagePreloader = new ImagePreloader();

/**
 * 批量预加载图片（fire-and-forget）。
 * 内部按 url 去重，重复调用不会产生多余请求。
 */
export function usePreloadImages(urls: string[], priority: ImagePriority = "medium") {
  const key = urls.filter(Boolean).join("\n");
  useEffect(() => {
    if (!key) return;
    for (const url of key.split("\n")) {
      imagePreloader.preload(url, priority);
    }
  }, [key, priority]);
}

/**
 * 轮播图预加载策略：当前帧 HIGH，相邻帧 MEDIUM，其余 LOW。
 */
export function useCarouselPreload(urls: string[], activeIndex: number) {
  useEffect(() => {
    const len = urls.length;
    if (!len) return;

    imagePreloader.preload(urls[activeIndex], "high");

    const next = (activeIndex + 1) % len;
    const prev = (activeIndex - 1 + len) % len;
    if (next !== activeIndex) imagePreloader.preload(urls[next], "medium");
    if (prev !== activeIndex && prev !== next) imagePreloader.preload(urls[prev], "medium");

    for (let i = 0; i < len; i++) {
      if (i !== activeIndex && i !== next && i !== prev) {
        imagePreloader.preload(urls[i], "low");
      }
    }
  }, [urls, activeIndex]);
}
