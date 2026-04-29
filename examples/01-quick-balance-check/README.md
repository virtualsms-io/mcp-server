# Example 1 — Quick Balance Check (hosted MCP, ~5 seconds)

The smallest possible end-to-end demo of the VirtualSMS MCP server. It:

1. Connects to the **hosted** MCP endpoint at `https://mcp.virtualsms.io/mcp` via StreamableHTTP.
2. Calls the `virtualsms_get_balance` tool.
3. Prints your account balance.

No local install of the `virtualsms-mcp` package is required — the server is fully hosted.

## Run it

```bash
export VIRTUALSMS_API_KEY=vsms_your_api_key_here
node run.mjs
```

## Expected output

```
Connecting to https://mcp.virtualsms.io/mcp ...
Calling virtualsms_get_balance ...
Balance: $5.00 USD
Done.
```

## What to tweak

- Swap `virtualsms_get_balance` for `virtualsms_list_services` to dump all 2500+ services as JSON.
- Swap for `virtualsms_get_profile` to see your full account profile (email, Telegram link, lifetime spend).
- Swap for `virtualsms_get_stats` to see usage over the last 30 days.

For a more interesting flow (buy a number + wait for an SMS code), see [`../02-buy-sms-and-wait-for-code/`](../02-buy-sms-and-wait-for-code/).
