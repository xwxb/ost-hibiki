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
const MAX_CONCURRENT = 3;

class ImagePreloader {
  private queue: QueueItem[] = [];
  private active = 0;
  private loaded = new Set<string>();
  private inflight = new Set<string>();

  preload(url: string, priority: ImagePriority = "medium") {
    if (!url || this.loaded.has(url) || this.inflight.has(url)) return;

    const existing = this.queue.find(item => item.url === url);
    if (existing) {
      if (PRIORITY_WEIGHT[priority] < PRIORITY_WEIGHT[existing.priority]) {
        existing.priority = priority;
      }
      return;
    }

    this.queue.push({ url, priority });
    this.flush();
  }

  isLoaded(url: string): boolean {
    return this.loaded.has(url);
  }

  private flush() {
    while (this.active < MAX_CONCURRENT && this.queue.length > 0) {
      this.queue.sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]);
      const item = this.queue.shift()!;

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
