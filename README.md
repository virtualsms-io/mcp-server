# VirtualSMS MCP Server

[![CI](https://github.com/virtualsms-io/mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/virtualsms-io/mcp-server/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/virtualsms-mcp.svg)](https://www.npmjs.com/package/virtualsms-mcp)
[![smithery badge](https://smithery.ai/badge/virtualsms/virtualsms-mcp)](https://smithery.ai/servers/virtualsms/virtualsms-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/virtualsms-io/mcp-server?style=social)](https://github.com/virtualsms-io/mcp-server)

**Quick links:** [Quickstart](#quickstart) · [What you can build](#what-you-can-build) · [Tools](#tools) · [Questions](#questions) · [Examples](./examples/) · [Changelog](./CHANGELOG.md) · [Security policy](./SECURITY.md) · [Status](https://virtualsms.io/status)

VirtualSMS is an account verification platform that lets developers and AI agents programmatically receive SMS verification codes, with number rentals and matching-country proxies available from the same account. The numbers are real physical SIM cards on carrier networks, not VoIP, which is why they pass the line-type checks that reject VoIP numbers at signup.

This server exposes that platform to any MCP client. It is MCP-native: it works inside Claude Code, Claude Desktop, Cursor, Windsurf and any other MCP-compatible client, with no wrapper code to write.

---

## Quickstart

Paste this into your MCP client's config. Nothing to install, no Node.js required on the client:

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

Get an API key at [virtualsms.io](https://virtualsms.io). Then ask your agent:

> "Buy me a Telegram number in the cheapest country and wait for the code."

Prefer to run it locally over stdio instead:

```bash
npx virtualsms-mcp
```

---

## What you can build

Concrete jobs this server does today. Every one is a plain-English request your agent turns into tool calls:

| You want to | Ask your agent | Tools it uses |
|---|---|---|
| **Verify a WhatsApp account from Claude Code** | "Get me a WhatsApp code on a UK number" | `create_order` → `wait_for_sms` |
| **Create a Telegram account from Cursor** | "Buy a Telegram number in the cheapest country and wait for the code" | `find_cheapest` → `create_order` → `wait_for_sms` |
| **Retrieve verification codes automatically** | "Wait for the code and paste it into the form" | `wait_for_sms` |
| **Test OTP flows during QA** | "Run the signup flow ten times and report which codes landed" | `create_order` → `wait_for_sms` → `cancel_order` |
| **Provision temporary numbers during CI** | "Give the test suite a fresh number, then release it" | `create_order` → `get_sms` → `cancel_order` |
| **Keep a number for a week** | "Rent me a British number for 7 days" | `rentals_available` → `create_rental` |
| **Make the number and the IP agree** | "Buy a UK proxy to match my UK number" | `list_proxy_catalog` → `buy_proxy` → `generate_proxy_endpoint` |
| **Screen a number before you trust it** | "Is this number VoIP?" | `check_number` (no API key required) |
| **Recover a number that went quiet** | "That number never got the code, swap it" | `swap_number` |

Runnable versions of the first two live in [`examples/`](./examples/).

---

## Client setup

Every client runs the same `npx virtualsms-mcp` stdio command. Only the file location and format differ. The hosted config above works anywhere `streamableHttp` is supported and is the recommended path.

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

Quit and reopen Claude Desktop. A drop-in config plus a worked transcript lives in [`examples/03-claude-desktop-config/`](./examples/03-claude-desktop-config/).

<details>
<summary><strong>Claude Code, Cursor, Windsurf, OpenClaw, Codex, Hermes, Cline, Zed, Continue.dev</strong></summary>

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

</details>

### Does this work with ChatGPT?

Not natively. ChatGPT uses GPT Actions, a different protocol than MCP. For ChatGPT, build a custom GPT that calls the [VirtualSMS REST API](https://virtualsms.io/docs) directly.

---

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VIRTUALSMS_API_KEY` | Yes, for account tools | none | Your VirtualSMS API key. Keys carry a `vsms_` prefix |
| `VIRTUALSMS_BASE_URL` | No | `https://virtualsms.io` | API base URL |
| `VIRTUALSMS_ENABLE_SESSIONS` | No | off | Serves 3 additional session-drive tools when set to `1`, `true` or `yes`. Off by default |
| `VIRTUALSMS_ENABLE_RELEASE` | No | off | Serves the early-release rental tool when set to `1`, `true` or `yes`. Off by default while its refund terms are being settled |

---

## Tools

40 tools by default. Set `VIRTUALSMS_ENABLE_SESSIONS=1` to expose 3 more.

Tool names are shown below without the `virtualsms_` prefix for readability. The real wire names are prefixed: `virtualsms_create_order`, `virtualsms_get_sms`, and so on.

<details open>
<summary><strong>Activation and account (18 tools)</strong></summary>

The core SMS verification surface: discover a service, price it, buy a number, get the code.

| Tool | Auth | Description |
|---|---|---|
| `list_services` | Yes | All available verification services. Optional `search` filter |
| `list_countries` | Yes | All available countries. Optional `service` filter |
| `get_price` | No | Price and availability for a service plus country pair |
| `find_cheapest` | No | Cheapest countries for a service, sorted by price, with real stock counts |
| `search_services` | Yes | Natural-language service lookup. "telega" finds Telegram |
| `get_balance` | Yes | Account balance in USD |
| `get_profile` | Yes | Email, Telegram link, balance, lifetime spend, total orders, active API keys |
| `get_stats` | Yes | Orders, success rate, spend, and status/service/country breakdown |
| `get_transactions` | Yes | Transaction history with type, date range, and pagination filters |
| `create_order` | Yes | Buy a number for a service plus country. Returns `order_id` and `phone_number` |
| `get_sms` | Yes | Poll an order for the code. Use for batch and cron jobs |
| `wait_for_sms` | Yes | Block until the SMS lands on an existing `order_id`, or until timeout |
| `get_order` | Yes | Full order detail plus every received message |
| `list_orders` | Yes | Your active orders. Essential for crash recovery |
| `order_history` | Yes | Past orders with status, service, country, and date filters |
| `cancel_order` | Yes | Cancel and refund, if no SMS arrived. 120s cooldown after purchase |
| `cancel_all_orders` | Yes | Bulk-cancel every active order |
| `swap_number` | Yes | Swap for a new number, same service and country, no extra charge. 120s cooldown |

> **`get_sms` vs `wait_for_sms`:** `wait_for_sms` is the recommended default for interactive agent workflows. It blocks and returns the moment the SMS arrives over WebSocket. Use `get_sms` for batch jobs, cron-driven polling, or when you already manage your own polling loop.

> **`wait_for_sms` takes an `order_id`, not a service and country.** Call `create_order` first, then pass the returned `order_id`. That is the two-step buy-and-wait flow.

</details>

<details>
<summary><strong>Rentals (9 tools)</strong></summary>

Rent a number for days instead of one verification. Two tiers:

- **Full Access:** local SIM inventory, works across any service on that number.
- **Platform:** sourced via our global supplier network, locked to one chosen service, durations of 1, 3 or 7 days.

Both tiers carry the same refund terms: cancel for a full refund within 20 minutes of purchase and before the first SMS arrives. Platform cancels are additionally subject to a 2 minute minimum hold, so a cancel inside the first 2 minutes is rejected and has to be retried.

| Tool | Auth | Description |
|---|---|---|
| `rentals_pricing` | Yes | Full Access pricing tiers: durations and prices |
| `rentals_available` | Yes | Countries with rental stock, counts, and pricing, per tier |
| `rentals_services` | Yes | Services available for Platform-tier rental in a country, with stock and price |
| `rentals_price` | Yes | Retail price for a service, country, and duration combination |
| `create_rental` | Yes | Rent a number. Check availability and price first |
| `list_rentals` | Yes | Your rentals across both tiers, filterable by status |
| `get_rental` | Yes | Full detail for one rental: tier, number, service lock, status, expiry, SMS |
| `extend_rental` | Yes | Extend an active rental. Charges the current catalog price |
| `cancel_rental` | Yes | Full refund, within 20 minutes of purchase and before any SMS |

</details>

<details>
<summary><strong>Proxy (10 tools)</strong></summary>

Matching-country proxies, so the number and the IP agree. Buy traffic by the GB, then generate a connection string.

| Tool | Auth | Description |
|---|---|---|
| `list_proxy_catalog` | Yes | Pool types, countries, and price per GB. Start here |
| `list_proxy_locations` | No | Cities, states, ASNs, or ZIPs for a pool type plus country. No purchase required |
| `buy_proxy` | Yes | Purchase proxy traffic in GB. Returns credentials and remaining balance |
| `list_proxies` | Yes | Your proxies with remaining GB and credentials. Returns `proxy_id` values |
| `generate_proxy_endpoint` | Yes | Build a ready-to-use connection string: country, state, city, ZIP or ASN targeting, rotating or sticky, HTTP or SOCKS5 |
| `rotate_proxy` | Yes | Request a fresh exit IP for an existing proxy |
| `test_proxy` | Yes | Prove a proxy works. Reports exit IP, country, city, ISP, and latency |
| `get_proxy_usage` | Yes | Cached GB used and remaining, plus request count, for one proxy |
| `get_proxy_usage_history` | Yes | Per-day traffic and request series over the last 7 or 30 days |
| `set_proxy_targeting` | Yes | Persist a default geo-targeting on a proxy sub-user |

</details>

<details>
<summary><strong>Other (3 tools)</strong></summary>

| Tool | Auth | Description |
|---|---|---|
| `retry_order` | Yes | Ask for the SMS to be resent to the same number. Not all order types support it |
| `check_number` | No | Carrier and line-type lookup for any E.164 number: mobile, landline or VoIP, plus spam risk |
| `start_manual_registration_session` | Yes | **Beta.** Start a private cloud-browser session for manual signup or verification. Returns a `debug_url` for live takeover |

</details>

<details>
<summary><strong>Session tools (3 more, off by default)</strong></summary>

**Beta.** The browser stack is early. It works, but the shape of these tools can still change and there is no stability guarantee yet.

Served only when `VIRTUALSMS_ENABLE_SESSIONS` is set to `1`, `true` or `yes`. Not exposed on the default surface.

| Tool | Description |
|---|---|
| `navigate_session` | Navigate an active browser session to a URL |
| `session_viewer` | Live viewer URL and current status for an active session |
| `stop_session` | Stop an active browser session and release it |

</details>

---

## Typical workflows

### Get a verification code

```
create_order(service: "telegram", country: "US")
→ {order_id: "abc123", phone_number: "+14155552671", status: "pending"}

wait_for_sms(order_id: "abc123", timeout_seconds: 180)
→ {success: true, code: "12345", delivery_method: "websocket", elapsed_seconds: 8}
```

### Find the cheapest country first

```
find_cheapest(service: "telegram", limit: 3)
→ {cheapest_options: [{country: "PK", price_usd: 0.05, ...}]}

create_order(service: "telegram", country: "PK")
wait_for_sms(order_id: "abc123")
```

### Number not receiving? Swap it

```
swap_number(order_id: "abc123")
→ {order_id: "def456", phone_number: "+628...", status: "waiting"}
```

### Rent a number for a week

```
rentals_available(tier: "full_access", country: "GB")
create_rental(tier: "full_access", country: "GB", duration_hours: 168)
```

### Pair a number with a matching-country proxy

```
list_proxy_catalog()
buy_proxy(pool_type: "residential", gb: 1, country_code: "GB")
generate_proxy_endpoint(proxy_id: "px_1", country_code: "GB", protocol: "socks5")
```

---

## Questions

### What is an MCP server for SMS verification?

MCP (Model Context Protocol) is an open standard that lets an AI client call external tools. An MCP server for SMS verification exposes phone-number and verification-code operations as tools an agent can call directly, so the agent buys the number, waits for the code and reads it back without any glue code from you. This repo is that server for VirtualSMS: 40 tools covering verification, rentals and proxies.

### When should I use this?

- Your AI agent needs to sign in to or register an account that demands a phone number.
- You are testing an OTP or signup flow and want fresh numbers on demand instead of a drawer of test SIMs.
- You need a verification code retrieved automatically, in CI or in an unattended job.
- You need a number and a matching-country IP that agree with each other.
- You want per-code pricing from $0.05 with no subscription and no monthly number rental.

### When should I NOT use this?

Honest answers, so you do not waste an afternoon:

- **You need to send SMS.** This platform receives; it does not send. Use a messaging provider such as Twilio.
- **You need a permanent number for your business.** Verification numbers are temporary by design, and rentals run in days, not years. Buy a real line from a carrier.
- **You need codes on a number you already own.** There is no port-in. The numbers come from our inventory.
- **You are running A2P marketing campaigns.** Wrong tool entirely.
- **You are trying to evade a platform's terms of service.** Whether your use complies with the terms of the service you verify against is your responsibility, not ours.

### Can Claude or Cursor receive SMS verification codes?

Yes, through this server. Claude Code, Claude Desktop, Cursor, Windsurf, Cline, Zed, Continue.dev, Codex, OpenClaw and Hermes are all MCP clients, and each one is a config paste away (see [Client setup](#client-setup)). Once installed, "buy a Telegram number and wait for the code" is a request the agent can carry out end to end. ChatGPT is the exception: it uses GPT Actions rather than MCP, so it needs the [REST API](https://virtualsms.io/docs).

### How do AI agents receive OTP codes automatically?

Two tool calls. `create_order` buys a number for a given service and country and returns an `order_id`. `wait_for_sms` then blocks on that `order_id` and returns the moment the code arrives, pushed over WebSocket, typically in 2 to 15 seconds. The agent never polls, never sleeps in a loop, and never needs a human to read a phone. If you would rather drive your own loop, `get_sms` polls a single order instead.

### How is this different from Twilio?

Twilio is a full communications platform: send and receive SMS and voice, long-lived numbers, A2P campaigns, the lot. VirtualSMS does one job, which is receiving verification codes on demand. The practical differences:

- **Line type.** Twilio numbers are VoIP. Many services reject VoIP numbers at signup. VirtualSMS numbers are real physical SIM cards on carrier networks, so they resolve as mobile.
- **Pricing shape.** Twilio bills you for a number every month whether you use it or not. VirtualSMS bills per code from $0.05, with no subscription.
- **Direction.** Twilio sends and receives. This receives.

If you need to send messages, use Twilio. If you need to receive a verification code, this is purpose-built for it.

### Why real physical SIM cards instead of VoIP?

Verification systems check the line type of the number you give them. VoIP numbers are cheap and disposable at scale, so they correlate with fraud, and a large share of services reject them outright at signup. Real physical SIM cards sit on carrier networks and resolve as mobile, which is what those checks are looking for.

You do not have to take that on faith. `check_number` runs a carrier and line-type lookup on any E.164 number, needs no API key, and will tell you whether a number reads as mobile, landline or VoIP.

---

## Alternatives and comparisons

Developers searching for `textverified mcp`, `sms-activate mcp`, `5sim mcp`, `daisysms mcp` or `smspool mcp` are usually asking one question: which SMS verification provider can an AI agent drive natively? This section answers that without a scoreboard.

**VirtualSMS** publishes this MCP server, so any MCP client calls it directly with no wrapper code: 40 tools, 2500+ services, 145+ countries, from $0.05 per code, on real physical SIM cards, plus number rentals and matching-country proxies from the same balance.

**SMS-Activate** shut down in December 2025. If your integration pointed there, it is gone, and the migration is a new API key and a new base URL rather than a rewrite: the shape of the job, buy a number then read the code, is the same here.

**TextVerified**, **5SIM**, **DaisySMS** and **SMSPool** are all active SMS verification providers, each with its own API, pricing, coverage and terms. Check their current documentation for what they offer today.

We deliberately do not publish a comparison table of competitors' prices, service counts or coverage. Those numbers move week to week, we have no privileged view into anyone else's inventory, and a stale table dressed up as research is worse than no table at all. The VirtualSMS numbers above are ours and we stand behind them. Compare them against whatever you are using now.

---

## How it works

### WebSocket and polling

`wait_for_sms` uses a two-tier delivery system:

1. **WebSocket, instant.** Connects to `wss://virtualsms.io/ws/orders?order_id=xxx&api_key=your_key`. When the SMS arrives the server pushes it in real time. Typical delivery: 2 to 15 seconds.
2. **Polling fallback.** If the WebSocket fails to connect or drops, the tool falls back to polling every 5 seconds for the remaining timeout.

The `delivery_method` field in the response tells you which path was used.

### Architecture

```
AI Agent (Claude / Cursor / Codex / Windsurf / any MCP client)
    │
    ▼ MCP (stdio or StreamableHTTP)
VirtualSMS MCP Server (this package)
    │
    ├──► REST API: https://virtualsms.io/docs
    │        create_order, get_sms, cancel_order, get_balance ...
    │
    └──► WebSocket: wss://virtualsms.io/ws/orders
             real-time SMS push delivery
```

### Crash recovery

If your session is interrupted mid-verification:

1. **Restart the MCP server.**
2. **List active orders:** `list_orders(status: "pending")`
3. **Check for codes:** `get_sms(order_id: "abc123")`
4. **Cancel if not needed:** `cancel_order(order_id: "abc123")`

`wait_for_sms` always returns `order_id`, even on timeout, so you can recover.

---

## Hosted endpoint and status

- **Hosted MCP endpoint:** `https://mcp.virtualsms.io/mcp`. TLS-only StreamableHTTP, fronted by Cloudflare.
- **Status and uptime:** [virtualsms.io/status](https://virtualsms.io/status). Target SLA 99.9% on the hosted MCP path.
- **Coverage:** 145+ countries online, 2500+ services indexed.
- **Data retention:** SMS message bodies are retained 7 days, then permanently deleted. Order metadata (phone number, service, country, timestamps) is retained for the lifetime of your account. See [SECURITY.md](./SECURITY.md) for full details.
- **Vulnerability disclosure:** email `security@virtualsms.io` or open a [private security advisory](https://github.com/virtualsms-io/mcp-server/security/advisories/new).

👉 [Sign up at VirtualSMS.io](https://virtualsms.io)

---

## Examples

Three runnable examples are checked into this repo. Each is `node run.mjs` away once `VIRTUALSMS_API_KEY` is set.

- **[`examples/01-quick-balance-check/`](./examples/01-quick-balance-check/)**: 5-second hosted MCP smoke test (`get_balance`).
- **[`examples/02-buy-sms-and-wait-for-code/`](./examples/02-buy-sms-and-wait-for-code/)**: full verification flow, `find_cheapest` → `create_order` → `wait_for_sms` → cancel-on-timeout. The canonical pattern for AI agents.
- **[`examples/03-claude-desktop-config/`](./examples/03-claude-desktop-config/)**: drop-in Claude Desktop config plus a transcript of "ask Claude what's my balance" over StreamableHTTP.

## SDKs and tools

The same platform, from whatever you already write in:

| Repo | What it is |
|---|---|
| [node-sdk](https://github.com/virtualsms-io/node-sdk) | Official Node.js / TypeScript SDK |
| [python-sdk](https://github.com/virtualsms-io/python-sdk) | Official Python SDK |
| [virtualsms-php-sdk](https://github.com/virtualsms-io/virtualsms-php-sdk) | Official PHP SDK |
| [ruby-sdk](https://github.com/virtualsms-io/ruby-sdk) | Official Ruby SDK |
| [dotnet-sdk](https://github.com/virtualsms-io/dotnet-sdk) | Official .NET SDK |
| [api-docs](https://github.com/virtualsms-io/api-docs) | REST API documentation source |
| [examples](https://github.com/virtualsms-io/examples) | Runnable examples across languages |
| [n8n-nodes-virtualsms](https://github.com/virtualsms-io/n8n-nodes-virtualsms) | n8n community nodes |
| [automation-integrations](https://github.com/virtualsms-io/automation-integrations) | Make, Zapier and workflow integrations |
| [virtual-number-checker](https://github.com/virtualsms-io/virtual-number-checker) | Carrier and line-type lookup tool |
| [claude-skill-sms-verification](https://github.com/virtualsms-io/claude-skill-sms-verification) | Claude skill for SMS verification |
| [cursor-rules-sms-verification](https://github.com/virtualsms-io/cursor-rules-sms-verification) | Cursor rules for SMS verification |

---

## Build and contribute

```bash
git clone https://github.com/virtualsms-io/mcp-server.git
cd mcp-server
npm install
npm run build      # tsc
npm test           # vitest
npx tsc --noEmit   # typecheck only
```

Two transports share one tool table: `src/index.ts` (stdio) and `src/http-server.ts` (StreamableHTTP). Tool definitions and handlers live in `src/tools.ts`. If you add a tool, wire it into **both** transports. `src/__tests__/transport-parity.test.ts` fails the build if you forget, and `src/__tests__/docs-tool-names.test.ts` fails if the docs name a tool that does not exist.

Issues and pull requests: [github.com/virtualsms-io/mcp-server](https://github.com/virtualsms-io/mcp-server/issues).

Release notes for v1.0.0 to v1.2.3 are in [CHANGELOG.md](./CHANGELOG.md).

## Security

API keys are passed via the `x-api-key` header (hosted) or the `VIRTUALSMS_API_KEY` environment variable (local stdio), and are rotatable from the [dashboard](https://virtualsms.io/settings). Full policy, retention detail and disclosure process: [SECURITY.md](./SECURITY.md).

Report vulnerabilities to `security@virtualsms.io`.

## License

MIT. See [LICENSE](./LICENSE).

Built by [VirtualSMS.io](https://virtualsms.io/mcp). Account verification for developers and AI agents, on real physical SIM cards: 2500+ services · 145+ countries · from $0.05 per code.
</content>
