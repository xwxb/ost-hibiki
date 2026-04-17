import { beforeEach, describe, expect, it } from "vitest";
import { __resetRateLimitStore, rateLimit } from "@/lib/rate-limit";

beforeEach(() => {
  __resetRateLimitStore();
});

describe("rateLimit", () => {
  it("allows up to max within window", () => {
    const opts = { windowMs: 1000, max: 3 };
    expect(rateLimit("k", opts, 0).allowed).toBe(true);
    expect(rateLimit("k", opts, 100).allowed).toBe(true);
    expect(rateLimit("k", opts, 200).allowed).toBe(true);
    const blocked = rateLimit("k", opts, 300);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("recovers after window slides", () => {
    const opts = { windowMs: 1000, max: 1 };
    expect(rateLimit("k", opts, 0).allowed).toBe(true);
    expect(rateLimit("k", opts, 500).allowed).toBe(false);
    expect(rateLimit("k", opts, 1500).allowed).toBe(true);
  });

  it("isolates keys", () => {
    const opts = { windowMs: 1000, max: 1 };
    expect(rateLimit("a", opts, 0).allowed).toBe(true);
    expect(rateLimit("b", opts, 0).allowed).toBe(true);
    expect(rateLimit("a", opts, 100).allowed).toBe(false);
  });
});
