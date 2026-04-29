#!/usr/bin/env node
/**
 * Example 01 — Quick Balance Check
 *
 * Connects to the hosted VirtualSMS MCP server at https://mcp.virtualsms.io/mcp
 * via StreamableHTTP transport, calls the virtualsms_get_balance tool, and
 * prints the balance.
 *
 * Requires:
 *   - Node.js 18+
 *   - npm install @modelcontextprotocol/sdk
 *   - VIRTUALSMS_API_KEY env var
 *
 * Run:
 *   export VIRTUALSMS_API_KEY=vsms_your_api_key_here
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

const HOSTED_URL = 'https://mcp.virtualsms.io/mcp';

async function main() {
  console.log(`Connecting to ${HOSTED_URL} ...`);

  const transport = new StreamableHTTPClientTransport(new URL(HOSTED_URL), {
    requestInit: {
      headers: {
        'x-api-key': API_KEY,
      },
    },
  });

  const client = new Client(
    { name: 'virtualsms-example-01', version: '1.0.0' },
    { capabilities: {} },
  );

  await client.connect(transport);

  console.log('Calling virtualsms_get_balance ...');
  const result = await client.callTool({
    name: 'virtualsms_get_balance',
    arguments: {},
  });

  // The MCP SDK wraps tool results in a content array. Tools return JSON text.
  const text = result?.content?.[0]?.text ?? JSON.stringify(result);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }

  if (typeof parsed.balance_usd === 'number') {
    console.log(`Balance: $${parsed.balance_usd.toFixed(2)} USD`);
  } else {
    console.log('Result:', parsed);
  }

  await client.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Failed:', err?.message ?? err);
  process.exit(1);
});
