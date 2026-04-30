import { describe, expect, test, vi } from 'vitest';
import { handleX402Info, X402InfoInput } from '../src/tools/v1_3/x402-info.js';
import type { VirtualSMSClient, X402Info } from '../src/client.js';

function makeClient(impl: Partial<VirtualSMSClient>): VirtualSMSClient {
  return impl as unknown as VirtualSMSClient;
}

function parseResult(out: { content: Array<{ type: 'text'; text: string }> }): Record<string, unknown> {
  return JSON.parse(out.content[0].text);
}

describe('virtualsms_x402_info', () => {
  test('happy path — maps backend response to agent-friendly shape', async () => {
    const fakeInfo: X402Info = {
      enabled: true,
      x402_version: 1,
      networks: [
        { network: 'solana', token: 'USDC' },
        { network: 'solana', token: 'USDT' },
        { network: 'base', token: 'USDC' },
      ],
      evm_relayer: '0xfEc54264350d97d9b63f9Cc415BAF708C4695F32',
      solana_relayer: '7AJwx3J2qXnURXZmU5AotDeMUY5dDBqBFbweHLZ2UeUs',
      min_topup_usd: 2,
      max_topup_usd: 10000,
      default_topup_usd: 5,
      topup_endpoint: 'https://virtualsms.io/api/v1/x402/topup',
    };
    const client = makeClient({
      getX402Info: vi.fn(async () => fakeInfo),
    });
    const out = await handleX402Info(client, X402InfoInput.parse({}));
    const data = parseResult(out);
    expect(data.enabled).toBe(true);
    const accepts = data.accepts as Array<{ network: string; asset: string }>;
    expect(accepts.length).toBe(3);
    expect(accepts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ network: 'solana', asset: 'USDC' }),
        expect.objectContaining({ network: 'base', asset: 'USDC' }),
      ])
    );
    expect(data.min_topup_usd).toBe(2);
    expect(data.max_topup_usd).toBe(10000);
    expect(typeof data.tip).toBe('string');
  });

  test('NEVER exposes BSC/BNB in accepts even if backend leaks it', async () => {
    const leaky: X402Info = {
      enabled: true,
      networks: [
        { network: 'base', token: 'USDC' },
        { network: 'bsc', token: 'USDC' }, // backend should never return this — but defend anyway
        { network: 'binance', token: 'BNB' }, // alt name
        { network: 'bnb', token: 'USDT' }, // another alt
      ],
    };
    const client = makeClient({ getX402Info: vi.fn(async () => leaky) });
    const out = await handleX402Info(client, X402InfoInput.parse({}));
    const data = parseResult(out);
    const accepts = data.accepts as Array<{ network: string }>;
    const networks = accepts.map((a) => a.network.toLowerCase());
    expect(networks).not.toContain('bsc');
    expect(networks).not.toContain('binance');
    expect(networks).not.toContain('bnb');
    expect(networks).toContain('base');
  });

  test('disabled — backend returns enabled:false → returns enabled:false (no payment_required)', async () => {
    const client = makeClient({
      getX402Info: vi.fn(async () => ({ enabled: false, networks: [] }) as X402Info),
    });
    const out = await handleX402Info(client, X402InfoInput.parse({}));
    const data = parseResult(out);
    expect(data.enabled).toBe(false);
    expect(data.accepts).toEqual([]);
  });

  test('error path — backend 503 → graceful unsupported_on_this_backend', async () => {
    const client = makeClient({
      getX402Info: vi.fn(async () => {
        throw new Error('VirtualSMS server error (503).');
      }),
    });
    const out = await handleX402Info(client, X402InfoInput.parse({}));
    const data = parseResult(out);
    expect(data.error).toBe('unsupported_on_this_backend');
    expect(data.enabled).toBe(false);
  });
});
