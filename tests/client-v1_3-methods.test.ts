/**
 * Backend client method tests for v1.3.0 additions.
 *
 * Per docs/v1.3.0-plan.md Task 2: x402 + webhooks methods.
 *
 * Strategy: instantiate the client and stub the internal axios instance to
 * intercept GET/POST/DELETE calls. We assert (1) the right URL is hit,
 * (2) the right method is used, (3) the right payload is sent, and
 * (4) the response is shape-mapped.
 */

import { describe, expect, test, vi } from 'vitest';
import { VirtualSMSClient } from '../src/client.js';

interface AxiosLike {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  interceptors: { request: { use: () => void }; response: { use: () => void } };
}

function patchClientHttp(client: VirtualSMSClient): AxiosLike {
  const fake: AxiosLike = {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    interceptors: { request: { use: () => undefined }, response: { use: () => undefined } },
  };
  // The constructor already created a real axios instance — replace it.
  // Cast to any for the mutation; production code never does this.
  (client as unknown as { http: AxiosLike }).http = fake;
  return fake;
}

describe('VirtualSMSClient v1.3.0 methods', () => {
  describe('getX402Info', () => {
    test('hits GET /api/v1/x402/info and shape-maps the response', async () => {
      const client = new VirtualSMSClient('https://example.com');
      const fake = patchClientHttp(client);
      fake.get.mockResolvedValueOnce({
        data: {
          enabled: true,
          x402_version: 1,
          networks: [
            { network: 'solana', token: 'USDC' },
            { network: 'base', token: 'USDC' },
          ],
          evm_relayer: '0xfEc54264350d97d9b63f9Cc415BAF708C4695F32',
          solana_relayer: '7AJwx3J2qXnURXZmU5AotDeMUY5dDBqBFbweHLZ2UeUs',
          min_topup_usd: 2,
          max_topup_usd: 10000,
          default_topup_usd: 5,
          topup_endpoint: 'https://example.com/api/v1/x402/topup',
          resource: 'https://example.com/api/v1/x402/sms-verify',
        },
      });

      const info = await client.getX402Info();
      expect(fake.get).toHaveBeenCalledWith('/api/v1/x402/info');
      expect(info.enabled).toBe(true);
      expect(info.networks).toEqual([
        { network: 'solana', token: 'USDC' },
        { network: 'base', token: 'USDC' },
      ]);
      expect(info.min_topup_usd).toBe(2);
      expect(info.max_topup_usd).toBe(10000);
      expect(info.topup_endpoint).toBe('https://example.com/api/v1/x402/topup');
    });

    test('does NOT require api key (it is discovery)', async () => {
      const client = new VirtualSMSClient('https://example.com'); // no api key
      const fake = patchClientHttp(client);
      fake.get.mockResolvedValueOnce({ data: { enabled: false } });
      // Must not throw
      await expect(client.getX402Info()).resolves.toBeDefined();
    });
  });

  describe('topup', () => {
    test('without payment proof returns the 402 manifest payload', async () => {
      const client = new VirtualSMSClient('https://example.com');
      const fake = patchClientHttp(client);
      fake.post.mockResolvedValueOnce({
        data: { x402Version: 1, accepts: [{ scheme: 'exact', network: 'base' }], error: 'Payment required' },
      });
      const result = await client.topup({ amount_usd: 5, payment_method: 'usdc-base' });
      expect(fake.post).toHaveBeenCalledWith(
        '/api/v1/x402/topup',
        { amount_usd: 5, payment_method: 'usdc-base' },
        { headers: {} }
      );
      expect((result as Record<string, unknown>).x402Version).toBe(1);
    });

    test('with payment proof forwards X-PAYMENT header', async () => {
      const client = new VirtualSMSClient('https://example.com');
      const fake = patchClientHttp(client);
      fake.post.mockResolvedValueOnce({
        data: { api_key: 'vsms_abc', balance_usd: 5 },
      });
      await client.topup({ amount_usd: 5, payment_method: 'usdc-base', payment_proof: 'eyJ...' });
      expect(fake.post).toHaveBeenCalledWith(
        '/api/v1/x402/topup',
        { amount_usd: 5, payment_method: 'usdc-base' },
        { headers: { 'X-PAYMENT': 'eyJ...' } }
      );
    });
  });

  describe('webhooks CRUD', () => {
    test('listWebhooks → GET /api/v1/customer/webhooks (requires api key)', async () => {
      const client = new VirtualSMSClient('https://example.com', 'vsms_test');
      const fake = patchClientHttp(client);
      fake.get.mockResolvedValueOnce({ data: { webhooks: [{ id: 'wh_1', url: 'https://x.test', events: ['sms.received'] }] } });
      const list = await client.listWebhooks();
      expect(fake.get).toHaveBeenCalledWith('/api/v1/customer/webhooks');
      expect(Array.isArray(list)).toBe(true);
      expect(list[0].id).toBe('wh_1');
    });

    test('listWebhooks throws without api key', async () => {
      const client = new VirtualSMSClient('https://example.com'); // no key
      // Don't patch — requireApiKey throws synchronously before axios is touched.
      await expect(client.listWebhooks()).rejects.toThrow(/VIRTUALSMS_API_KEY/);
    });

    test('createWebhook → POST with url/events/threshold_usd/description', async () => {
      const client = new VirtualSMSClient('https://example.com', 'vsms_test');
      const fake = patchClientHttp(client);
      fake.post.mockResolvedValueOnce({
        data: { id: 'wh_1', url: 'https://x.test', events: ['sms.received'], secret: 'whsec_x', active: true },
      });
      const wh = await client.createWebhook({
        url: 'https://x.test',
        events: ['sms.received', 'balance.low'],
        threshold_usd: 5,
        description: 'agent-fanout',
      });
      expect(fake.post).toHaveBeenCalledWith('/api/v1/customer/webhooks', {
        url: 'https://x.test',
        events: ['sms.received', 'balance.low'],
        threshold_usd: 5,
        description: 'agent-fanout',
      });
      expect(wh.id).toBe('wh_1');
      expect(wh.secret).toBe('whsec_x');
    });

    test('deleteWebhook → DELETE /api/v1/customer/webhooks/:id', async () => {
      const client = new VirtualSMSClient('https://example.com', 'vsms_test');
      const fake = patchClientHttp(client);
      fake.delete.mockResolvedValueOnce({ data: { deleted: true } });
      const r = await client.deleteWebhook('wh_1');
      expect(fake.delete).toHaveBeenCalledWith('/api/v1/customer/webhooks/wh_1');
      expect(r.deleted).toBe(true);
    });

    test('testWebhook → POST /api/v1/customer/webhooks/:id/test', async () => {
      const client = new VirtualSMSClient('https://example.com', 'vsms_test');
      const fake = patchClientHttp(client);
      fake.post.mockResolvedValueOnce({ data: { delivered: true, response_code: 200 } });
      const r = await client.testWebhook('wh_1');
      expect(fake.post).toHaveBeenCalledWith('/api/v1/customer/webhooks/wh_1/test');
      expect(r.delivered).toBe(true);
    });

    test('getDeliveries → GET /api/v1/customer/webhooks/:id/deliveries', async () => {
      const client = new VirtualSMSClient('https://example.com', 'vsms_test');
      const fake = patchClientHttp(client);
      fake.get.mockResolvedValueOnce({ data: { deliveries: [{ id: 'd_1', status: 'delivered' }] } });
      const r = await client.getDeliveries('wh_1');
      expect(fake.get).toHaveBeenCalledWith('/api/v1/customer/webhooks/wh_1/deliveries');
      expect(r[0].id).toBe('d_1');
    });
  });

  describe('createOrderBatch', () => {
    test('fans out N parallel createOrder calls and returns aggregate', async () => {
      const client = new VirtualSMSClient('https://example.com', 'vsms_test');
      const fake = patchClientHttp(client);
      // 3 successes, then one failure on the 4th
      fake.post
        .mockResolvedValueOnce({ data: { order_id: 'o1', phone_number: '+44...', status: 'waiting' } })
        .mockResolvedValueOnce({ data: { order_id: 'o2', phone_number: '+44...', status: 'waiting' } })
        .mockResolvedValueOnce({ data: { order_id: 'o3', phone_number: '+44...', status: 'waiting' } });

      const batch = await client.createOrderBatch('telegram', 'GB', 3);
      expect(fake.post).toHaveBeenCalledTimes(3);
      expect(fake.post).toHaveBeenCalledWith('/api/v1/customer/purchase', { service: 'telegram', country: 'GB' });
      expect(batch.succeeded.length).toBe(3);
      expect(batch.failed.length).toBe(0);
    });

    test('aggregates failures into failed[] without throwing', async () => {
      const client = new VirtualSMSClient('https://example.com', 'vsms_test');
      const fake = patchClientHttp(client);
      fake.post
        .mockResolvedValueOnce({ data: { order_id: 'o1', phone_number: '+44...', status: 'waiting' } })
        .mockRejectedValueOnce(new Error('Insufficient balance'))
        .mockResolvedValueOnce({ data: { order_id: 'o3', phone_number: '+44...', status: 'waiting' } });

      const batch = await client.createOrderBatch('telegram', 'GB', 3);
      expect(batch.succeeded.length).toBe(2);
      expect(batch.failed.length).toBe(1);
      expect(batch.failed[0].index).toBe(1);
      expect(batch.failed[0].error).toMatch(/Insufficient balance/);
    });
  });
});
