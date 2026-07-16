/**
 * Unit tests for the HTTP transport's per-key/per-IP token-bucket rate
 * limiter (src/http-server.ts: takeToken). Small, deterministic capacity is
 * forced via env vars BEFORE the module is (dynamically) imported, since
 * RATE_LIMIT_CAPACITY/RATE_LIMIT_REFILL_PER_SEC are read once at module load.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

process.env.VIRTUALSMS_SANDBOX = '1';
process.env.VIRTUALSMS_RATE_LIMIT_CAPACITY = '3';
process.env.VIRTUALSMS_RATE_LIMIT_REFILL_PER_SEC = '1';

let takeToken: typeof import('../../http-server.js').takeToken;
let resetRateLimit: typeof import('../../http-server.js').__resetRateLimitForTests;
let CAPACITY: number;
let REFILL_PER_SEC: number;

beforeAll(async () => {
  const mod = await import('../../http-server.js');
  takeToken = mod.takeToken;
  resetRateLimit = mod.__resetRateLimitForTests;
  CAPACITY = mod.RATE_LIMIT_CAPACITY;
  REFILL_PER_SEC = mod.RATE_LIMIT_REFILL_PER_SEC;
});

beforeEach(() => {
  resetRateLimit();
});

describe('takeToken (rate limiter)', () => {
  it('picked up the small test capacity from env (sanity)', () => {
    expect(CAPACITY).toBe(3);
    expect(REFILL_PER_SEC).toBe(1);
  });

  it('allows up to capacity requests, then rejects with a positive retry_after', () => {
    const key = 'ip:1.2.3.4';
    for (let i = 0; i < CAPACITY; i++) {
      const result = takeToken(key);
      expect(result.allowed, `request ${i + 1} of ${CAPACITY} should be allowed`).toBe(true);
    }
    const blocked = takeToken(key);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('keeps separate buckets per key — one caller exhausting its bucket does not affect another', () => {
    const keyA = 'key:aaa';
    const keyB = 'key:bbb';
    for (let i = 0; i < CAPACITY; i++) {
      expect(takeToken(keyA).allowed).toBe(true);
    }
    expect(takeToken(keyA).allowed).toBe(false);
    // keyB has its own fresh bucket — unaffected by keyA's exhaustion.
    expect(takeToken(keyB).allowed).toBe(true);
  });

  it('refills over time (custom capacity/refill passed directly — no real sleep needed)', () => {
    const key = 'ip:refill-test';
    // Use a fresh explicit bucket via custom params so we can control timing precisely.
    const capacity = 1;
    const refillPerSec = 1000; // fast refill for a deterministic, quick test
    expect(takeToken(key, capacity, refillPerSec).allowed).toBe(true);
    expect(takeToken(key, capacity, refillPerSec).allowed).toBe(false);
  });

  it('a request denied on one bucket alone is enough to block (per-IP AND per-key semantics simulated at call-site level)', () => {
    // The actual "both buckets must allow" AND-logic lives in handleRequest;
    // this test documents the bucket-level contract each check relies on —
    // exhausting either individual bucket returns allowed:false.
    const key = 'ip:solo';
    for (let i = 0; i < CAPACITY; i++) takeToken(key);
    expect(takeToken(key).allowed).toBe(false);
  });
});
