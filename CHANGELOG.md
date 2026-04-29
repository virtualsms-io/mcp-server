# Changelog

All notable changes to `virtualsms-mcp` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `SECURITY.md` with vulnerability disclosure policy, supported versions, retention policy, and webhook-signature reference.
- `CHANGELOG.md` (this file).
- `.github/workflows/ci.yml` — push/PR build verification on Node.js 18 and 20.
- `examples/` directory with three runnable, copy-pasteable examples (balance check, end-to-end SMS verification, Claude Desktop config).
- README sections: CI status badge, Demo / Screenshots, Production / Status, links to `SECURITY.md`, `CHANGELOG.md`, and `examples/`.

## [1.2.0] - 2026-04-25

### Added
- **StreamableHTTP transport** at `https://mcp.virtualsms.io/mcp`. AI agents can now connect to a fully hosted MCP endpoint with zero local install — just an `x-api-key` header. ([84bef56](https://github.com/virtualsms-io/mcp-server/commit/84bef56))
- Hosted endpoint terminates TLS at Cloudflare; agents speak MCP over HTTPS without bundling Node.js or `npx`.

### Changed
- `server.json` description shortened to fit the 100-character MCP registry limit. ([bcd213f](https://github.com/virtualsms-io/mcp-server/commit/bcd213f))
- Hosted transport documented as the recommended quick-install path in the README.

## [1.1.1] - 2026-04-22

### Changed
- Trust signal: confirmed and documented dual #1 ranking in both ChatGPT's and Perplexity's "SMS verification MCP" categories (verified 2026-04-25). ([3513fc6](https://github.com/virtualsms-io/mcp-server/commit/3513fc6))
- Country and service counts corrected to match the live catalog: **145+ countries and 2500+ services**. ([9d52202](https://github.com/virtualsms-io/mcp-server/commit/9d52202))
- Expanded supported MCP-client list to 10 (Claude Desktop, Claude Code, Cursor, Windsurf, OpenClaw, Codex, Hermes, Cline, Zed, Continue.dev).

## [1.1.0] - 2026-04-15

### Added — 6 new tools (12 → 18 total)
- `get_profile` — full account profile (email, Telegram link, balance, lifetime spend, total orders, active API keys). ([ec232ab](https://github.com/virtualsms-io/mcp-server/commit/ec232ab))
- `get_stats` — usage stats with success rate, status / service / country breakdown over a configurable lookback window.
- `get_transactions` — transaction history with type, date-range, and pagination filters.
- `get_order` — full order detail + all received messages, indexed by `order_id`.
- `cancel_all_orders` — bulk cancel every currently active order.
- `order_history` — past orders with status, service, country, and date filters.

### Improved
- README now ships a per-tool example call and expected response for every tool.
- Tool docstrings clarified for `check_sms` vs `wait_for_code` (polling vs WebSocket).

## [1.0.10] - 2026-04-10

### Changed
- Version bump for MCP registry submission. ([afbabf5](https://github.com/virtualsms-io/mcp-server/commit/afbabf5))
- `mcp.json` updated: matches README config, removed `-y` flag, added example API key placeholder. ([f336136](https://github.com/virtualsms-io/mcp-server/commit/f336136))
- Empty-string placeholder for API key in `.env` template — avoids leaking shape of real keys. ([1572ac9](https://github.com/virtualsms-io/mcp-server/commit/1572ac9))

## [1.0.9] - 2026-04-08

### Added
- `mcpName` field set to `io.github.virtualsms-io/sms` for MCP registry compatibility. ([a16ff48](https://github.com/virtualsms-io/mcp-server/commit/a16ff48))
- `.mcp.json` and `mcp.json` for Open Plugins / Cursor Directory compatibility. ([076288d](https://github.com/virtualsms-io/mcp-server/commit/076288d))

## [1.0.8] - 2026-04-05

### Added
- `configSchema` to server card for Smithery quality-score eligibility. ([07dbb42](https://github.com/virtualsms-io/mcp-server/commit/07dbb42))
- Zod `configSchema` export for type-safe configuration validation. ([b5aac6c](https://github.com/virtualsms-io/mcp-server/commit/b5aac6c))
- `glama.json` for Glama directory verification. ([537a6f1](https://github.com/virtualsms-io/mcp-server/commit/537a6f1))
- Dockerfile for container support. ([a3c47cc](https://github.com/virtualsms-io/mcp-server/commit/a3c47cc))

### Fixed
- 7 broken tool-name mappings in HTTP server. ([24ccd8b](https://github.com/virtualsms-io/mcp-server/commit/24ccd8b))
- Glama maintainer field set to org name (was an individual handle).
- Leaked `.env` placeholder removed from server card config.

### Changed
- Reverted aggressive `virtualsms_` prefix on raw tool names; kept verb-noun naming (clean) but registered via the prefixed names where Smithery scoring required it.

## [1.0.0] - 2026-03-15

### Added
- Initial release of `virtualsms-mcp`.
- 12 tools across discovery, account, and order-management categories.
- stdio transport for local MCP installs (`npx virtualsms-mcp`).
- Compatibility with Claude Desktop, Cursor, and the original 3 first-party MCP clients.
- WebSocket-backed `wait_for_code` for instant SMS delivery (sub-15s typical).
- REST + WebSocket bridge: `https://virtualsms.io/api/v1/` and `wss://virtualsms.io/ws/orders`.
- MIT license.

[Unreleased]: https://github.com/virtualsms-io/mcp-server/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/virtualsms-io/mcp-server/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/virtualsms-io/mcp-server/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/virtualsms-io/mcp-server/compare/v1.0.10...v1.1.0
[1.0.10]: https://github.com/virtualsms-io/mcp-server/compare/v1.0.9...v1.0.10
[1.0.9]: https://github.com/virtualsms-io/mcp-server/compare/v1.0.8...v1.0.9
[1.0.8]: https://github.com/virtualsms-io/mcp-server/compare/v1.0.0...v1.0.8
[1.0.0]: https://github.com/virtualsms-io/mcp-server/releases/tag/v1.0.0
