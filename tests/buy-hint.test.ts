import { describe, expect, test, vi, beforeEach } from 'vitest';
import { handleBuyNumber, BuyNumberInput, _resetWebhookCacheForTests } from '../src/tools.js';
import type { VirtualSMSClient, Order, Webhook } from '../src/client.js';

function makeClient(impl: Partial<VirtualSMSClient>): VirtualSMSClient {
  return impl as unknown as VirtualSMSClient;
}

function parseResult(out: { content: Array<{ type: 'text'; text: string }> }): Record<string, unknown> {
  return JSON.parse(out.content[0].text);
}

const fakeOrder: Order = {
  order_id: 'o1',
  phone_number: '+44...',
  status: 'waiting',
};

beforeEach(() => {
  _resetWebhookCacheForTests();
});

describe('handleBuyNumber — v1.3.0 additive webhook hint', () => {
  test('still returns order_id + phone_number (backward compat)', async () => {
    const client = makeClient({
      createOrder: vi.fn(async () => fakeOrder),
      listWebhooks: vi.fn(async () => []),
    });
    const out = await handleBuyNumber(client, BuyNumberInput.parse({ service: 'tg', country: 'GB' }));
    const data = parseResult(out);
    expect(data.order_id).toBe('o1');
    expect(data.phone_number).toBe('+44...');
  });

  test('no webhook for sms.received → adds webhook_subscribe_hint tip', async () => {
    const client = makeClient({
      createOrder: vi.fn(async () => fakeOrder),
      listWebhooks: vi.fn(async () => [] as Webhook[]),
    });
    const out = await handleBuyNumber(client, BuyNumberInput.parse({ service: 'tg', country: 'GB' }));
    const data = parseResult(out);
    expect(data.webhook_subscribe_hint).toBeDefined();
    expect(typeof data.webhook_subscribe_hint).toBe('string');
    expect(data.webhook_subscribe_hint as string).toMatch(/subscribe_webhook/);
  });

  test('existing sms.received webhook → suppresses hint', async () => {
    const client = makeClient({
      createOrder: vi.fn(async () => fakeOrder),
      listWebhooks: vi.fn(async () => [
        { id: 'wh_1', url: 'https://x.test', events: ['sms.received'], active: true },
      ] as Webhook[]),
    });
    const out = await handleBuyNumber(client, BuyNumberInput.parse({ service: 'tg', country: 'GB' }));
    const data = parseResult(out);
    expect(data.webhook_subscribe_hint).toBeUndefined();
  });

  test('cache: 2nd call within 30s does not re-query listWebhooks', async () => {
    const list = vi.fn(async () => [] as Webhook[]);
    const client = makeClient({
      createOrder: vi.fn(async () => fakeOrder),
      listWebhooks: list,
    });
    await handleBuyNumber(client, BuyNumberInput.parse({ service: 'tg', country: 'GB' }));
    await handleBuyNumber(client, BuyNumberInput.parse({ service: 'tg', country: 'GB' }));
    expect(list).toHaveBeenCalledTimes(1);
  });

  test('listWebhooks fails → still returns order, suppresses hint', async () => {
    const client = makeClient({
      createOrder: vi.fn(async () => fakeOrder),
      listWebhooks: vi.fn(async () => {
        throw new Error('lookup failed');
      }),
    });
    const out = await handleBuyNumber(client, BuyNumberInput.parse({ service: 'tg', country: 'GB' }));
    const data = parseResult(out);
    expect(data.order_id).toBe('o1');
    expect(data.webhook_subscribe_hint).toBeUndefined();
  });
});
