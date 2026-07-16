import { describe, expect, it } from 'vitest';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { mapToolCallError, sanitizeErrorMessage } from '../error-utils.js';

describe('sanitizeErrorMessage', () => {
  it('strips Node stack-trace frames', () => {
    const raw = [
      'Something went wrong',
      '    at Object.<anonymous> (/app/dist/client.js:42:11)',
      '    at Module._compile (node:internal/modules/cjs/loader:1234:14)',
    ].join('\n');
    const clean = sanitizeErrorMessage(raw);
    expect(clean).not.toMatch(/\bat\s/);
    expect(clean).toContain('Something went wrong');
  });

  it('redacts a Windows absolute file path', () => {
    const clean = sanitizeErrorMessage(String.raw`ENOENT: C:\Users\baran\secret\config.json not found`);
    expect(clean).not.toContain('baran');
    expect(clean).toContain('[path]');
  });

  it('redacts a POSIX absolute file path', () => {
    const clean = sanitizeErrorMessage('ENOENT: /home/deploy/app/internal-config.json not found');
    expect(clean).not.toContain('/home/deploy');
    expect(clean).toContain('[path]');
  });

  it('redacts loopback and private-network hosts', () => {
    expect(sanitizeErrorMessage('connect ECONNREFUSED 127.0.0.1:5432')).toContain('[host]');
    expect(sanitizeErrorMessage('connect ECONNREFUSED localhost:5432')).toContain('[host]');
    expect(sanitizeErrorMessage('upstream 192.168.1.50 timed out')).toContain('[host]');
    expect(sanitizeErrorMessage('upstream 10.0.4.12 timed out')).toContain('[host]');
  });

  it('does NOT touch public product domains/URLs', () => {
    const clean = sanitizeErrorMessage('Invalid API key. Get one at https://virtualsms.io');
    expect(clean).toContain('virtualsms.io');
  });

  it('preserves normal short backend error text unchanged (aside from whitespace normalization)', () => {
    expect(sanitizeErrorMessage('Insufficient balance. Top up at https://virtualsms.io'))
      .toBe('Insufficient balance. Top up at https://virtualsms.io');
  });

  it('truncates very long messages', () => {
    const huge = 'x'.repeat(5000);
    const clean = sanitizeErrorMessage(huge);
    expect(clean.length).toBeLessThan(600);
    expect(clean).toMatch(/truncated/);
  });

  it('falls back to a generic message for empty/null/undefined input', () => {
    expect(sanitizeErrorMessage('')).toBe('An unexpected error occurred.');
    expect(sanitizeErrorMessage(null)).toBe('An unexpected error occurred.');
    expect(sanitizeErrorMessage(undefined)).toBe('An unexpected error occurred.');
  });
});

describe('mapToolCallError', () => {
  it('passes an existing McpError through unchanged', () => {
    const original = new McpError(ErrorCode.InvalidRequest, 'already an MCP error');
    expect(mapToolCallError(original)).toBe(original);
  });

  it('maps a ZodError-shaped failure to InvalidParams', () => {
    const err = new Error('ZodError: [{"code":"invalid_type","path":["service"]}]');
    const mapped = mapToolCallError(err);
    expect(mapped).toBeInstanceOf(McpError);
    expect(mapped.code).toBe(ErrorCode.InvalidParams);
    expect(mapped.message).toContain('Invalid parameters');
  });

  it('maps an API-key failure to InvalidRequest', () => {
    const err = new Error('VIRTUALSMS_API_KEY is required for this operation.');
    const mapped = mapToolCallError(err);
    expect(mapped.code).toBe(ErrorCode.InvalidRequest);
  });

  it('maps a generic Error to InternalError, with the message sanitized', () => {
    const err = new Error('boom\n    at Object.<anonymous> (/opt/app/dist/client.js:10:5)');
    const mapped = mapToolCallError(err);
    expect(mapped.code).toBe(ErrorCode.InternalError);
    expect(mapped.message).not.toMatch(/\bat\s/);
    expect(mapped.message).not.toContain('/opt/app');
  });

  it('handles a thrown non-Error value without crashing', () => {
    const mapped = mapToolCallError('just a string');
    expect(mapped).toBeInstanceOf(McpError);
    expect(mapped.code).toBe(ErrorCode.InternalError);
  });
});
