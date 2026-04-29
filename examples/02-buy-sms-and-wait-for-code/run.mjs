#!/usr/bin/env node
/**
 * Example 02 — Buy SMS Number and Wait for Code (end-to-end)
 *
 * Demonstrates the canonical agentic flow:
 *   1. find_cheapest — pick the cheapest country for the service
 *   2. wait_for_code — buy a number AND block on the WebSocket for the SMS
 *   3. cancel_order — clean up if the SMS never lands
 *
 * Requires:
 *   - Node.js 18+
 *   - npm install @modelcontextprotocol/sdk
 *   - VIRTUALSMS_API_KEY env var
 *
 * Run:
 *   export VIRTUALSMS_API_KEY=vsms_your_api_key_here
 *   node run.mjs
 *
 * Optional env:
 *   SERVICE=whatsapp COUNTRY=PK TIMEOUT=180
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const API_KEY = process.env.VIRTUALSMS_API_KEY;
if (!API_KEY || !API_KEY.startsWith('vsms_')) {
  console.error('ERROR: set VIRTUALSMS_API_KEY (vsms_...) before running.');
  console.error('       Get one at https://virtualsms.io');
  process.exit(1);
}

const SERVICE = process.env.SERVICE || 'telegram';
const COUNTRY_OVERRIDE = process.env.COUNTRY || null;
const TIMEOUT = Number(process.env.TIMEOUT || 180);
const HOSTED_URL = 'https://mcp.virtualsms.io/mcp';

function unwrap(result) {
  const text = result?.content?.[0]?.text ?? JSON.stringify(result);
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function main() {
  console.log(`Connecting to ${HOSTED_URL} ...`);

  const transport = new StreamableHTTPClientTransport(new URL(HOSTED_URL), {
    requestInit: {
      headers: { 'x-api-key': API_KEY },
    },
  });

  const client = new Client(
    { name: 'virtualsms-example-02', version: '1.0.0' },
    { capabilities: {} },
  );
  await client.connect(transport);

  // Step 1 — find cheapest country for the service (unless one was forced via env).
  let country = COUNTRY_OVERRIDE;
  if (!country) {
    console.log(`Step 1 — find_cheapest(service: ${SERVICE}) ...`);
    const cheapestRaw = await client.callTool({
      name: 'virtualsms_find_cheapest',
      arguments: { service: SERVICE, limit: 5 },
    });
    const cheapest = unwrap(cheapestRaw);
    const top = cheapest?.cheapest_options?.[0];
    if (!top) {
      console.error('No stock anywhere for this service. Try another service.');
      console.error('Result:', cheapest);
      await client.close();
      process.exit(2);
    }
    country = top.country;
    console.log(`  Cheapest country: ${country} at $${top.price_usd}`);
  } else {
    console.log(`Step 1 — using forced COUNTRY=${country}`);
  }

  // Step 2 — buy a number and wait for the SMS code.
  console.log(`Step 2 — wait_for_code(service: ${SERVICE}, country: ${country}, timeout: ${TIMEOUT}s) ...`);
  const waitRaw = await client.callTool({
    name: 'virtualsms_wait_for_code',
    arguments: { service: SERVICE, country, timeout_seconds: TIMEOUT },
  });
  const waitResult = unwrap(waitRaw);

  if (waitResult.success) {
    console.log(`  Bought number: ${waitResult.phone_number}`);
    console.log(`  SMS arrived (${waitResult.delivery_method}, ${waitResult.elapsed_seconds}s):`);
    console.log(`    code: ${waitResult.sms_code}`);
    console.log(`    text: ${waitResult.sms_text}`);
  } else {
    console.log(`  No SMS within ${TIMEOUT}s. order_id: ${waitResult.order_id}`);
    if (waitResult.order_id) {
      // Step 3 — recover budget on timeout.
      console.log(`Step 3 — cancel_order(${waitResult.order_id}) ...`);
      const cancelRaw = await client.callTool({
        name: 'virtualsms_cancel_order',
        arguments: { order_id: waitResult.order_id },
      });
      const cancelResult = unwrap(cancelRaw);
      console.log(`  Cancelled. Refunded: ${cancelResult.refunded}`);
    }
  }

  await client.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Failed:', err?.message ?? err);
  process.exit(1);
});
