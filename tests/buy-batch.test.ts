import { describe, expect, test, vi } from 'vitest';
import { handleBuyBatch, BuyBatchInput } from '../src/tools/v1_3/buy-batch.js';
import type { VirtualSMSClient, BatchPurchaseResult, Balance, Price } from '../src/client.js';

function makeClient(impl: Partial<VirtualSMSClient>): VirtualSMSClient {
  return impl as unknown as VirtualSMSClient;
}

function parseResult(out: { content: Array<{ type: 'text'; text: string }> }): Record<string, unknown> {
  return JSON.parse(out.content[0].text);
}

describe('virtualsms_buy_batch', () => {
  test('input validation rejects count outside 1-20', () => {
    expect(() => BuyBatchInput.parse({ service: 'tg', country: 'GB', count: 0 })).toThrow();
    expect(() => BuyBatchInput.parse({ service: 'tg', country: 'GB', count: 21 })).toThrow();
    // Defaults
    const ok = BuyBatchInput.parse({ service: 'tg', country: 'GB', count: 5 });
    expect(ok.stop_on_failure).toBe(false);
  });

  test('happy path returns succeeded[] with all order_ids', async () => {
    const fake: BatchPurchaseResult = {
      succeeded: [
        { index: 0, order_id: 'o1', phone_number: '+44...', price: 0.1 },
        { index: 1, order_id: 'o2', phone_number: '+44...', price: 0.1 },
        { index: 2, order_id: 'o3', phone_number: '+44...', price: 0.1 },
      ],
      failed: [],
    };
    const client = makeClient({
      getBalance: vi.fn(async (): Promise<Balance> => ({ balance_usd: 5 })),
      checkPrice: vi.fn(async (): Promise<Price> => ({ price_usd: 0.1, currency: 'USD', available: true })),
      createOrderBatch: vi.fn(async () => fake),
    });
    const out = await handleBuyBatch(client, BuyBatchInput.parse({ service: 'tg', country: 'GB', count: 3 }));
    const data = parseResult(out);
    expect(Array.isArray(data.succeeded)).toBe(true);
    expect((data.succeeded as Array<unknown>).length).toBe(3);
    expect(data.failed).toEqual([]);
    expect(typeof data.tip).toBe('string');
  });

  test('partial failure returns succeeded + failed populated', async () => {
    const fake: BatchPurchaseResult = {
      succeeded: [
        { index: 0, order_id: 'o1', phone_number: '+44...', price: 0.1 },
        { index: 2, order_id: 'o3', phone_number: '+44...', price: 0.1 },
      ],
      failed: [{ index: 1, error: 'Insufficient stock' }],
    };
    const client = makeClient({
      getBalance: vi.fn(async (): Promise<Balance> => ({ balance_usd: 5 })),
      checkPrice: vi.fn(async (): Promise<Price> => ({ price_usd: 0.1, currency: 'USD', available: true })),
      createOrderBatch: vi.fn(async () => fake),
    });
    const out = await handleBuyBatch(client, BuyBatchInput.parse({ service: 'tg', country: 'GB', count: 3 }));
    const data = parseResult(out);
    expect((data.succeeded as Array<unknown>).length).toBe(2);
    expect((data.failed as Array<unknown>).length).toBe(1);
    expect((data.failed as Array<{ error: string }>)[0].error).toMatch(/Insufficient stock/);
  });

  test('refuses when balance × cheapest_price guard would deplete > 80%', async () => {
    // Balance $0.5, price $0.1 each, count 5 → would spend $0.5 (100% of balance).
    // 5 × 0.1 = 0.5 > 0.5 × 0.8 = 0.4. Should refuse.
    const client = makeClient({
      getBalance: vi.fn(async (): Promise<Balance> => ({ balance_usd: 0.5 })),
      checkPrice: vi.fn(async (): Promise<Price> => ({ price_usd: 0.1, currency: 'USD', available: true })),
      createOrderBatch: vi.fn(async () => ({ succeeded: [], failed: [] })),
    });
    const out = await handleBuyBatch(client, BuyBatchInput.parse({ service: 'tg', country: 'GB', count: 5 }));
    const data = parseResult(out);
    expect(data.error).toBe('budget_guard');
    // Did NOT call the batch endpoint.
    expect((client.createOrderBatch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});
