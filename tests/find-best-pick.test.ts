import { describe, expect, test, vi } from 'vitest';
import { handleFindBestPick, FindBestPickInput } from '../src/tools/v1_3/find-best-pick.js';
import type { VirtualSMSClient, Country, Price } from '../src/client.js';

function makeClient(impl: Partial<VirtualSMSClient>): VirtualSMSClient {
  return impl as unknown as VirtualSMSClient;
}

function parseResult(out: { content: Array<{ type: 'text'; text: string }> }): Record<string, unknown> {
  return JSON.parse(out.content[0].text);
}

const ALL_COUNTRIES: Country[] = [
  { iso: 'US', name: 'United States' },
  { iso: 'GB', name: 'United Kingdom' },
  { iso: 'DE', name: 'Germany' },
  { iso: 'NL', name: 'Netherlands' },
  { iso: 'RU', name: 'Russia' },
];

const PRICE_TABLE: Record<string, { price_usd: number; available: boolean }> = {
  US: { price_usd: 0.5, available: true },
  GB: { price_usd: 0.3, available: true },
  DE: { price_usd: 0.2, available: true },
  NL: { price_usd: 0.25, available: true },
  RU: { price_usd: 0.1, available: false }, // out of stock
};

function priceFor(_service: string, country: string): Promise<Price> {
  const p = PRICE_TABLE[country];
  if (!p) return Promise.reject(new Error(`Not found ${country}`));
  return Promise.resolve({ price_usd: p.price_usd, currency: 'USD', available: p.available });
}

describe('virtualsms_find_best_pick', () => {
  test('input validation — service required, prefer defaults to balanced', () => {
    expect(() => FindBestPickInput.parse({})).toThrow();
    const ok = FindBestPickInput.parse({ service: 'tg' });
    expect(ok.prefer).toBe('balanced');
  });

  test('cheapest mode picks the absolute cheapest with stock', async () => {
    const client = makeClient({
      listCountries: vi.fn(async () => ALL_COUNTRIES),
      checkPrice: vi.fn((s: string, c: string) => priceFor(s, c)),
    });
    const out = await handleFindBestPick(
      client,
      FindBestPickInput.parse({ service: 'tg', prefer: 'cheapest' })
    );
    const data = parseResult(out);
    const pick = data.pick as { country: string };
    // RU is cheaper but out of stock — DE is the cheapest WITH stock.
    expect(pick.country).toBe('DE');
  });

  test('country_pool restricts to whitelist', async () => {
    const client = makeClient({
      listCountries: vi.fn(async () => ALL_COUNTRIES),
      checkPrice: vi.fn((s: string, c: string) => priceFor(s, c)),
    });
    const out = await handleFindBestPick(
      client,
      FindBestPickInput.parse({ service: 'tg', country_pool: ['US', 'GB'] })
    );
    const data = parseResult(out);
    const pick = data.pick as { country: string };
    // Only US + GB considered → GB is cheaper.
    expect(pick.country).toBe('GB');
  });

  test('country_exclude blacklists countries', async () => {
    const client = makeClient({
      listCountries: vi.fn(async () => ALL_COUNTRIES),
      checkPrice: vi.fn((s: string, c: string) => priceFor(s, c)),
    });
    const out = await handleFindBestPick(
      client,
      FindBestPickInput.parse({ service: 'tg', country_exclude: ['DE', 'RU'] })
    );
    const data = parseResult(out);
    const pick = data.pick as { country: string };
    // DE excluded, RU OOS — NL is next cheapest at 0.25.
    expect(pick.country).toBe('NL');
  });

  test('reasoning is plain English with country name + price', async () => {
    const client = makeClient({
      listCountries: vi.fn(async () => ALL_COUNTRIES),
      checkPrice: vi.fn((s: string, c: string) => priceFor(s, c)),
    });
    const out = await handleFindBestPick(client, FindBestPickInput.parse({ service: 'tg' }));
    const data = parseResult(out);
    expect(typeof data.reasoning).toBe('string');
    expect((data.reasoning as string).length).toBeGreaterThan(0);
    const pick = data.pick as { country_name: string; country: string; price_usd: number };
    expect(pick.country_name).toBe('Germany');
    expect(pick.price_usd).toBe(0.2);
  });

  test('no countries available → returns no_pick error gracefully', async () => {
    const client = makeClient({
      listCountries: vi.fn(async () => ALL_COUNTRIES),
      checkPrice: vi.fn(async () => ({ price_usd: 0, currency: 'USD', available: false })),
    });
    const out = await handleFindBestPick(client, FindBestPickInput.parse({ service: 'tg' }));
    const data = parseResult(out);
    expect(data.error).toBe('no_pick');
  });
});
