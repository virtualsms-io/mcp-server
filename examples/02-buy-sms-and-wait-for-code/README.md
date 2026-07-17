# Example 2: Buy SMS Number and Wait for Code (end-to-end)

A full SMS-verification flow demonstrating the happy path for AI agents:

1. **Discover:** call `virtualsms_find_cheapest` to pick the cheapest country for a service (default: Telegram).
2. **Purchase:** call `virtualsms_create_order` with the chosen service and country. Returns an `order_id` and the `phone_number`.
3. **Wait:** call `virtualsms_wait_for_sms` with that `order_id`. It blocks on the WebSocket until the SMS lands. Typical delivery: **2 to 15 seconds**.
4. **Recover on timeout:** if no SMS arrives within `timeout_seconds`, the call returns `{ success: false, order_id }`. The script then calls `virtualsms_cancel_order` to free the budget.

This is the canonical pattern an AI agent should use end-to-end.

> `wait_for_sms` takes an `order_id`, not a service and country. Buying and waiting are two separate calls: `create_order` then `wait_for_sms`.

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
Step 1 - find_cheapest(service: telegram) ...
  Cheapest country: PK at $0.05
Step 2 - create_order(service: telegram, country: PK) ...
  Bought number: +923XXXXXXXXX (order abc123)
Step 3 - wait_for_sms(order_id: abc123, timeout: 180s) ...
  SMS arrived (websocket, 8s):
    code: 12345
    text: Your Telegram code: 12345
Done.
```

## Expected output (timeout path)

```
Step 3 - wait_for_sms(order_id: abc123, timeout: 180s) ...
  No SMS within 180s. order_id: abc123
Step 4 - cancel_order(abc123) ...
  Cancelled. Refunded: true
```

## What to tweak

- `SERVICE`: any service code (`telegram`, `whatsapp`, `discord`, `google`, ...). Use `virtualsms_search_services` to find the right code.
- `COUNTRY`: any ISO-2 country code with stock for the chosen service. Use `virtualsms_find_cheapest` (which the script does automatically) or `virtualsms_get_price` to verify availability.
- `TIMEOUT`: seconds to wait for the SMS. Default 180s. WebSocket pushes typically arrive in 2 to 15s; longer values protect against network hiccups.

## Cost note

The cheapest Telegram numbers start around **$0.05** per attempt depending on the country. If the SMS doesn't arrive, `cancel_order` refunds the full cost. Cancel is only available 120 seconds after purchase, so a timeout shorter than that will leave you waiting on the cooldown before you can refund.
