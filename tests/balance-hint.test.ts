import { describe, expect, test, vi } from 'vitest';
import { handleGetBalance } from '../src/tools.js';
import type { VirtualSMSClient, X402Info } from '../src/client.js';

function makeClient(impl: Partial<VirtualSMSClient>): VirtualSMSClient {
  return impl as unknown as VirtualSMSClient;
}

function parseResult(out: { content: Array<{ type: 'text'; text: string }> }): Record<string, unknown> {
  return JSON.parse(out.content[0].text);
}

describe('handleGetBalance — v1.3.0 additive fields', () => {
  test('still returns balance_usd (backward compat)', async () => {
    const client = makeClient({
      getBalance: vi.fn(async () => ({ balance_usd: 12.4 })),
      getX402Info: vi.fn(async () => ({ enabled: true, networks: [] }) as X402Info),
    });
    const out = await handleGetBalance(client);
    const data = parseResult(out);
    expect(data.balance_usd).toBe(12.4);
  });

  test('adds topup_url + x402_topup_available when x402 enabled', async () => {
    const client = makeClient({
      getBalance: vi.fn(async () => ({ balance_usd: 1.5 })),
      getX402Info: vi.fn(async () => ({ enabled: true, networks: [{ network: 'base', token: 'USDC' }] }) as X402Info),
    });
    const out = await handleGetBalance(client);
    const data = parseResult(out);
    expect(typeof data.topup_url).toBe('string');
    expect((data.topup_url as string).startsWith('https://')).toBe(true);
    expect(data.x402_topup_available).toBe(true);
  });

  test('x402 disabled → x402_topup_available=false but topup_url still present', async () => {
    const client = makeClient({
      getBalance: vi.fn(async () => ({ balance_usd: 1.5 })),
      getX402Info: vi.fn(async () => ({ enabled: false, networks: [] }) as X402Info),
    });
    const out = await handleGetBalance(client);
    const data = parseResult(out);
    expect(data.x402_topup_available).toBe(false);
    expect(typeof data.topup_url).toBe('string');
  });

  test('x402 lookup fails → still returns balance, x402_topup_available=false', async () => {
    const client = makeClient({
      getBalance: vi.fn(async () => ({ balance_usd: 0.5 })),
      getX402Info: vi.fn(async () => {
        throw new Error('503');
      }),
    });
    const out = await handleGetBalance(client);
    const data = parseResult(out);
    expect(data.balance_usd).toBe(0.5);
    expect(data.x402_topup_available).toBe(false);
  });
});
