import { describe, expect, test, vi } from 'vitest';
import { handleWaitForSmsBatch, WaitForSmsBatchInput } from '../src/tools/v1_3/wait-batch.js';
import type { VirtualSMSClient, Order } from '../src/client.js';

function makeClient(impl: Partial<VirtualSMSClient>): VirtualSMSClient {
  return impl as unknown as VirtualSMSClient;
}

function parseResult(out: { content: Array<{ type: 'text'; text: string }> }): Record<string, unknown> {
  return JSON.parse(out.content[0].text);
}

function order(o: Partial<Order>): Order {
  return {
    order_id: o.order_id ?? 'o',
    phone_number: o.phone_number ?? '+1...',
    status: o.status ?? 'waiting',
    ...o,
  } as Order;
}

describe('virtualsms_wait_for_sms_batch', () => {
  test('input validation — array bounds 1..20', () => {
    expect(() => WaitForSmsBatchInput.parse({ order_ids: [] })).toThrow();
    const tooMany = Array.from({ length: 21 }, (_, i) => `o${i}`);
    expect(() => WaitForSmsBatchInput.parse({ order_ids: tooMany })).toThrow();
    const ok = WaitForSmsBatchInput.parse({ order_ids: ['o1'] });
    expect(ok.timeout_seconds).toBe(120);
    expect(ok.return_partial).toBe(true);
  });

  test('happy path — all SMS arrive on first poll', async () => {
    const client = makeClient({
      getApiKey: () => undefined, // forces polling fallback (no WS)
      getBaseUrl: () => 'https://example.com',
      getOrder: vi.fn(async (id: string) =>
        order({
          order_id: id,
          status: 'sms_received',
          messages: [{ content: `Code is ${id.slice(-1)}1234`, sender: 'svc' }],
        })
      ),
    });
    const out = await handleWaitForSmsBatch(
      client,
      WaitForSmsBatchInput.parse({ order_ids: ['o1', 'o2', 'o3'], timeout_seconds: 5 })
    );
    const data = parseResult(out);
    const received = data.received as Array<{ order_id: string; code: string }>;
    expect(received.length).toBe(3);
    expect(received.map((r) => r.order_id).sort()).toEqual(['o1', 'o2', 'o3']);
    expect(data.timed_out).toEqual([]);
    expect(data.errors).toEqual([]);
  });

  test('partial — some orders time out, return_partial=true returns what arrived', async () => {
    const callCounts: Record<string, number> = { o1: 0, o2: 0 };
    const client = makeClient({
      getApiKey: () => undefined,
      getBaseUrl: () => 'https://example.com',
      getOrder: vi.fn(async (id: string) => {
        callCounts[id] = (callCounts[id] ?? 0) + 1;
        if (id === 'o1') {
          return order({ order_id: id, status: 'sms_received', messages: [{ content: 'code 5555' }] });
        }
        // o2 stays waiting forever → times out
        return order({ order_id: id, status: 'waiting' });
      }),
    });
    const out = await handleWaitForSmsBatch(
      client,
      WaitForSmsBatchInput.parse({ order_ids: ['o1', 'o2'], timeout_seconds: 5 })
    );
    const data = parseResult(out);
    const received = data.received as Array<{ order_id: string }>;
    expect(received.map((r) => r.order_id)).toEqual(['o1']);
    expect(data.timed_out).toEqual(['o2']);
    expect(data.errors).toEqual([]);
  }, 15_000);

  test('error path — getOrder rejects → recorded in errors[]', async () => {
    const client = makeClient({
      getApiKey: () => undefined,
      getBaseUrl: () => 'https://example.com',
      getOrder: vi.fn(async (id: string) => {
        if (id === 'o1') return order({ order_id: id, status: 'sms_received', messages: [{ content: 'code 1234' }] });
        throw new Error('Not found: o2');
      }),
    });
    const out = await handleWaitForSmsBatch(
      client,
      WaitForSmsBatchInput.parse({ order_ids: ['o1', 'o2'], timeout_seconds: 5 })
    );
    const data = parseResult(out);
    const errors = data.errors as Array<{ order_id: string; error: string }>;
    expect(errors.length).toBe(1);
    expect(errors[0].order_id).toBe('o2');
    expect(errors[0].error).toMatch(/Not found/);
    const received = data.received as Array<{ order_id: string }>;
    expect(received.map((r) => r.order_id)).toEqual(['o1']);
  });
});
