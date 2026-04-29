# Example 2 — Buy SMS Number and Wait for Code (end-to-end)

A full SMS-verification flow demonstrating the agentic happy path:

1. **Discover** — call `virtualsms_find_cheapest` to pick the cheapest country for a service (default: Telegram).
2. **Purchase + wait** — call `virtualsms_wait_for_code` with the chosen service and country. This buys a number AND blocks on the WebSocket waiting for the SMS to land. Typical delivery: **2–15 seconds**.
3. **Recover on timeout** — if no SMS arrives within `timeout_seconds`, the call returns `{ success: false, order_id }`. The script then calls `virtualsms_cancel_order` to free the budget.

This is the canonical pattern an AI agent should use end-to-end.

## Run it

```bash
export VIRTUALSMS_API_KEY=vsms_your_api_key_here
node run.mjs
```

Optional: pick a different service/country pair.

```bash
SERVICE=whatsapp COUNTRY=PK node run.mjs
SERVICE=discord  TIMEOUT=120 node run.mjs
```

## Expected output (happy path)

```
Connecting to https://mcp.virtualsms.io/mcp ...
Step 1 — find_cheapest(service: telegram) ...
  Cheapest country: PK at $0.05
Step 2 — wait_for_code(service: telegram, country: PK, timeout: 180s) ...
  Bought number: +923XXXXXXXXX
  Waiting for SMS via WebSocket...
  SMS arrived (websocket, 8s):
    code: 12345
    text: Your Telegram code: 12345
Done.
```

## Expected output (timeout path)

```
Step 2 — wait_for_code(...) ...
  No SMS within 180s. order_id: abc123
Step 3 — cancel_order(abc123) ...
  Cancelled. Refunded: true
```

## What to tweak

- `SERVICE` — any service code (`telegram`, `whatsapp`, `discord`, `google`, ...). Use `virtualsms_search_service` to find the right code.
- `COUNTRY` — any ISO-2 country code with stock for the chosen service. Use `virtualsms_find_cheapest` (which the script does automatically) or `virtualsms_check_price` to verify availability.
- `TIMEOUT` — seconds to wait for the SMS. Default 180s. WebSocket pushes typically arrive in 2–15s; longer values protect against network hiccups.

## Cost note

The cheapest Telegram numbers run **$0.02–$0.10** per attempt depending on the country. If the SMS doesn't arrive, `cancel_order` refunds the full cost (provided you waited the 2-minute minimum, which `wait_for_code` enforces internally).
