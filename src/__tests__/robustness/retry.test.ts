/**
 * Unit tests for the API client's GET-only retry policy (src/client.ts:
 * shouldRetryGet / getRetryDelayMs). Tested as pure functions rather than by
 * mocking axios internals — the safety-critical property is the *decision*
 * (which methods/statuses/attempt-counts get retried), not the axios
 * plumbing, and pure functions make that property trivial to pin down.
 */
import { describe, expect, it } from 'vitest';
import { GET_RETRY_MAX_ATTEMPTS, getRetryDelayMs, shouldRetryGet } from '../../client.js';

describe('shouldRetryGet', () => {
  it('retries GET on a network error (no response at all)', () => {
    expect(shouldRetryGet({ method: 'get', status: undefined, hasResponse: false, attemptsSoFar: 1 })).toBe(true);
  });

  it('retries GET on a 5xx server error', () => {
    expect(shouldRetryGet({ method: 'GET', status: 500, hasResponse: true, attemptsSoFar: 1 })).toBe(true);
    expect(shouldRetryGet({ method: 'get', status: 503, hasResponse: true, attemptsSoFar: 2 })).toBe(true);
  });

  it('retries HEAD the same as GET', () => {
    expect(shouldRetryGet({ method: 'head', status: 502, hasResponse: true, attemptsSoFar: 1 })).toBe(true);
  });

  it('never retries any 4xx — not transient, and 429 would fight the rate limiter', () => {
    expect(shouldRetryGet({ method: 'get', status: 401, hasResponse: true, attemptsSoFar: 1 })).toBe(false);
    expect(shouldRetryGet({ method: 'get', status: 402, hasResponse: true, attemptsSoFar: 1 })).toBe(false);
    expect(shouldRetryGet({ method: 'get', status: 404, hasResponse: true, attemptsSoFar: 1 })).toBe(false);
    expect(shouldRetryGet({ method: 'get', status: 429, hasResponse: true, attemptsSoFar: 1 })).toBe(false);
  });

  it('NEVER retries mutating methods, even on a network error or 5xx (double-charge/double-cancel risk)', () => {
    expect(shouldRetryGet({ method: 'post', status: undefined, hasResponse: false, attemptsSoFar: 1 })).toBe(false);
    expect(shouldRetryGet({ method: 'POST', status: 500, hasResponse: true, attemptsSoFar: 1 })).toBe(false);
    expect(shouldRetryGet({ method: 'put', status: 503, hasResponse: true, attemptsSoFar: 1 })).toBe(false);
    expect(shouldRetryGet({ method: 'delete', status: undefined, hasResponse: false, attemptsSoFar: 1 })).toBe(false);
    expect(shouldRetryGet({ method: 'patch', status: 500, hasResponse: true, attemptsSoFar: 1 })).toBe(false);
  });

  it('stops retrying once GET_RETRY_MAX_ATTEMPTS is reached (bounded, not infinite)', () => {
    expect(shouldRetryGet({ method: 'get', status: 500, hasResponse: true, attemptsSoFar: GET_RETRY_MAX_ATTEMPTS - 1 })).toBe(true);
    expect(shouldRetryGet({ method: 'get', status: 500, hasResponse: true, attemptsSoFar: GET_RETRY_MAX_ATTEMPTS })).toBe(false);
    expect(shouldRetryGet({ method: 'get', status: 500, hasResponse: true, attemptsSoFar: GET_RETRY_MAX_ATTEMPTS + 1 })).toBe(false);
  });

  it('GET_RETRY_MAX_ATTEMPTS is a small bounded number (2 or 3 attempts total per the spec)', () => {
    expect(GET_RETRY_MAX_ATTEMPTS).toBeGreaterThanOrEqual(2);
    expect(GET_RETRY_MAX_ATTEMPTS).toBeLessThanOrEqual(3);
  });
});

describe('getRetryDelayMs', () => {
  it('grows exponentially with attempt number', () => {
    const d1 = getRetryDelayMs(1);
    const d2 = getRetryDelayMs(2);
    const d3 = getRetryDelayMs(3);
    expect(d1).toBeGreaterThan(0);
    expect(d2).toBe(d1 * 2);
    expect(d3).toBe(d1 * 4);
  });
});
