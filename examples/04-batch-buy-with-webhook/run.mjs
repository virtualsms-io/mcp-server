#!/usr/bin/env node
/**
 * Example 04 — Batch Buy + Webhook (v1.3.0)
 *
 * Demonstrates the canonical v1.3.0 batch agentic pattern:
 *
 *   1. virtualsms_subscribe_webhook(events:["sms.received"]) once
 *      → server-pushed deliveries replace polling
 *   2. virtualsms_buy_batch(service, country, count: 3)
 *      → 3 numbers in one MCP call
 *   3. virtualsms_wait_for_sms_batch(order_ids[])
 *      → collect all 3 codes in parallel
 *   4. virtualsms_manage_webhooks(action:"deliveries", webhook_id)
 *      → audit the webhook deliveries
 *
 * For the webhook URL, point this at any HTTPS endpoint you control —
 * a quick `npx http-tunnel-cli` / `ngrok http 4000` works for testing.
 * Set WEBHOOK_URL env var. If unset the example skips the webhook
 * subscription and just runs the batch path.
 *
 * Requires:
 *   - Node.js 18+
 *   - npm install @modelcontextprotocol/sdk
 *   - VIRTUALSMS_API_KEY env var
 *   - Sufficient balance for `count × cheapest_price` (the buy_batch
 *     tool's budget guard refuses if > 80% of balance)
 *
 * Run:
 *   export VIRTUALSMS_API_KEY=vsms_your_api_key_here
 *   export WEBHOOK_URL=https://your-tunnel.example.com/hook
 *   export SERVICE=telegram
 *   export COUNTRY=GB
 *   export COUNT=3
 *   node run.mjs
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const API_KEY = process.env.VIRTUALSMS_API_KEY;
if (!API_KEY || !API_KEY.startsWith('vsms_')) {
  console.error('ERROR: set VIRTUALSMS_API_KEY (vsms_...) before running.');
  console.error('       Get one at https://virtualsms.io');
  process.exit(1);
}

const HOSTED_URL = process.env.MCP_URL || 'https://mcp.virtualsms.io/mcp';
const WEBHOOK_URL = process.env.WEBHOOK_URL; // optional
const SERVICE = process.env.SERVICE || 'telegram';
const COUNTRY = process.env.COUNTRY || 'GB';
const COUNT = parseInt(process.env.COUNT || '3', 10);

function callJSON(client, name, args = {}) {
  return client.callTool({ name, arguments: args }).then((result) => {
    const text = result?.content?.[0]?.text ?? JSON.stringify(result);
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  });
}

async function main() {
  console.log(`Connecting to ${HOSTED_URL} ...`);
  const transport = new StreamableHTTPClientTransport(new URL(HOSTED_URL), {
    requestInit: { headers: { 'x-api-key': API_KEY } },
  });
  const client = new Client(
    { name: 'virtualsms-example-04', version: '1.0.0' },
    { capabilities: {} }
  );
  await client.connect(transport);

  // ─── 1. Subscribe a webhook (optional) ─────────────────────────────────
  let webhookId;
  if (WEBHOOK_URL) {
    console.log(`\n[1/4] Subscribing webhook → ${WEBHOOK_URL}`);
    const sub = await callJSON(client, 'virtualsms_subscribe_webhook', {
      url: WEBHOOK_URL,
      events: ['sms.received'],
      description: 'example-04 batch buy + webhook',
    });
    if (sub.error) {
      console.error('  Subscribe failed:', sub);
      process.exit(1);
    }
    webhookId = sub.webhook_id;
    console.log(`  ✓ webhook_id=${webhookId}, secret=${(sub.secret || '').slice(0, 12)}...`);
    console.log(`    Verify deliveries with HMAC-SHA256(body) using the full secret.`);
  } else {
    console.log('\n[1/4] WEBHOOK_URL not set — skipping subscription.');
  }

  // ─── 2. Batch-buy ──────────────────────────────────────────────────────
  console.log(`\n[2/4] Buying ${COUNT} × ${SERVICE} (${COUNTRY}) in one batch ...`);
  const batch = await callJSON(client, 'virtualsms_buy_batch', {
    service: SERVICE,
    country: COUNTRY,
    count: COUNT,
  });
  if (batch.error === 'budget_guard') {
    console.error('  ✗ Budget guard refused the batch:', batch.message);
    console.error('    Reduce COUNT, top up, or pick a cheaper country.');
    if (webhookId) await callJSON(client, 'virtualsms_manage_webhooks', { action: 'delete', webhook_id: webhookId });
    process.exit(1);
  }
  console.log(`  ✓ Bought ${batch.succeeded?.length ?? 0}/${COUNT}, charged $${batch.total_charged_usd}`);
  for (const o of batch.succeeded || []) {
    console.log(`    - ${o.order_id} → ${o.phone_number}`);
  }
  for (const f of batch.failed || []) {
    console.log(`    - FAILED idx=${f.index}: ${f.error}`);
  }

  const orderIds = (batch.succeeded || []).map((o) => o.order_id);
  if (orderIds.length === 0) {
    console.log('No orders placed — exiting.');
    if (webhookId) await callJSON(client, 'virtualsms_manage_webhooks', { action: 'delete', webhook_id: webhookId });
    await client.close();
    return;
  }

  // ─── 3. Batch-wait for SMS ─────────────────────────────────────────────
  console.log(`\n[3/4] Waiting for SMS on ${orderIds.length} orders (timeout 120s) ...`);
  const waitResult = await callJSON(client, 'virtualsms_wait_for_sms_batch', {
    order_ids: orderIds,
    timeout_seconds: 120,
    return_partial: true,
  });
  console.log(`  ✓ Received ${waitResult.received?.length ?? 0}, timed_out ${waitResult.timed_out?.length ?? 0}, errors ${waitResult.errors?.length ?? 0}`);
  for (const r of waitResult.received || []) {
    console.log(`    - ${r.order_id}: code=${r.code} (${r.delivery_method}, ${r.elapsed_ms}ms)`);
  }

  // ─── 4. Audit webhook deliveries ───────────────────────────────────────
  if (webhookId) {
    console.log(`\n[4/4] Listing webhook deliveries for ${webhookId} ...`);
    const dl = await callJSON(client, 'virtualsms_manage_webhooks', {
      action: 'deliveries',
      webhook_id: webhookId,
    });
    console.log(`  ✓ ${dl.count ?? 0} deliveries logged.`);
    for (const d of (dl.deliveries || []).slice(0, 5)) {
      console.log(`    - ${d.id} status=${d.status} response_code=${d.response_code}`);
    }

    // Cleanup — remove the webhook so the example doesn't leak subscriptions.
    await callJSON(client, 'virtualsms_manage_webhooks', { action: 'delete', webhook_id: webhookId });
    console.log(`    (webhook cleaned up)`);
  } else {
    console.log('\n[4/4] (skipping deliveries audit — no webhook)');
  }

  await client.close();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Failed:', err?.message ?? err);
  process.exit(1);
});
