# Security Policy

VirtualSMS takes the security of its MCP server and the AI agents that depend on it seriously. This document explains how the package and the hosted endpoint protect users, and how to report a vulnerability.

## Supported Versions

We currently support and ship security fixes for the following versions of `virtualsms-mcp` on npm:

| Version | Supported |
| ------- | --------- |
| `>=1.2.0` (current) | Yes |
| `1.1.x` | Critical fixes only |
| `1.0.x` | No — please upgrade |
| `<1.0.0` | No |

Always pin to a recent minor (`^1.2.0`) or rely on `npx virtualsms-mcp` to pull the latest published release.

## Transport & Hosted Endpoint

- **Hosted MCP endpoint:** `https://mcp.virtualsms.io/mcp` (StreamableHTTP transport).
- **TLS-only.** The hosted endpoint terminates TLS at Cloudflare and refuses plaintext HTTP. All traffic from agent → hosted MCP server is encrypted.
- **Local stdio install** (`npx virtualsms-mcp`) runs entirely on your machine; no network traffic except the underlying `https://virtualsms.io/api/v1/` REST calls and `wss://virtualsms.io/ws/orders` WebSocket — both TLS-only.

## Authentication

- **API keys** are passed via the `x-api-key` HTTP header (hosted) or `VIRTUALSMS_API_KEY` environment variable (local stdio).
- API keys are scoped per account and **rotatable from the dashboard at https://virtualsms.io/settings**. We recommend rotating keys at least quarterly, and immediately if you suspect compromise (e.g. accidental commit to a public repo, leaked log).
- Keys carry the prefix `vsms_` for easy detection in secret-scanning pipelines.
- **Discovery tools** (`list_services`, `list_countries`, `check_price`, `find_cheapest`, `search_service`) do not require auth and are safe to call from public agents.
- **Account and order tools** (`get_balance`, `buy_number`, `wait_for_code`, etc.) require a valid API key. Without one, the server returns a structured error and never falls back to anonymous behavior.

## Webhook Signatures

For users who wire up webhooks via the REST API (out of scope of this MCP server, but related to the same account):

- Webhook payloads are signed with **HMAC-SHA256** using a per-account webhook secret.
- The signature is delivered in the `X-VirtualSMS-Signature` header.
- Your handler MUST verify the signature before trusting any payload. Reject mismatched signatures.

## Data Retention

- **SMS logs (received message bodies):** retained for **7 days** then permanently deleted from production storage.
- **Order metadata** (phone number, service, country, status, timestamps): retained for the lifetime of the account, per accounting and abuse-prevention requirements.
- **API access logs:** retained 30 days for incident response.

These retention windows apply to the VirtualSMS backend; the MCP server itself stores nothing locally.

## Reporting a Vulnerability

If you find a security issue in:

- The `virtualsms-mcp` npm package
- The hosted MCP endpoint at `mcp.virtualsms.io`
- Any tool definition, prompt, or resource exposed by this server

please report it privately. Do **not** open a public GitHub issue for security vulnerabilities.

**Preferred channels:**

1. Email **security@virtualsms.io** with subject prefix `[SECURITY]`. Include reproduction steps, affected version(s), and your impact assessment. We aim to acknowledge within 2 business days.
2. Or open a [private security advisory on GitHub](https://github.com/virtualsms-io/mcp-server/security/advisories/new).

We will:

- Acknowledge receipt within 2 business days.
- Provide an initial severity assessment within 5 business days.
- Work with you on a fix and coordinated disclosure timeline.
- Credit you in the CHANGELOG and release notes (unless you prefer to remain anonymous).

## Out of Scope

The following are **not** considered vulnerabilities in this MCP server:

- Issues in the user's MCP client configuration (e.g. a leaked API key checked into the user's own dotfiles repo). That's a user-side secrets-management problem.
- Pipedream-hosted, Smithery-hosted, or third-party-hosted forks of this MCP server. Report those to the respective host operator.
- Behavior of services targeted by VirtualSMS (e.g. WhatsApp number bans, Google CAPTCHA challenges). These are upstream platform behaviors, not vulnerabilities in this package.
- Rate-limit responses from the VirtualSMS REST API. These are intentional anti-abuse measures.
- Issues in dependencies fixed in a newer minor of that dependency — please file the issue upstream and open a PR here bumping the version.

## Security Best Practices for Operators

If you're embedding this MCP server in a product or agent:

1. **Never log API keys** — strip the `x-api-key` header and `VIRTUALSMS_API_KEY` env var from any application logs you ship to third parties (Sentry, Datadog, etc.).
2. **Rotate keys per environment** — separate dev / staging / prod keys, never share.
3. **Pin the package version** in production (`"virtualsms-mcp": "1.2.0"`) and upgrade deliberately after reviewing the [CHANGELOG](./CHANGELOG.md).
4. **Use the hosted MCP endpoint** when possible — you get patches automatically and don't need to manage Node.js versions on the agent host.
5. **Set spending limits on your VirtualSMS account** to cap blast radius of a compromised key.

---

Last reviewed: 2026-04-29.
