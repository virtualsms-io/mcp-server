/**
 * End-to-end sandbox integration test — drives real MCP `tools/list` +
 * `tools/call` JSON-RPC traffic against an in-process server wired to
 * MockVirtualSMSClient (VIRTUALSMS_SANDBOX=1), over the SDK's InMemoryTransport
 * pair and a real MCP Client. No real network calls, no real API key, no
 * real money moved — every tool is exercised end-to-end against the mock.
 *
 * Uses http-server.ts's exported createMCPServer() (its `.listen()` is
 * guarded behind an isMainModule check — see http-server.ts — so importing
 * it here never binds a real port). Both transports are proven identical by
 * transport-parity.test.ts, so exercising this one dispatch table covers
 * both.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { TOOL_DEFINITIONS } from '../tools.js';

// These two flags are read once at http-server.ts module load — set BEFORE
// the dynamic import below so sandbox mode is active and every tool
// (including the VIRTUALSMS_ENABLE_SESSIONS-gated browser-session tools) is
// registered for this test run.
process.env.VIRTUALSMS_SANDBOX = '1';
process.env.VIRTUALSMS_ENABLE_SESSIONS = '1';

let client: Client;

beforeAll(async () => {
  const { createMCPServer } = await import('../http-server.js');
  const server = createMCPServer({
    apiKey: undefined,
    baseUrl: 'https://virtualsms.io',
    defaultCountry: 'US',
    timeout: 30,
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'sandbox-integration-test-client', version: '0.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
});

afterAll(async () => {
  await client?.close();
});

/** Calls a tool and asserts it did NOT come back as an MCP tool-call error. */
async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError, `${name} returned isError:true — content: ${JSON.stringify(result.content)}`).not.toBe(true);
  return result;
}

function structured(result: Awaited<ReturnType<typeof call>>): Record<string, unknown> {
  return (result.structuredContent ?? {}) as Record<string, unknown>;
}

describe('sandbox integration — every registered tool, driven via real tools/list + tools/call', () => {
  it('tools/list returns exactly the TOOL_DEFINITIONS set (sessions enabled)', async () => {
    const { tools } = await client.listTools();
    const listedNames = new Set(tools.map((t) => t.name));
    const definedNames = new Set(TOOL_DEFINITIONS.map((t) => t.name));
    expect(listedNames).toEqual(definedNames);
    // Sanity floor so a future accidental filter-everything-out regression fails loudly.
    expect(listedNames.size).toBeGreaterThan(35);
  });

  it('discovery + account tools (read-only, no created state required)', async () => {
    await call('virtualsms_list_services');
    await call('virtualsms_list_countries');
    await call('virtualsms_get_price', { service: 'telegram', country: 'US' });
    await call('virtualsms_get_balance');
    await call('virtualsms_get_profile');
    await call('virtualsms_get_transactions');
    await call('virtualsms_get_stats');
    await call('virtualsms_find_cheapest', { service: 'telegram' });
    await call('virtualsms_search_services', { query: 'tele' });
    await call('virtualsms_check_number', { number: '+447911123456' });
  });

  it(
    'order lifecycle: create → get_sms → wait_for_sms → retry → cooldown-gated swap/cancel → cancel_all',
    async () => {
      const created = await call('virtualsms_create_order', { service: 'telegram', country: 'US' });
      const orderId = structured(created).order_id as string;
      expect(orderId).toBeTruthy();

      await call('virtualsms_get_order', { order_id: orderId });
      await call('virtualsms_list_orders');
      await call('virtualsms_order_history');

      // The mock delivers its fake SMS ~3s after order creation — wait for it
      // so get_sms / wait_for_sms exercise the "code arrived" path for real.
      await new Promise((resolve) => setTimeout(resolve, 3300));

      const sms = await call('virtualsms_get_sms', { order_id: orderId });
      expect(structured(sms).code).toBeTruthy();

      const waited = await call('virtualsms_wait_for_sms', { order_id: orderId, timeout_seconds: 5 });
      expect(structured(waited).success).toBe(true);

      // retry_order has no cooldown gate — should succeed outright.
      await call('virtualsms_retry_order', { order_id: orderId });

      // swap_number / cancel_order both enforce a 2-minute post-purchase
      // cooldown (mirrors the real backend) — this order is only ~3s old,
      // so both correctly come back as a business-rule tool-call error
      // rather than a crash. Assert that shape explicitly instead of
      // waiting 2 real minutes in a test.
      const swapAttempt = await client.callTool({ name: 'virtualsms_swap_number', arguments: { order_id: orderId } });
      expect(swapAttempt.isError).toBe(true);
      expect(structured(swapAttempt).error).toBe('cooldown_active');

      const cancelAttempt = await client.callTool({ name: 'virtualsms_cancel_order', arguments: { order_id: orderId } });
      expect(cancelAttempt.isError).toBe(true);
      expect(structured(cancelAttempt).error).toBe('cooldown_active');

      // cancel_all_orders bulk-cancels via the raw client method, which does
      // not enforce the per-order cooldown gate — it should still succeed.
      const cancelledAll = await call('virtualsms_cancel_all_orders');
      expect(structured(cancelledAll).cancelled).toBeGreaterThanOrEqual(1);
    },
    10_000,
  );

  it('proxy lifecycle: catalog → buy → manage → generate endpoint (all 9 proxy tools)', async () => {
    await call('virtualsms_list_proxy_catalog');
    await call('virtualsms_list_proxies');

    const bought = await call('virtualsms_buy_proxy', { pool_type: 'datacenter', gb: 1 });
    const proxyId = structured(bought).proxy_id as string;
    expect(proxyId).toBeTruthy();

    await call('virtualsms_list_proxy_locations', { pool_type: 'datacenter', country: 'US', kind: 'cities' });
    await call('virtualsms_rotate_proxy', { proxy_id: proxyId });
    await call('virtualsms_get_proxy_usage', { proxy_id: proxyId });
    await call('virtualsms_get_proxy_usage_history', { proxy_id: proxyId });
    await call('virtualsms_set_proxy_targeting', { proxy_id: proxyId, country_code: 'US' });
    await call('virtualsms_test_proxy', { proxy_id: proxyId, country: 'US' });
    await call('virtualsms_generate_proxy_endpoint', { proxy_id: proxyId, country_code: 'US' });
  });

  it('rental lifecycle: pricing/availability + create/extend/cancel + create/release', async () => {
    await call('virtualsms_rentals_pricing');
    await call('virtualsms_rentals_available');
    await call('virtualsms_rentals_services', { country_code: 'US' });
    await call('virtualsms_rentals_price', { service: 'telegram', country_code: 'US', duration_hours: 24 });

    const created1 = await call('virtualsms_create_rental', { tier: 'full_access', country: 'US', duration_hours: 24 });
    const rentalIdA = structured(created1).rental_id as string;
    expect(rentalIdA).toBeTruthy();

    await call('virtualsms_list_rentals');
    await call('virtualsms_get_rental', { rental_id: rentalIdA });
    await call('virtualsms_extend_rental', { rental_id: rentalIdA, duration_hours: 24 });
    await call('virtualsms_cancel_rental', { rental_id: rentalIdA });

    const created2 = await call('virtualsms_create_rental', { tier: 'full_access', country: 'US', duration_hours: 24 });
    const rentalIdB = structured(created2).rental_id as string;
    expect(rentalIdB).toBeTruthy();

    await call('virtualsms_release_rental', { rental_id: rentalIdB });
  });

  it('browser session lifecycle (gated tools — enabled via VIRTUALSMS_ENABLE_SESSIONS)', async () => {
    const started = await call('virtualsms_start_manual_registration_session', { service_name: 'telegram' });
    const session = structured(started).session as { id: string };
    expect(session?.id).toBeTruthy();

    await call('virtualsms_navigate_session', { session_id: session.id, url: 'https://example.com' });
    await call('virtualsms_session_viewer', { session_id: session.id });
    await call('virtualsms_stop_session', { session_id: session.id });
  });
});
