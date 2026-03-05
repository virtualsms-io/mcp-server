# VirtualSMS MCP Server — SMS Verification for AI Agents

[![npm version](https://img.shields.io/npm/v/virtualsms-mcp.svg)](https://www.npmjs.com/package/virtualsms-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/virtualsms-io/mcp-server?style=social)](https://github.com/virtualsms-io/mcp-server)

**VirtualSMS MCP Server** is a [Model Context Protocol](https://modelcontextprotocol.io) server that gives AI agents access to a complete SMS verification API. Get a virtual phone number, receive SMS online, and extract verification codes — all without leaving your AI workflow.

Powered by [VirtualSMS.io](https://virtualsms.io) — a phone verification service running on own infrastructure across 200+ countries.

---

## Quick Start

```bash
npx virtualsms-mcp
```

Or install globally:

```bash
npm install -g virtualsms-mcp
```

Get your API key at [virtualsms.io](https://virtualsms.io).

---

## What is VirtualSMS?

[VirtualSMS.io](https://virtualsms.io) is a **temporary phone number API** for SMS verification. Unlike resellers that aggregate other providers, VirtualSMS operates its own modem infrastructure — giving you direct access to real SIM cards across 200+ countries.

Use it to verify accounts on WhatsApp, Telegram, Google, Instagram, and 500+ other services — programmatically, via API or MCP.

---

## Why VirtualSMS?

- **Own infrastructure** — Not a reseller. Real SIM cards on our own hardware.
- **200+ countries** — Find the cheapest number for any service worldwide.
- **Real-time delivery** — WebSocket push means your agent gets the code in seconds, not minutes.
- **Competitive pricing** — Starting from $0.02 per number.
- **Simple REST + WebSocket API** — Clean, documented, agent-friendly.
- **11 MCP tools** — Everything from price discovery to one-step code retrieval.

---

## Migrating from SMS-Activate or DaisySMS?

If you're moving away from **SMS-Activate** or **DaisySMS** (closing March 2025), VirtualSMS is a straightforward alternative with comparable service coverage, competitive pricing, and a modern API built for programmatic use.

Just swap your API key and update the base URL — the concepts (buy number → wait for SMS → get code) are identical.

👉 [Sign up at VirtualSMS.io](https://virtualsms.io) and get started in minutes.

---

## Configuration

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "virtualsms": {
      "command": "npx",
      "args": ["virtualsms-mcp"],
      "env": {
        "VIRTUALSMS_API_KEY": "vms_your_api_key_here"
      }
    }
  }
}
```

### Cursor

Edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "virtualsms": {
      "command": "npx",
      "args": ["virtualsms-mcp"],
      "env": {
        "VIRTUALSMS_API_KEY": "vms_your_api_key_here"
      }
    }
  }
}
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VIRTUALSMS_API_KEY` | Yes (for auth tools) | — | Your VirtualSMS API key |
| `VIRTUALSMS_BASE_URL` | No | `https://virtualsms.io` | API base URL |

---

## Tools (11 total)

### Discovery Tools (no auth required)

#### `list_services`
Get all available SMS verification services.

```
list_services()
→ [{code: "telegram", name: "Telegram"}, ...]
```

#### `list_countries`
Get all available countries for phone verification.

```
list_countries()
→ [{iso: "US", name: "United States"}, ...]
```

#### `check_price`
Check price and availability for a service + country combination.

```
check_price(service: "telegram", country: "US")
→ {price_usd: 0.15, available: true}
```

#### `find_cheapest`
Find cheapest countries for a service, sorted by price.

```
find_cheapest(service: "telegram", limit: 5)
→ {cheapest_options: [{country: "PK", price_usd: 0.05, ...}], total_available_countries: 23}
```

#### `search_service`
Find the right service code using natural language.

```
search_service(query: "uber")
→ {matches: [{code: "uber", name: "Uber", match_score: 1.0}]}
```

### Account Tools (API key required)

#### `get_balance`
Check your account balance.

```
get_balance()
→ {balance_usd: 5.00}
```

#### `active_orders`
List your active orders. **Essential for crash recovery.**

```
active_orders()
active_orders(status: "pending")
→ {count: 2, orders: [{order_id: "abc123", phone_number: "+14155552671", status: "pending", ...}]}
```

Optional `status` filter: `"pending"`, `"sms_received"`, `"cancelled"`, `"completed"`

### Order Management Tools (API key required)

#### `buy_number`
Purchase a virtual phone number for a specific service and country.

```
buy_number(service: "telegram", country: "US")
→ {order_id: "abc123", phone_number: "+14155552671", expires_at: "...", status: "pending"}
```

#### `check_sms`
Check if an SMS verification code has arrived.

```
check_sms(order_id: "abc123")
→ {status: "sms_received", phone_number: "+14155552671", sms_code: "12345", sms_text: "Your code is 12345"}
```

#### `cancel_order`
Cancel an order and request a refund (only if no SMS received yet).

```
cancel_order(order_id: "abc123")
→ {success: true, refunded: true}
```

#### `wait_for_code` ⭐ Recommended
One-step tool: buys a number AND waits for the SMS code. Uses WebSocket for instant delivery with automatic polling fallback.

```
wait_for_code(service: "telegram", country: "US")
wait_for_code(service: "whatsapp", country: "PK", timeout_seconds: 180)
→ {
    success: true,
    phone_number: "+14155552671",
    sms_code: "12345",
    sms_text: "Your Telegram code: 12345",
    order_id: "abc123",
    delivery_method: "websocket",
    elapsed_seconds: 8
  }
```

On timeout, returns `order_id` for recovery:
```
→ {success: false, error: "timeout", order_id: "abc123", phone_number: "...", tip: "Use check_sms..."}
```

---

## How It Works

### WebSocket vs Polling

`wait_for_code` uses a two-tier delivery system:

1. **WebSocket (instant)** — connects to `wss://virtualsms.io/ws/orders?order_id=xxx` immediately after purchase. When the SMS arrives, the server pushes it in real-time. Typical delivery: 2–15 seconds.

2. **Polling fallback** — if WebSocket fails to connect or disconnects, automatically falls back to polling `GET /api/v1/order/{id}` every 5 seconds.

The `delivery_method` field in the response tells you which was used.

### Architecture

```
AI Agent (Claude / Cursor / any MCP client)
    │
    ▼ MCP stdio protocol
VirtualSMS MCP Server (this package)
    │
    ├──► REST API: https://virtualsms.io/api/v1/
    │        buy_number, check_sms, cancel_order, get_balance ...
    │
    └──► WebSocket: wss://virtualsms.io/ws/orders
             real-time SMS push delivery
```

---

## Typical Workflows

### Simple: Get a Telegram verification code
```
wait_for_code(service: "telegram", country: "US")
```

### Budget: Find cheapest option first
```
find_cheapest(service: "telegram", limit: 3)
# → picks cheapest country
wait_for_code(service: "telegram", country: "PK")
```

### Manual: Step by step
```
buy_number(service: "google", country: "GB")
# → order_id: "abc123", phone: "+447911123456"
# Use the number to trigger the SMS, then:
check_sms(order_id: "abc123")
# or cancel if no longer needed:
cancel_order(order_id: "abc123")
```

---

## Crash Recovery

If your session is interrupted mid-verification:

1. **Restart the MCP server**
2. **List active orders:** `active_orders(status: "pending")`
3. **Check for codes:** `check_sms(order_id: "abc123")`
4. **Cancel if not needed:** `cancel_order(order_id: "abc123")`

`wait_for_code` always returns `order_id` even on timeout — use it to recover.

---

## License

MIT — See [LICENSE](./LICENSE)

Built with ❤️ by [VirtualSMS.io](https://virtualsms.io) — virtual phone numbers for SMS verification, built on own infrastructure.
