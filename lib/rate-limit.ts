/**
 * 简单的进程内 IP 限流（滑动窗口）。
 *
 * 适用场景：MVP 阶段防止恶意刷投稿接口。
 *
 * 已知局限：
 * - Vercel Serverless 多实例之间不共享内存，攻击者可借实例分布绕过实际上限。
 * - 重新部署 / 冷启动会清空状态。
 *
 * TODO：流量上来后切到分布式方案，例如 @upstash/ratelimit + Upstash Redis。
 */

type WindowState = {
  // 当前窗口内每次请求的时间戳（ms）
  hits: number[];
};

const STORE = new Map<string, WindowState>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

export type RateLimitOptions = {
  windowMs: number;
  max: number;
};

export function rateLimit(key: string, opts: RateLimitOptions, now: number = Date.now()): RateLimitResult {
  const { windowMs, max } = opts;
  const state = STORE.get(key) ?? { hits: [] };
  const cutoff = now - windowMs;
  const recent = state.hits.filter((ts) => ts > cutoff);

  if (recent.length >= max) {
    STORE.set(key, { hits: recent });
    const earliest = recent[0];
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, earliest + windowMs - now)
    };
  }

  recent.push(now);
  STORE.set(key, { hits: recent });
  return {
    allowed: true,
    remaining: Math.max(0, max - recent.length),
    retryAfterMs: 0
  };
}

// 仅用于测试
export function __resetRateLimitStore() {
  STORE.clear();
}
