import { describe, expect, test, vi } from 'vitest';
import { handleSubscribeWebhook, SubscribeWebhookInput } from '../src/tools/v1_3/subscribe-webhook.js';
import type { VirtualSMSClient, Webhook } from '../src/client.js';

function makeClient(impl: Partial<VirtualSMSClient>): VirtualSMSClient {
  return impl as unknown as VirtualSMSClient;
}

function parseResult(out: { content: Array<{ type: 'text'; text: string }> }): Record<string, unknown> {
  return JSON.parse(out.content[0].text);
}

describe('virtualsms_subscribe_webhook', () => {
  test('rejects non-https URLs at zod layer', () => {
    expect(() =>
      SubscribeWebhookInput.parse({ url: 'not-a-url', events: ['sms.received'] })
    ).toThrow();
  });

  test('rejects unknown events', () => {
    expect(() =>
      SubscribeWebhookInput.parse({ url: 'https://x.test', events: ['random.event'] })
    ).toThrow();
  });

  test('rejects empty events array', () => {
    expect(() =>
      SubscribeWebhookInput.parse({ url: 'https://x.test', events: [] })
    ).toThrow();
  });

  test('happy path → returns webhook_id + secret + active', async () => {
    const fake: Webhook = {
      id: 'wh_1',
      url: 'https://x.test/hook',
      events: ['sms.received'],
      secret: 'whsec_xxx',
      active: true,
      created_at: '2026-04-30T12:00:00Z',
    };
    const create = vi.fn(async () => fake);
    const client = makeClient({ createWebhook: create });
    const out = await handleSubscribeWebhook(
      client,
      SubscribeWebhookInput.parse({ url: 'https://x.test/hook', events: ['sms.received'] })
    );
    const data = parseResult(out);
    expect(data.webhook_id).toBe('wh_1');
    expect(data.secret).toBe('whsec_xxx');
    expect(data.active).toBe(true);
    expect(create).toHaveBeenCalledWith({
      url: 'https://x.test/hook',
      events: ['sms.received'],
      threshold_usd: undefined,
      description: undefined,
    });
  });

  test('balance.low requires threshold_usd', async () => {
    const create = vi.fn();
    const client = makeClient({ createWebhook: create });
    const out = await handleSubscribeWebhook(
      client,
      SubscribeWebhookInput.parse({
        url: 'https://x.test',
        events: ['balance.low'],
        // threshold_usd omitted — handler should refuse before calling backend
      })
    );
    const data = parseResult(out);
    expect(data.error).toBe('threshold_required');
    expect(create).not.toHaveBeenCalled();
  });

  test('balance.low with threshold_usd → passes through to backend', async () => {
    const fake: Webhook = {
      id: 'wh_2',
      url: 'https://x.test',
      events: ['balance.low'],
      secret: 'whsec_y',
      active: true,
    };
    const create = vi.fn(async () => fake);
    const client = makeClient({ createWebhook: create });
    const out = await handleSubscribeWebhook(
      client,
      SubscribeWebhookInput.parse({
        url: 'https://x.test',
        events: ['balance.low'],
        threshold_usd: 5,
      })
    );
    const data = parseResult(out);
    expect(data.webhook_id).toBe('wh_2');
    expect(create).toHaveBeenCalledWith({
      url: 'https://x.test',
      events: ['balance.low'],
      threshold_usd: 5,
      description: undefined,
    });
  });
});
