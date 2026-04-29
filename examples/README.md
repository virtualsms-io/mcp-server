# Examples

Three runnable, copy-pasteable examples for the VirtualSMS MCP server. Pick the one that matches what you want to do:

| # | Example | What it demonstrates |
|---|---------|---|
| 1 | [`01-quick-balance-check/`](./01-quick-balance-check/) | Connect to the **hosted** MCP endpoint via StreamableHTTP and call `get_balance`. ~5 lines, ~5 seconds. |
| 2 | [`02-buy-sms-and-wait-for-code/`](./02-buy-sms-and-wait-for-code/) | End-to-end SMS verification: `find_cheapest` → `buy_number` → `wait_for_code` → cancel-on-timeout. |
| 3 | [`03-claude-desktop-config/`](./03-claude-desktop-config/) | Copy-paste configuration for Claude Desktop, plus a walkthrough of "ask Claude what's my balance". |

## Prerequisites

For examples 1 and 2:

- Node.js 18+
- A VirtualSMS API key — get one at [virtualsms.io](https://virtualsms.io). Set it as an environment variable:

  ```bash
  export VIRTUALSMS_API_KEY=vsms_your_api_key_here
  ```

- Install the MCP SDK once at the repo root:

  ```bash
  npm install @modelcontextprotocol/sdk
  ```

For example 3, you only need a working install of [Claude Desktop](https://www.anthropic.com/claude) — no Node.js required on the agent host once you point Claude at the hosted endpoint.

## Running the examples

```bash
cd examples/01-quick-balance-check
node run.mjs

cd ../02-buy-sms-and-wait-for-code
node run.mjs
```

Each example's `README.md` walks through the expected output and what to tweak.
