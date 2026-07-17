/**
 * Per-handler unit tests for the order tools (create/cancel/swap/retry —
 * money-moving). Each handler gets: (a) schema validation rejects bad
 * input, (b) happy path succeeds against MockVirtualSMSClient (or a
 * minimal hand-built fake for the cooldown-gated ones), (c) an error
 * thrown by the client maps to a clean rejection — no crash, no leaked
 * stack trace baked into the propagated message.
 */
import { describe, expect, it } from 'vitest';
import type { IVirtualSMSClient, Order } from '../../client.js';
import { MockVirtualSMSClient } from '../../sandbox/mock-http.js';
import {
  CreateOrderInput,
  CancelOrderInput,
  RetryOrderInput,
  SwapNumberInput,
  handleBuyNumber,
  handleCancelOrder,
  handleRetryOrder,
  handleSwapNumber,
} from '../../tools.js';

function freshClient(): MockVirtualSMSClient {
  return new MockVirtualSMSClient('https://virtualsms.io');
}

describe('virtualsms_create_order (handleBuyNumber)', () => {
  it('rejects bad input (missing required fields)', () => {
    expect(CreateOrderInput.safeParse({}).success).toBe(false);
    expect(CreateOrderInput.safeParse({ service: 'telegram' }).success).toBe(false);
    expect(CreateOrderInput.safeParse({ country: 'US' }).success).toBe(false);
  });

  it('happy path: creates an order against the mock backend', async () => {
    const client = freshClient();
    const args = CreateOrderInput.parse({ service: 'telegram', country: 'US' });
    const result = await handleBuyNumber(client, args);
    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.order_id).toBeTruthy();
    expect(payload.status).toBeTruthy();
  });

  it('error path: a client failure propagates as a clean Error, not a crash', async () => {
    const failingClient: Partial<IVirtualSMSClient> = {
      createOrder: async () => {
        throw new Error('Insufficient balance. Top up at https://virtualsms.io');
      },
    };
    const args = CreateOrderInput.parse({ service: 'telegram', country: 'US' });
    await expect(handleBuyNumber(failingClient as IVirtualSMSClient, args)).rejects.toThrow(
      'Insufficient balance',
    );
  });
});

describe('virtualsms_retry_order (handleRetryOrder)', () => {
  it('rejects bad input (missing order_id)', () => {
    expect(RetryOrderInput.safeParse({}).success).toBe(false);
  });

  it('happy path: retries an existing order against the mock backend', async () => {
    const client = freshClient();
    const order = await client.createOrder('telegram', 'US');
    const result = await handleRetryOrder(client, RetryOrderInput.parse({ order_id: order.order_id }));
    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.success).toBe(true);
  });

  it('error path: unknown order_id maps to a clean Error, not a crash', async () => {
    const client = freshClient();
    await expect(
      handleRetryOrder(client, RetryOrderInput.parse({ order_id: 'does-not-exist' })),
    ).rejects.toThrow(/not found|does-not-exist/i);
  });
});

describe('virtualsms_cancel_order (handleCancelOrder) — money-moving, cooldown-gated', () => {
  it('rejects bad input (missing order_id)', () => {
    expect(CancelOrderInput.safeParse({}).success).toBe(false);
  });

  it('happy path: cancels an order once past the cooldown window (refund reflected)', async () => {
    // Minimal hand-built fake — the mock's real cooldown is wall-clock-based
    // (120s), so a fake with an already-past cancel_available_at exercises
    // the handler's success branch deterministically and fast.
    const order: Order = {
      order_id: 'ord-1',
      phone_number: '+15551234567',
      status: 'waiting',
      cancel_available_at: new Date(Date.now() - 1000).toISOString(),
    };
    const fakeClient: Partial<IVirtualSMSClient> = {
      getOrder: async () => order,
      cancelOrder: async () => ({ success: true, refunded: true }),
    };
    const result = await handleCancelOrder(
      fakeClient as IVirtualSMSClient,
      CancelOrderInput.parse({ order_id: 'ord-1' }),
    );
    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.success).toBe(true);
    expect(payload.refunded).toBe(true);
  });

  it('cooldown path: a too-fresh order returns a clean cooldown_active response, not an error throw', async () => {
    const client = freshClient();
    const order = await client.createOrder('telegram', 'US'); // cancel_available_at is ~120s out
    const result = await handleCancelOrder(client, CancelOrderInput.parse({ order_id: order.order_id }));
    // handleCancelOrder's inferred return type is a union of the "blocked"
    // (has isError) and normal jsonResult (no isError) shapes — cast to read it.
    expect((result as { isError?: boolean }).isError).toBe(true);
    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.error).toBe('cooldown_active');
  });

  it('error path: a client failure propagates as a clean Error, not a crash', async () => {
    // getOrder's failure is swallowed by handleCancelOrder's best-effort
    // cooldown pre-check (falls through to let the backend handle it) — the
    // real failure surfaces from cancelOrder() itself.
    const fakeClient: Partial<IVirtualSMSClient> = {
      getOrder: async () => {
        throw new Error('lookup failed');
      },
      cancelOrder: async () => {
        throw new Error('Not found: order does not exist');
      },
    };
    await expect(
      handleCancelOrder(fakeClient as IVirtualSMSClient, CancelOrderInput.parse({ order_id: 'nope' })),
    ).rejects.toThrow(/not found/i);
  });
});

describe('virtualsms_swap_number (handleSwapNumber) — cooldown-gated', () => {
  it('rejects bad input (missing order_id)', () => {
    expect(SwapNumberInput.safeParse({}).success).toBe(false);
  });

  it('happy path: swaps once past the cooldown window', async () => {
    const order: Order = {
      order_id: 'ord-2',
      phone_number: '+15551234567',
      status: 'waiting',
      swap_available_at: new Date(Date.now() - 1000).toISOString(),
    };
    const swappedOrder: Order = { ...order, phone_number: '+15559999999' };
    const fakeClient: Partial<IVirtualSMSClient> = {
      getOrder: async () => order,
      swapNumber: async () => swappedOrder,
    };
    const result = await handleSwapNumber(
      fakeClient as IVirtualSMSClient,
      SwapNumberInput.parse({ order_id: 'ord-2' }),
    );
    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.phone_number).toBe('+15559999999');
  });

  it('error path: a client failure propagates as a clean Error, not a crash', async () => {
    // Same fallback shape as cancel_order — getOrder's failure is swallowed,
    // swapNumber()'s failure is what actually surfaces.
    const fakeClient: Partial<IVirtualSMSClient> = {
      getOrder: async () => {
        throw new Error('lookup failed');
      },
      swapNumber: async () => {
        throw new Error('API error: backend unavailable');
      },
    };
    await expect(
      handleSwapNumber(fakeClient as IVirtualSMSClient, SwapNumberInput.parse({ order_id: 'ord-3' })),
    ).rejects.toThrow(/backend unavailable/i);
  });
});
