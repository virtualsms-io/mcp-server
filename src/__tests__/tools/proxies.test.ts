/**
 * Per-handler unit tests for the proxy purchase/rotation tools
 * (money-moving): buy_proxy and rotate_proxy.
 */
import { describe, expect, it } from 'vitest';
import type { IVirtualSMSClient } from '../../client.js';
import { MockVirtualSMSClient } from '../../sandbox/mock-http.js';
import {
  BuyProxyInput,
  RotateProxyInput,
  handleBuyProxy,
  handleRotateProxy,
} from '../../tools.js';

function freshClient(): MockVirtualSMSClient {
  return new MockVirtualSMSClient('https://virtualsms.io');
}

describe('virtualsms_buy_proxy (handleBuyProxy)', () => {
  it('rejects bad input: missing required fields', () => {
    expect(BuyProxyInput.safeParse({}).success).toBe(false);
    expect(BuyProxyInput.safeParse({ pool_type: 'datacenter' }).success).toBe(false); // missing gb
  });

  it('rejects bad input: invalid pool_type enum value', () => {
    const result = BuyProxyInput.safeParse({ pool_type: 'not-a-real-pool', gb: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects bad input: non-positive gb', () => {
    expect(BuyProxyInput.safeParse({ pool_type: 'datacenter', gb: 0 }).success).toBe(false);
    expect(BuyProxyInput.safeParse({ pool_type: 'datacenter', gb: -5 }).success).toBe(false);
  });

  it('happy path: purchases a proxy against the mock backend', async () => {
    const client = freshClient();
    const args = BuyProxyInput.parse({ pool_type: 'datacenter', gb: 2 });
    const result = await handleBuyProxy(client, args);
    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.proxy_id).toBeTruthy();
    expect(payload.gb_added).toBe(2);
    expect(payload.proxy_login).toBeTruthy();
  });

  it('error path: a client failure (e.g. insufficient balance) propagates as a clean Error', async () => {
    const failingClient: Partial<IVirtualSMSClient> = {
      purchaseProxy: async () => {
        throw new Error('Insufficient balance. Top up at https://virtualsms.io');
      },
    };
    const args = BuyProxyInput.parse({ pool_type: 'residential', gb: 5 });
    await expect(handleBuyProxy(failingClient as IVirtualSMSClient, args)).rejects.toThrow(
      'Insufficient balance',
    );
  });
});

describe('virtualsms_rotate_proxy (handleRotateProxy)', () => {
  it('rejects bad input: missing proxy_id', () => {
    expect(RotateProxyInput.safeParse({}).success).toBe(false);
  });

  it('rejects bad input: non-positive port', () => {
    expect(RotateProxyInput.safeParse({ proxy_id: 'p1', port: 0 }).success).toBe(false);
    expect(RotateProxyInput.safeParse({ proxy_id: 'p1', port: -1 }).success).toBe(false);
  });

  it('happy path: rotates an existing proxy against the mock backend', async () => {
    const client = freshClient();
    const bought = await client.purchaseProxy({ pool_type: 'datacenter', gb: 1 });
    const result = await handleRotateProxy(client, RotateProxyInput.parse({ proxy_id: bought.proxy_id }));
    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.rotated).toBe(true);
  });

  it('error path: unknown proxy_id maps to a clean Error, not a crash', async () => {
    const client = freshClient();
    await expect(
      handleRotateProxy(client, RotateProxyInput.parse({ proxy_id: 'does-not-exist' })),
    ).rejects.toThrow(/not found|does-not-exist/i);
  });
});
