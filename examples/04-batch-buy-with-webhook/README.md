# Example 04 — Batch Buy + Webhook (v1.3.0)

The canonical v1.3.0 batch agentic pattern, end-to-end:

1. **`virtualsms_subscribe_webhook`** — register an HTTPS callback for `sms.received` events. Server-pushed deliveries replace polling.
2. **`virtualsms_buy_batch`** — buy N numbers (default 3) in one MCP call.
3. **`virtualsms_wait_for_sms_batch`** — collect the codes for all N orders in parallel.
4. **`virtualsms_manage_webhooks`** — audit deliveries, then clean up.

## Prerequisites

- Node.js 18+
- An HTTPS callback URL you control (any tunnel works — `ngrok http 4000`, `cloudflared tunnel`, etc.). Optional — the example degrades gracefully if `WEBHOOK_URL` is unset.
- A VirtualSMS API key with **enough balance** for the batch. The `buy_batch` tool's budget guard refuses if `count × cheapest_price > balance × 0.8`.

## Install + run

```bash
npm install @modelcontextprotocol/sdk

export VIRTUALSMS_API_KEY=vsms_your_api_key_here
# optional — point at any HTTPS endpoint you control
export WEBHOOK_URL=https://your-tunnel.example.com/hook
# optional — defaults: SERVICE=telegram COUNTRY=GB COUNT=3
export SERVICE=telegram
export COUNTRY=GB
export COUNT=3

node run.mjs
```

## Expected output

```
Connecting to https://mcp.virtualsms.io/mcp ...

[1/4] Subscribing webhook → https://your-tunnel.example.com/hook
  ✓ webhook_id=01H..., secret=whsec_xxxxx...
    Verify deliveries with HMAC-SHA256(body) using the full secret.

[2/4] Buying 3 × telegram (GB) in one batch ...
  ✓ Bought 3/3, charged $0.42
    - ord_aaa → +447xxxxxxxxx
    - ord_bbb → +447xxxxxxxxx
    - ord_ccc → +447xxxxxxxxx

[3/4] Waiting for SMS on 3 orders (timeout 120s) ...
  ✓ Received 3, timed_out 0, errors 0
    - ord_aaa: code=123456 (websocket, 4521ms)
    - ord_bbb: code=789012 (websocket, 6033ms)
    - ord_ccc: code=345678 (polling, 12054ms)

[4/4] Listing webhook deliveries for 01H... ...
  ✓ 3 deliveries logged.
    - dly_xxx status=delivered response_code=200
    - dly_yyy status=delivered response_code=200
    - dly_zzz status=delivered response_code=200
    (webhook cleaned up)

Done.
```

## What this demonstrates

| New v1.3.0 tool | Why it matters |
|---|---|
| `subscribe_webhook` | One MCP call subscribes the agent to push deliveries — no polling tax for any future SMS on this api_key. |
| `buy_batch` | 3 sequential `create_order` calls collapse into one MCP round-trip. Budget guard refuses overspend. |
| `wait_for_sms_batch` | 3 separate `wait_for_sms` calls collapse into one. WebSocket race + polling fallback per order, shared deadline. |
| `manage_webhooks(action:"deliveries")` | Audit + verify webhook health from the same MCP session that created it. |

## HMAC verification on your endpoint

Each webhook delivery is signed with HMAC-SHA256 of the **raw body** using the `secret` you got back from `subscribe_webhook`. Pseudocode for any HTTPS receiver:

```js
const expected = crypto
  .createHmac('sha256', process.env.WEBHOOK_SECRET)
  .update(rawBody)
  .digest('hex');
const provided = req.headers['x-virtualsms-signature'];
const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
```

See [docs.virtualsms.io/webhooks](https://docs.virtualsms.io/webhooks) for the canonical signing recipe.
