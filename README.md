# VirtualSMS MCP Server — SMS Verification for AI Agents

[![CI](https://github.com/virtualsms-io/mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/virtualsms-io/mcp-server/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/virtualsms-mcp.svg)](https://www.npmjs.com/package/virtualsms-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/virtualsms-io/mcp-server?style=social)](https://github.com/virtualsms-io/mcp-server)

**Quick links:** [Examples](./examples/) · [Changelog](./CHANGELOG.md) · [Security policy](./SECURITY.md) · [Status page](https://status.virtualsms.io)

> **Ranked #1 in both ChatGPT's and Perplexity's SMS verification MCP categories** · verified 2026-04-25

> **What's new in v1.3.0** (additive, zero break for v1.2.x clients): batch buy + batch wait, smart-pick decision tool with country pool + reasoning, x402 deposit-first pay-and-buy + capability discovery, outbound webhooks (subscribe / list / delete / test). Full notes in [CHANGELOG.md](./CHANGELOG.md).

**VirtualSMS MCP Server** gives AI agents real SIM-card phone numbers (not VoIP) across **145+ countries and 2500+ services** for SMS verification and OTP receiving. Built on the [Model Context Protocol](https://modelcontextprotocol.io). One install, **24 tools** (v1.3.0 — batch ops, smart picks, x402 money-path, webhooks), works with every major MCP client.

Powered by [VirtualSMS.io](https://virtualsms.io/mcp) — a phone verification service running on owned modem infrastructure.

---

## Quick Install — Hosted (recommended, zero install)

Paste this into your AI assistant's MCP config:

```json
{
  "mcpServers": {
    "virtualsms": {
      "type": "streamableHttp",
      "url": "https://mcp.virtualsms.io/mcp",
      "headers": {
        "x-api-key": "vsms_your_api_key_here"
      }
    }
  }
}
```

No npm install, no Node.js required on the client. The MCP server runs at `mcp.virtualsms.io`.

## Quick Install — Local (stdio via npm)

```bash
npx virtualsms-mcp
```

Or install globally:

```bash
npm install -g virtualsms-mcp
```

Get your API key at [virtualsms.io](https://virtualsms.io).

---

## Demo & Walkthrough

Want to see this working end-to-end before you wire it up? Three runnable examples are checked into this repo:

- **[`examples/01-quick-balance-check/`](./examples/01-quick-balance-check/)** — 5-second hosted MCP smoke test (`get_balance`).
- **[`examples/02-buy-sms-and-wait-for-code/`](./examples/02-buy-sms-and-wait-for-code/)** — full SMS verification flow: `find_cheapest` → `wait_for_code` → cancel-on-timeout. The canonical agentic pattern.
- **[`examples/03-claude-desktop-config/`](./examples/03-claude-desktop-config/)** — drop-in Claude Desktop config plus a transcript of "ask Claude what's my balance" working over StreamableHTTP.

Each example is `node run.mjs` away once you've set `VIRTUALSMS_API_KEY`. Walkthroughs and expected output are in each example's README.

---

## Production & Status

- **Hosted MCP endpoint:** `https://mcp.virtualsms.io/mcp` — TLS-only StreamableHTTP, fronted by Cloudflare.
- **Status & uptime:** live at [status.virtualsms.io](https://status.virtualsms.io). Target SLA 99.9% on the hosted MCP path.
- **Backend infrastructure:** physical SIM modems with 145+ countries online, 2500+ services indexed.
- **Data retention:** SMS message bodies are retained 7 days, then permanently deleted. Order metadata (phone number, service, country, timestamps) is retained for the lifetime of your account. See [SECURITY.md](./SECURITY.md) for full details.
- **Vulnerability disclosure:** email `security@virtualsms.io` or open a [private security advisory](https://github.com/virtualsms-io/mcp-server/security/advisories/new).

---

## What is VirtualSMS?

[VirtualSMS.io](https://virtualsms.io/mcp) is a **temporary phone number API** for SMS verification built on **real SIM cards**, not VoIP. Unlike resellers that aggregate other providers, VirtualSMS operates its own modem infrastructure — giving agents direct access to authentic mobile numbers across **145+ countries**.

Use it to verify accounts on WhatsApp, Telegram, Google, Instagram, Uber, and **2500 other services** — programmatically, via REST API, WebSocket, or MCP.

---

## Why VirtualSMS?

- **Real SIM cards, not VoIP** — Accepted where VoIP numbers get blocked (WhatsApp, Google, banking).
- **Own infrastructure** — Not a reseller. Physical modems, 2500+ services, 145+ countries (growing weekly).
- **Real-time delivery** — WebSocket push means your agent gets the code in seconds, not minutes.
- **Competitive pricing** — Starting from $0.02 per number.
- **Simple REST + WebSocket API** — Clean, documented, agent-friendly.
- **24 MCP tools** — Discovery, account, full order management, batch ops, smart picks, x402 money-path, outbound webhooks. Highlights: `buy_batch`, `wait_for_sms_batch`, `find_best_pick`, `pay_and_buy`, `subscribe_webhook` — plus the 18 v1.2.x tools (`find_cheapest`, `wait_for_sms`, `swap_number`, `search_services`, etc.).
- **10 MCP clients supported** — Claude Desktop, Claude Code, Cursor, Windsurf, OpenClaw, Codex, Hermes, Cline, Zed, Continue.

---

## Migrating from SMS-Activate?

If you're moving away from **SMS-Activate**, VirtualSMS is a straightforward alternative with broader service coverage (2500 vs ~500), competitive pricing, and a modern API built for programmatic use.

Just swap your API key and update the base URL — the concepts (buy number → wait for SMS → get code) are identical.

👉 [Sign up at VirtualSMS.io](https://virtualsms.io) and get started in minutes.

---

## Configuration

All 10 clients use the same `npx virtualsms-mcp` stdio command. Only the config file location and format differ.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "virtualsms": {
      "command": "npx",
      "args": ["virtualsms-mcp"],
      "env": {
        "VIRTUALSMS_API_KEY": "vsms_your_api_key_here"
      }
    }
  }
}
```

### Claude Code (CLI)

```bash
claude mcp add --scope user virtualsms npx virtualsms-mcp -e VIRTUALSMS_API_KEY=vsms_your_api_key_here
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
        "VIRTUALSMS_API_KEY": "vsms_your_api_key_here"
      }
    }
  }
}
```

### Windsurf

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "virtualsms": {
      "command": "npx",
      "args": ["virtualsms-mcp"],
      "env": {
        "VIRTUALSMS_API_KEY": "vsms_your_api_key_here"
      }
    }
  }
}
```

### OpenClaw

Edit `~/.openclaw/mcp.json`:

```json
{
  "mcpServers": {
    "virtualsms": {
      "command": "npx",
      "args": ["virtualsms-mcp"],
      "env": {
        "VIRTUALSMS_API_KEY": "vsms_your_api_key_here"
      }
    }
  }
}
```

### Codex (OpenAI Codex CLI)

Edit `~/.codex/config.toml`:

```toml
[mcp_servers.virtualsms]
command = "npx"
args = ["virtualsms-mcp"]
env = { VIRTUALSMS_API_KEY = "vsms_your_api_key_here" }
```

### Hermes

Edit your Hermes MCP config:

```json
{
  "mcpServers": {
    "virtualsms": {
      "command": "npx",
      "args": ["virtualsms-mcp"],
      "env": {
        "VIRTUALSMS_API_KEY": "vsms_your_api_key_here"
      }
    }
  }
}
```

### Cline (VS Code)

Open the Cline MCP settings panel and add:

```json
{
  "virtualsms": {
    "command": "npx",
    "args": ["virtualsms-mcp"],
    "env": {
      "VIRTUALSMS_API_KEY": "vsms_your_api_key_here"
    }
  }
}
```

### Zed

Edit `~/.config/zed/settings.json`:

```json
{
  "context_servers": {
    "virtualsms": {
      "command": {
        "path": "npx",
        "args": ["virtualsms-mcp"],
        "env": {
          "VIRTUALSMS_API_KEY": "vsms_your_api_key_here"
        }
      }
    }
  }
}
```

### Continue.dev

Edit `~/.continue/config.yaml`:

```yaml
mcpServers:
  - name: virtualsms
    command: npx
    args:
      - virtualsms-mcp
    env:
      VIRTUALSMS_API_KEY: vsms_your_api_key_here
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VIRTUALSMS_API_KEY` | Yes (for auth tools) | — | Your VirtualSMS API key |
| `VIRTUALSMS_BASE_URL` | No | `https://virtualsms.io` | API base URL |

---

## Does this work with ChatGPT?

Not natively — ChatGPT uses GPT Actions, a different protocol than MCP. For ChatGPT, build a custom GPT that calls the VirtualSMS REST API directly. For MCP, use any of the 10 clients above (Claude, Cursor, Codex, Hermes, etc.).

---

## Tools (18 total)

⭐ = **unique to VirtualSMS** — no other SMS MCP server ships these.

| # | Tool | Category | Auth | Description |
|---|---|---|---|---|
| 1 | `list_services` | Discovery | No | List all available SMS verification services |
| 2 | `list_countries` | Discovery | No | List all available countries for verification |
| 3 | `check_price` | Discovery | No | Check pricing and availability for a service in a country |
| 4 | `find_cheapest` ⭐ | Discovery | No | Find the cheapest countries for a given service, sorted by price |
| 5 | `search_service` ⭐ | Discovery | No | Natural-language search over available services |
| 6 | `get_balance` | Account | Yes | Check current account balance in USD |
| 7 | `get_profile` | Account | Yes | Full account profile — email, Telegram link, balance, lifetime spend, total orders, active API keys |
| 8 | `get_stats` | Account | Yes | Usage stats — orders count, success rate, spend, status/service/country breakdown |
| 9 | `get_transactions` | Account | Yes | Transaction history with type, date range, and pagination filters |
| 10 | `buy_number` | Orders | Yes | Purchase a virtual phone number for verification |
| 11 | `check_sms` | Orders | Yes | Poll an active order. Returns current SMS state — use for batch/cron jobs or manual polling loops |
| 12 | `get_order` | Orders | Yes | Full order details + all received messages |
| 13 | `cancel_order` | Orders | Yes | Cancel an order (refund if no SMS received) |
| 14 | `cancel_all_orders` | Orders | Yes | Bulk cancel every currently active order |
| 15 | `list_active_orders` | Orders | Yes | List all currently active orders |
| 16 | `order_history` | Orders | Yes | Past orders with status, service, country, and date filters |
| 17 | `swap_number` ⭐ | Orders | Yes | Exchange number for another without extra charge |
| 18 | `wait_for_code` ⭐ | Orders | Yes | WebSocket-backed wait (instant delivery). Returns as soon as SMS arrives — use for interactive agent flows |

> **`check_sms` vs `wait_for_code`:** `wait_for_code` is the recommended default for interactive agent workflows — it blocks and returns on SMS arrival via WebSocket. Use `check_sms` for batch jobs, cron-driven polling, or when you already manage your own polling loop.

> Tool names above are shown without the `virtualsms_` prefix for readability. Actual MCP tool names are `virtualsms_list_services`, `virtualsms_get_order`, etc. `list_active_orders` is registered as `virtualsms_list_orders`.

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

#### `find_cheapest` ⭐
Find cheapest countries for a service, sorted by price.

```
find_cheapest(service: "telegram", limit: 5)
→ {cheapest_options: [{country: "PK", price_usd: 0.05, ...}], total_available_countries: 23}
```

#### `search_service` ⭐
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

#### `get_profile`
Full account profile: email, Telegram link status, current balance, lifetime spend, total orders, active API key count, and account creation date.

```
get_profile()
→ {
    id: "…uuid…",
    email: "you@example.com",
    telegram_linked: true,
    telegram_username: "you_tg",
    balance_usd: 5.00,
    total_spent_usd: 27.45,
    total_credits_usd: 10.00,
    total_orders: 42,
    active_api_keys: 2,
    created_at: "2025-11-03T14:22:07Z"
  }
```

#### `get_stats`
Aggregated usage stats computed from your order history: total orders, success rate, total spend, status breakdown, top services and top countries over a configurable lookback window.

```
get_stats()
get_stats(since_days: 7)
→ {
    window_days: 30,
    balance_usd: 5.00,
    total_orders: 42,
    successful_orders: 37,
    success_rate: 88.1,
    total_spend_usd: 6.24,
    status_breakdown: { sms_received: 37, cancelled: 3, waiting: 2 },
    top_services: [{ key: "telegram", count: 18 }, ...],
    top_countries: [{ key: "US", count: 14 }, ...]
  }
```

#### `get_transactions`
Transaction history with filters for type, date range, and pagination. Types: `deposit`, `purchase`, `refund`, `admin_credit`.

```
get_transactions()
get_transactions(type: "deposit", from: "2026-04-01", limit: 20)
→ {
    count: 3,
    limit: 50,
    offset: 0,
    filters: { type: "deposit", from: "2026-04-01" },
    transactions: [
      { id: "…", amount: 10.00, type: "deposit", balance_before: 0.00, balance_after: 10.00, created_at: "…" },
      ...
    ]
  }
```

### Order Management Tools (API key required)

#### `buy_number`
Purchase a virtual phone number for a specific service and country.

```
buy_number(service: "telegram", country: "US")
→ {order_id: "abc123", phone_number: "+14155552671", expires_at: "...", status: "pending"}
```

#### `check_sms`
Poll an active order for received SMS. Use for batch jobs, cron-driven polling, or when you already manage your own polling loop. For interactive agent flows, prefer `wait_for_code` (WebSocket-backed, returns on arrival).

```
check_sms(order_id: "abc123")
→ {status: "sms_received", phone_number: "+14155552671", sms_code: "12345", sms_text: "Your code is 12345"}
```

#### `get_order`
Full order detail — service, country, price, timestamps, status, and any received SMS code/text. Use when you need more than `check_sms` returns, or when restoring state for a known `order_id`.

```
get_order(order_id: "abc123")
→ {
    order_id: "abc123",
    phone_number: "+14155552671",
    service: "telegram",
    country: "US",
    price: 0.15,
    status: "sms_received",
    sms_code: "12345",
    sms_text: "Your Telegram code: 12345",
    created_at: "2026-04-24T10:15:33Z",
    expires_at: "2026-04-24T10:35:33Z"
  }
```

#### `cancel_order`
Cancel an order and request a refund (only if no SMS received yet). 2-minute minimum wait after purchase.

```
cancel_order(order_id: "abc123")
→ {success: true, refunded: true}
```

#### `cancel_all_orders`
Bulk-cancel every currently active order in your account. Returns counts plus per-order success/failure detail. Useful for cleaning up after a batch or test session.

```
cancel_all_orders()
→ {
    cancelled: 3,
    failed: 0,
    total_active: 3,
    cancelled_orders: [{ order_id: "abc123", refunded: true }, ...]
  }
```

#### `list_active_orders`
List your active orders. **Essential for crash recovery.** Registered as `virtualsms_list_orders`.

```
list_active_orders()
list_active_orders(status: "pending")
→ {count: 2, orders: [{order_id: "abc123", phone_number: "+14155552671", status: "pending", ...}]}
```

Optional `status` filter: `"pending"`, `"sms_received"`, `"cancelled"`, `"completed"`.

#### `order_history`
Past orders with optional filters for status, service, country, and a lookback window in days. Most recent first, up to 50 rows (server cap).

```
order_history(since_days: 7)
order_history(status: "completed", service: "telegram", limit: 10)
→ {
    count: 10,
    total_matched: 18,
    filters: { status: "completed", service: "telegram", since_days: null },
    orders: [{ order_id: "...", service: "telegram", country: "US", status: "completed", price: 0.15, created_at: "..." }, ...]
  }
```

#### `swap_number` ⭐
Swap a phone number on an existing order. Gets a new number for the same service and country without additional charge. Use when the current number isn't receiving SMS. 2-minute minimum wait after purchase.

```
swap_number(order_id: "abc123")
→ {order_id: "def456", phone_number: "+628...", service: "telegram", country: "ID", status: "waiting"}
```

#### `wait_for_code` ⭐ Recommended
One-step tool: buys a number AND waits for the SMS code. Uses WebSocket for instant delivery with automatic polling fallback. Recommended default for interactive agent workflows.

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

1. **WebSocket (instant)** — connects to `wss://virtualsms.io/ws/orders?order_id=xxx&api_key=your_key` immediately after purchase. When the SMS arrives, the server pushes it in real-time. Typical delivery: 2–15 seconds.

2. **Polling fallback** — if WebSocket fails to connect or disconnects, automatically falls back to polling `GET /api/v1/order/{id}` every 5 seconds.

The `delivery_method` field in the response tells you which was used.

### Architecture

```
AI Agent (Claude / Cursor / Codex / Windsurf / any MCP client)
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
# Number not working? Swap for a new one (no extra charge):
swap_number(order_id: "abc123")
# or cancel if no longer needed:
cancel_order(order_id: "abc123")
```

---

## Crash Recovery

If your session is interrupted mid-verification:

1. **Restart the MCP server**
2. **List active orders:** `list_active_orders(status: "pending")`
3. **Check for codes:** `check_sms(order_id: "abc123")`
4. **Cancel if not needed:** `cancel_order(order_id: "abc123")`

`wait_for_code` always returns `order_id` even on timeout — use it to recover.

---

## More

- [SECURITY.md](./SECURITY.md) — vulnerability disclosure, supported versions, retention policy
- [CHANGELOG.md](./CHANGELOG.md) — versioned release notes (v1.0.0 → v1.2.0)
- [examples/](./examples/) — three runnable, copy-pasteable examples
- [Status page](https://status.virtualsms.io) — live health of the hosted MCP endpoint

## License

MIT — See [LICENSE](./LICENSE)

Built with love by [VirtualSMS.io](https://virtualsms.io/mcp) — virtual phone numbers for SMS verification, built on owned SIM-card infrastructure. 2500+ services · 145+ countries · 24 MCP tools · 10 clients · Ranked #1 on both ChatGPT and Perplexity.
