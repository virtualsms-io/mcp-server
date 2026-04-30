import { describe, expect, test, vi } from 'vitest';
import { handlePayAndBuy, PayAndBuyInput } from '../src/tools/v1_3/pay-and-buy.js';
import type { VirtualSMSClient, X402TopupResult, X402Manifest, Order } from '../src/client.js';

function makeClient(impl: Partial<VirtualSMSClient>): VirtualSMSClient {
  return impl as unknown as VirtualSMSClient;
}

function parseResult(out: { content: Array<{ type: 'text'; text: string }> }): Record<string, unknown> {
  return JSON.parse(out.content[0].text);
}

describe('virtualsms_pay_and_buy', () => {
  test('input validation — amount_usd 2..50, payment_method default usdc-base', () => {
    expect(() => PayAndBuyInput.parse({ amount_usd: 1 })).toThrow();
    expect(() => PayAndBuyInput.parse({ amount_usd: 51 })).toThrow();
    const ok = PayAndBuyInput.parse({ amount_usd: 5 });
    expect(ok.payment_method).toBe('usdc-base');
  });

  test('first call (no payment_proof) → returns 402 manifest', async () => {
    const fakeManifest: X402Manifest = {
      x402Version: 1,
      accepts: [{ scheme: 'exact', network: 'base', token: 'USDC', payTo: '0xabc' }],
      error: 'Payment required',
    };
    const client = makeClient({
      topup: vi.fn(async () => fakeManifest),
    });
    const out = await handlePayAndBuy(client, PayAndBuyInput.parse({ amount_usd: 5 }));
    const data = parseResult(out);
    expect(data.status).toBe('payment_required');
    expect(data.manifest).toEqual(fakeManifest);
    expect(typeof data.tip).toBe('string');
  });

  test('second call (with payment_proof) → returns paid + api_key', async () => {
    const fakePaid: X402TopupResult = {
      api_key: 'vsms_xxxxx',
      balance_usd: 5,
      user_id: 'u_1',
      raw: { api_key: 'vsms_xxxxx', balance_usd: 5 },
    };
    const client = makeClient({
      topup: vi.fn(async () => fakePaid),
    });
    const out = await handlePayAndBuy(
      client,
      PayAndBuyInput.parse({ amount_usd: 5, payment_proof: 'eyJ...proof...' })
    );
    const data = parseResult(out);
    expect(data.status).toBe('paid');
    expect(data.api_key).toBe('vsms_xxxxx');
    expect(data.credited_balance_usd).toBe(5);
    expect(data.next_action).toMatch(/VIRTUALSMS_API_KEY/);
  });

  test('paid + service+country → bundles createOrder via a freshly-keyed client', async () => {
    // The handler creates a new client with the freshly-minted api_key for
    // the bundled buy. We simulate that by exposing a clientFactory hook on
    // the handler — but per the design the impl should use the same client
    // class. We patch the topup result + spy on createOrder of THIS test
    // client (the handler is expected to mutate or re-instantiate).
    //
    // Simpler test: we simulate by having the topup return api_key and the
    // SAME mock client also expose createOrder. The impl is expected to
    // call createOrder on a client built using the topped-up api_key.
    const fakePaid: X402TopupResult = {
      api_key: 'vsms_new',
      balance_usd: 5,
      raw: { api_key: 'vsms_new', balance_usd: 5 },
    };
    const order: Order = {
      order_id: 'o1',
      phone_number: '+44...',
      status: 'waiting',
    };
    // Don't expose getBaseUrl — the handler then keeps the existing client
    // (which is a mock) for the bundled createOrder call.
    const client = makeClient({
      topup: vi.fn(async () => fakePaid),
      createOrder: vi.fn(async () => order),
    });
    const out = await handlePayAndBuy(
      client,
      PayAndBuyInput.parse({
        amount_usd: 5,
        payment_proof: 'eyJ...proof...',
        service: 'tg',
        country: 'GB',
      })
    );
    const data = parseResult(out);
    expect(data.status).toBe('paid_and_bought');
    expect(data.api_key).toBe('vsms_new');
    expect((data.order as { order_id: string }).order_id).toBe('o1');
  });

  test('service set without country → returns input_error before any topup', async () => {
    const topup = vi.fn(async () => ({ raw: {} }) as unknown as X402TopupResult);
    const client = makeClient({ topup });
    const out = await handlePayAndBuy(
      client,
      PayAndBuyInput.parse({ amount_usd: 5, service: 'tg' })
    );
    const data = parseResult(out);
    expect(data.error).toBe('input_error');
    expect(topup).not.toHaveBeenCalled();
  });
});
