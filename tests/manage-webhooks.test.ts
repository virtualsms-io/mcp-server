import { describe, expect, test, vi } from 'vitest';
import { handleManageWebhooks, ManageWebhooksInput } from '../src/tools/v1_3/manage-webhooks.js';
import type { VirtualSMSClient, Webhook, WebhookDelivery } from '../src/client.js';

function makeClient(impl: Partial<VirtualSMSClient>): VirtualSMSClient {
  return impl as unknown as VirtualSMSClient;
}

function parseResult(out: { content: Array<{ type: 'text'; text: string }> }): Record<string, unknown> {
  return JSON.parse(out.content[0].text);
}

describe('virtualsms_manage_webhooks', () => {
  test('input validation — webhook_id required for delete/test/deliveries', () => {
    expect(() => ManageWebhooksInput.parse({ action: 'delete' })).toThrow();
    expect(() => ManageWebhooksInput.parse({ action: 'test' })).toThrow();
    expect(() => ManageWebhooksInput.parse({ action: 'deliveries' })).toThrow();
    expect(() => ManageWebhooksInput.parse({ action: 'list' })).not.toThrow();
    expect(() => ManageWebhooksInput.parse({ action: 'delete', webhook_id: 'wh_1' })).not.toThrow();
  });

  test('action=list dispatches to listWebhooks', async () => {
    const fake: Webhook[] = [
      { id: 'wh_1', url: 'https://x.test', events: ['sms.received'], active: true },
    ];
    const list = vi.fn(async () => fake);
    const client = makeClient({ listWebhooks: list });
    const out = await handleManageWebhooks(
      client,
      ManageWebhooksInput.parse({ action: 'list' })
    );
    const data = parseResult(out);
    expect(list).toHaveBeenCalled();
    const wh = data.webhooks as Array<{ id: string }>;
    expect(wh[0].id).toBe('wh_1');
    expect(data.count).toBe(1);
  });

  test('action=delete dispatches to deleteWebhook(id)', async () => {
    const del = vi.fn(async () => ({ deleted: true }));
    const client = makeClient({ deleteWebhook: del });
    const out = await handleManageWebhooks(
      client,
      ManageWebhooksInput.parse({ action: 'delete', webhook_id: 'wh_1' })
    );
    const data = parseResult(out);
    expect(del).toHaveBeenCalledWith('wh_1');
    expect(data.deleted).toBe(true);
  });

  test('action=test dispatches to testWebhook(id)', async () => {
    const test1 = vi.fn(async () => ({ delivered: true, response_code: 200 }));
    const client = makeClient({ testWebhook: test1 });
    const out = await handleManageWebhooks(
      client,
      ManageWebhooksInput.parse({ action: 'test', webhook_id: 'wh_1' })
    );
    const data = parseResult(out);
    expect(test1).toHaveBeenCalledWith('wh_1');
    expect(data.delivered).toBe(true);
    expect(data.response_code).toBe(200);
  });

  test('action=deliveries dispatches to getDeliveries(id)', async () => {
    const fake: WebhookDelivery[] = [
      { id: 'd_1', status: 'delivered', response_code: 200 },
    ];
    const get = vi.fn(async () => fake);
    const client = makeClient({ getDeliveries: get });
    const out = await handleManageWebhooks(
      client,
      ManageWebhooksInput.parse({ action: 'deliveries', webhook_id: 'wh_1' })
    );
    const data = parseResult(out);
    expect(get).toHaveBeenCalledWith('wh_1');
    const ds = data.deliveries as Array<{ id: string }>;
    expect(ds[0].id).toBe('d_1');
  });
});
