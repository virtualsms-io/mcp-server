# Proxy Tools

> **Status: rolling out.** These 9 tools are implemented on the `feature/mcp-tier-a-hardening` branch of this repo. They are **not yet published** to the `virtualsms-mcp` npm package or the hosted MCP endpoint (`mcp.virtualsms.io/mcp`). This doc describes them ahead of merge so integrators can plan against the shape now. Once the branch merges to `main` and ships a release, this note will be removed.

Matching-country proxies are the second leg of VirtualSMS's connected verification workflow: a real carrier number for the SMS, a proxy exiting from the same country for the browsing session. Three pool types are supported: **datacenter**, **residential** (with a **residential_premium** tier), and **mobile**.

## What's covered

| Tool | Purpose |
|---|---|
| `virtualsms_list_proxy_catalog` | List available pool types, countries, and price-per-GB. Call before buying. |
| `virtualsms_buy_proxy` | Purchase proxy traffic (GB) for a pool type. Returns credentials + remaining balance. |
| `virtualsms_list_proxies` | List proxies on the account with remaining GB and login credentials. |
| `virtualsms_set_proxy_targeting` | Persist a default country (+ optional cities/ASNs) on a proxy sub-user. |
| `virtualsms_generate_proxy_endpoint` | Build a ready-to-use connection string with per-connection targeting (country/state/city/zip/asn), rotating or sticky session, HTTP or SOCKS5. |
| `virtualsms_test_proxy` | Make one request through a proxy and report exit IP/country/city/ISP/latency. |
| `virtualsms_rotate_proxy` | Request a fresh exit IP for an existing proxy. |
| `virtualsms_get_proxy_usage` | Cached GB used/remaining + request count for one proxy (no upstream call, refreshed ~5 min). |
| `virtualsms_get_proxy_usage_history` | Per-day traffic + request-count series over the last 7 or 30 days. |

**What's not there:** there is no `release_proxy` or `cancel_proxy` tool. Proxy GB is a consumable balance, not a leasable/cancellable resource: once bought it's drawn down by usage, not returned. Do not assume a release/cancel flow exists; there is no backend route for it today.

A tenth, related tool, `virtualsms_list_proxy_locations`, lists the valid cities/states/ASNs/ZIP codes for a pool type + country, so you can discover valid `location_code` values before calling `generate_proxy_endpoint` or `set_proxy_targeting` with sub-country targeting. It's a public/no-purchase-required lookup and ships alongside the 9 tools above.

## Tool reference

### `virtualsms_list_proxy_catalog`
No input. Returns pool types, countries, and price-per-GB. Read-only, idempotent.

### `virtualsms_buy_proxy`
| Param | Required | Description |
|---|---|---|
| `pool_type` | yes | `residential`, `residential_premium`, `mobile`, or `datacenter` |
| `gb` | yes | Amount of traffic to add, in GB |
| `country_code` | no | ISO-2 soft preference for provisioning (e.g. `us`, `gb`), not per-connection targeting; use `generate_proxy_endpoint` for that |
| `idempotency_key` | no | Safe-retry key to avoid double charges |

Not idempotent, not read-only (it spends balance).

### `virtualsms_list_proxies`
No input. Returns all proxies on the account with remaining GB + credentials. Read-only, idempotent.

### `virtualsms_set_proxy_targeting`
| Param | Required | Description |
|---|---|---|
| `proxy_id` | yes | From `list_proxies` or `buy_proxy` |
| `country_code` | yes | ISO-2 country code |
| `cities` | no | City slugs; triggers 2x billing on non-premium pools |
| `asns` | no | ASN numbers; triggers 2x billing on non-premium pools |

Country-only targeting is free. Adding cities/ASNs bills the proxy's own GB at 2x on `residential` / `datacenter` / `mobile`, but **free** on `residential_premium`, where refined targeting is included. This sets the *stored default* on the proxy sub-user; for a one-off connection string with any targeting (including state/zip), use `generate_proxy_endpoint` instead.

### `virtualsms_generate_proxy_endpoint`
| Param | Required | Description |
|---|---|---|
| `proxy_id` | yes | From `list_proxies` or `buy_proxy` |
| `country_code` | yes | ISO-2 country to target |
| `target_by` | no | `country` (default), `state`, `city`, `zip`, or `asn` |
| `location_code` | required when `target_by` ≠ `country` | Value matching `target_by`; use `list_proxy_locations` to discover valid values |
| `session` | no | `rotating` (default, new IP per connection) or `sticky` (holds one IP) |
| `sticky_ttl_minutes` | no | How long a sticky session holds its IP (default 10) |
| `count` | no | How many endpoint strings to generate (default 1) |
| `protocol` | no | `HTTP` (default) or `SOCKS5` |
| `format` | no | `host:port:user:pass` (default), `user:pass@host:port`, or `curl` |

Nothing is purchased or changed server-side; this only composes a connection string from the proxy's existing credentials (same convention as the VirtualSMS dashboard's endpoint generator). Sub-country targeting (state/city/zip/asn) bills the proxy's own GB at 2x on non-premium pools, free on `residential_premium`. Read-only in the sense that it doesn't mutate account state, but it does consume GB when sub-country targeting is used.

### `virtualsms_test_proxy`
| Param | Required | Description |
|---|---|---|
| `proxy_id` | yes | From `list_proxies` or `buy_proxy` |
| `country` | yes | ISO-2 country to test the exit IP through |
| `session` | no | `rotating` (default) or `sticky` |
| `protocol` | no | `http` (default) or `socks5` |

Makes one real request through the proxy and reports exit IP, country, city, ISP, and latency. Consumes a small amount of GB. Rate-limited to about once per 20 seconds per proxy.

### `virtualsms_rotate_proxy`
| Param | Required | Description |
|---|---|---|
| `proxy_id` | yes | From `list_proxies` or `buy_proxy` |
| `port` | no | Specific proxy port; defaults to the rotating HTTP port |

Requests a fresh exit IP for an existing proxy, useful when an endpoint flags the current IP.

### `virtualsms_get_proxy_usage`
| Param | Required | Description |
|---|---|---|
| `proxy_id` | yes | From `list_proxies` or `buy_proxy` |

Cheap, cached read (no upstream call): GB used/remaining and request count, refreshed ~every 5 minutes.

### `virtualsms_get_proxy_usage_history`
| Param | Required | Description |
|---|---|---|
| `proxy_id` | yes | From `list_proxies` or `buy_proxy` |
| `range` | no | `7d` (default) or `30d` |

Per-day traffic (GB) and request-count series over the window.

### `virtualsms_list_proxy_locations` (bonus: targeting lookup)
| Param | Required | Description |
|---|---|---|
| `pool_type` | yes | `residential`, `mobile`, or `datacenter`; **not available for `residential_premium`** |
| `country` | yes | ISO-2 country code |
| `kind` | yes | `cities`, `states`, `asns`, or `zipcodes` |

Public endpoint, no purchase required. Use this to discover valid `location_code` values before calling `generate_proxy_endpoint` or `set_proxy_targeting` with sub-country targeting.

## Typical flow

```
virtualsms_list_proxy_catalog()
# → pick a pool_type + country

virtualsms_buy_proxy(pool_type: "residential", gb: 5, country_code: "us")
# → { proxy_id: "...", credentials: {...}, balance_usd: ... }

virtualsms_list_proxy_locations(pool_type: "residential", country: "US", kind: "cities")
# → discover a valid location_code

virtualsms_generate_proxy_endpoint(proxy_id: "...", country_code: "us", target_by: "city", location_code: "new-york", protocol: "HTTP")
# → ready-to-use connection string

virtualsms_test_proxy(proxy_id: "...", country: "us")
# → confirms exit IP/country/latency

virtualsms_get_proxy_usage(proxy_id: "...")
# → check remaining GB before the next session
```

## See also

- [README.md](../README.md): MCP server overview, SMS/order tools, install instructions
- Positioning: numbers + proxies + private cloud browser are one connected verification workflow, not standalone products
