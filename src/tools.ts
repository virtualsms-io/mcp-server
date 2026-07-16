import { z } from 'zod';
import WebSocket from 'ws';
import { type IVirtualSMSClient, type Rental } from './client.js';

// ─── Input Schemas ───────────────────────────────────────────────────────────

export const CheckPriceInput = z.object({
  service: z.string().describe('Service code (e.g. "telegram", "whatsapp", "google")'),
  country: z.string().describe('Country ISO code (e.g. "US", "GB", "RU") or country name'),
});

export const BuyNumberInput = z.object({
  service: z.string().describe('Service code (e.g. "telegram", "whatsapp", "google")'),
  country: z.string().describe('Country ISO code (e.g. "US", "GB", "RU")'),
});

export const CheckSmsInput = z.object({
  order_id: z.string().describe('Order ID returned from buy_number'),
});

export const CancelOrderInput = z.object({
  order_id: z.string().describe('Order ID to cancel'),
});

export const SwapNumberInput = z.object({
  order_id: z.string().describe('Order ID to swap — must be in waiting/created status with no SMS received'),
});

export const WaitForCodeInput = z.object({
  order_id: z.string().describe('Existing order ID returned from create_order — the tool waits for SMS on this order.'),
  timeout_seconds: z.number()
    .int()
    .min(5)
    .max(600)
    .default(60)
    .describe('How long to wait for SMS in seconds (default: 60, min: 5, max: 600)'),
});

export const FindCheapestInput = z.object({
  service: z.string().describe('Service code (e.g. "telegram", "whatsapp", "google")'),
  limit: z.number().int().min(1).max(50).default(5).describe('Number of cheapest options to return (default: 5)'),
});

export const SearchServiceInput = z.object({
  query: z.string().describe('Natural language search query (e.g. "uber", "whatsapp", "binance", "steam")'),
});

export const ActiveOrdersInput = z.object({
  status: z.string().optional().describe('Optional status filter: "pending", "sms_received", "cancelled", "completed"'),
});

export const GetOrderInput = z.object({
  order_id: z.string().describe('Order ID to retrieve full details for'),
});

export const OrderHistoryInput = z.object({
  status: z.string().optional().describe('Optional status filter: "completed", "cancelled", "expired", "sms_received", "waiting"'),
  service: z.string().optional().describe('Optional service code filter (e.g. "telegram", "whatsapp")'),
  country: z.string().optional().describe('Optional country ISO code filter (e.g. "US", "GB")'),
  since_days: z.number().int().min(1).max(365).optional().describe('Only include orders from the last N days'),
  limit: z.number().int().min(1).max(50).default(20).describe('Max orders to return (default: 20, server cap: 50)'),
});

export const CancelAllOrdersInput = z.object({});

export const GetStatsInput = z.object({
  since_days: z.number().int().min(1).max(365).default(30).describe('Window in days for activity stats (default: 30)'),
});

export const GetProfileInput = z.object({});

export const GetTransactionsInput = z.object({
  type: z.enum(['deposit', 'purchase', 'refund', 'admin_credit']).optional().describe('Filter by transaction type'),
  from: z.string().optional().describe('Lower bound on created_at — RFC3339 timestamp or YYYY-MM-DD'),
  to: z.string().optional().describe('Upper bound on created_at — RFC3339 timestamp or YYYY-MM-DD'),
  limit: z.number().int().min(1).max(200).default(50).describe('Max transactions to return (1-200, default: 50)'),
  offset: z.number().int().min(0).default(0).describe('Pagination offset (default: 0)'),
});

export const BuyProxyInput = z.object({
  pool_type: z.enum(['residential', 'residential_premium', 'mobile', 'datacenter'])
    .describe('Proxy pool type'),
  gb: z.number().positive().describe('How many GB to add to the proxy account'),
  country_code: z.string().optional().describe('Optional ISO-2 country hint (e.g. "us", "gb")'),
  idempotency_key: z.string().optional().describe('Optional idempotency key for safe retries'),
});

export const RotateProxyInput = z.object({
  proxy_id: z.string().describe('Proxy ID returned by list_proxies or buy_proxy'),
  port: z.number().int().positive().optional().describe('Optional proxy port (defaults to rotating HTTP port)'),
});

export const GetProxyUsageInput = z.object({
  proxy_id: z.string().describe('Proxy ID returned by list_proxies or buy_proxy'),
});

export const GetProxyUsageHistoryInput = z.object({
  proxy_id: z.string().describe('Proxy ID returned by list_proxies or buy_proxy'),
  range: z.enum(['7d', '30d']).optional().describe('History window (default: 7d)'),
});

export const SetProxyTargetingInput = z.object({
  proxy_id: z.string().describe('Proxy ID returned by list_proxies or buy_proxy'),
  country_code: z.string().describe('ISO-2 country code (required — sets the default targeting country)'),
  cities: z.array(z.string()).optional().describe('Optional city slugs to persist as default targeting. Triggers 2x GB billing on non-premium pools (free on residential_premium).'),
  asns: z.array(z.number().int()).optional().describe('Optional ASN numbers to persist as default targeting. Triggers 2x GB billing on non-premium pools (free on residential_premium).'),
});

export const TestProxyInput = z.object({
  proxy_id: z.string().describe('Proxy ID returned by list_proxies or buy_proxy'),
  country: z.string().describe('ISO-2 country code to test the exit IP through (e.g. "us", "gb")'),
  session: z.enum(['rotating', 'sticky']).optional().describe('Connection session type (default: rotating). Sticky holds one exit IP for ~30 min.'),
  protocol: z.enum(['http', 'socks5']).optional().describe('Protocol to test (default: http)'),
});

export const ListProxyLocationsInput = z.object({
  pool_type: z.enum(['residential', 'mobile', 'datacenter']).describe('Pool type (residential_premium is not supported by this endpoint)'),
  country: z.string().describe('ISO-2 country code (e.g. "US", "DE")'),
  kind: z.enum(['cities', 'states', 'asns', 'zipcodes']).describe('Which location dimension to list'),
});

export const GenerateProxyEndpointInput = z.object({
  proxy_id: z.string().describe('Proxy ID returned by list_proxies or buy_proxy — its login/password/host are reused, nothing new is purchased'),
  country_code: z.string().describe('ISO-2 country to target (e.g. "us", "gb") — required before any sub-country refinement'),
  target_by: z.enum(['country', 'state', 'city', 'zip', 'asn']).optional().describe('Refinement level (default: country). state/city/zip/asn trigger 2x GB billing on non-premium pools — free on residential_premium.'),
  location_code: z.string().optional().describe('Location value matching target_by (e.g. a city slug, state slug, ZIP, or ASN number) — required when target_by is not "country"'),
  session: z.enum(['rotating', 'sticky']).optional().describe('rotating = new IP per connection (default). sticky = holds one IP per generated endpoint for sticky_ttl_minutes.'),
  sticky_ttl_minutes: z.number().int().min(1).max(120).optional().describe('How long a sticky session holds its IP, in minutes (default: 10, only used when session=sticky)'),
  count: z.number().int().min(1).max(100).optional().describe('How many endpoint strings to generate (default: 1). For sticky sessions each gets a distinct IP.'),
  protocol: z.enum(['HTTP', 'SOCKS5']).optional().describe('Proxy protocol (default: HTTP)'),
  format: z.enum(['host:port:user:pass', 'user:pass@host:port', 'curl']).optional().describe('Output string format (default: host:port:user:pass)'),
});

export const StartManualRegistrationSessionInput = z.object({
  service_name: z.string().optional().describe('Friendly service name (e.g. telegram, whatsapp) — influences default device profile'),
  country: z.string().optional().describe('ISO-2 country code when attaching a matching proxy (e.g. id, de)'),
  device_mode: z.enum(['desktop', 'mobile']).optional().describe('Browser viewport profile (auto-picked from service when omitted)'),
  with_proxy: z.boolean().optional().describe('Attach matching VSMS proxy (default: true when country is set)'),
  target_url: z.string().optional().describe('Optional first navigation target for generic prep'),
  order_id: z.string().optional().describe('Existing activation order UUID to attach'),
  mode: z.enum(['attach', 'fresh']).optional().describe('attach = reuse active session if present; fresh = new session (default fresh)'),
  run_prep: z.boolean().optional().describe('Run scripted prep immediately after start (default false)'),
  prep_preset: z.enum(['generic', 'telegram']).optional().describe('Prep preset when run_prep is true (default generic)'),
});

// ─── Session-drive tools (gated behind VIRTUALSMS_ENABLE_SESSIONS) ───────────

export const StopSessionInput = z.object({
  session_id: z.string().describe('Browser session ID to stop'),
});

export const NavigateSessionInput = z.object({
  session_id: z.string().describe('Active browser session ID to navigate'),
  url: z.string().describe('URL to navigate the session to'),
});

export const SessionViewerInput = z.object({
  session_id: z.string().describe('Browser session ID to get the live viewer URL for'),
});

// ─── Rentals input schemas ────────────────────────────────────────────────────
// Two rental tiers, reflected generically:
//   full_access — local SIM inventory, any service, no refund countdown
//   platform    — our global supplier network, one service per number, 20-min refund window

export const RentalsPricingInput = z.object({});

export const RentalsAvailableInput = z.object({
  country: z.string().optional().describe('Optional ISO-2 country filter (e.g. "DE")'),
  service: z.string().optional().describe('Optional service code filter (full_access tier only)'),
  type: z.enum(['service', 'full']).optional().describe('Optional full_access sub-type filter'),
  tier: z.enum(['full_access', 'platform']).optional().describe('Which tier to list countries for (default: full_access)'),
});

export const RentalsServicesInput = z.object({
  country_code: z.string().describe('ISO-2 country code (e.g. "GR") — platform tier only'),
  duration_hours: z.number().int().optional().describe('Duration in hours (default: 24)'),
});

export const RentalsPriceInput = z.object({
  service: z.string().describe('Service code'),
  country_code: z.string().describe('ISO-2 country code'),
  duration_hours: z.number().int().describe('Duration in hours'),
});

export const CreateRentalInput = z.object({
  tier: z.enum(['full_access', 'platform']).describe('full_access = local SIM, any service, no refund countdown. platform = our global supplier network, one service per number, 20-min refund window.'),
  country: z.string().describe('ISO-2 country code (e.g. "DE")'),
  duration_hours: z.number().int().describe('Duration in hours. full_access: whatever rentals_pricing lists (e.g. 24/168/720). platform: 24, 72, or 168 only.'),
  service: z.string().optional().describe('Service code — required for platform tier and for full_access "service" sub-type; omit for full_access "full" (any-service) rentals'),
  auto_renew: z.boolean().optional().describe('full_access tier only — auto-renew at expiry (default: false)'),
});

export const ListRentalsInput = z.object({
  status: z.string().optional().describe('Optional status filter: "active", "cancelled", "completed", "expired", or "all" (default: "active")'),
});

export const GetRentalInput = z.object({
  rental_id: z.string().describe('Rental ID to retrieve'),
});

export const ExtendRentalInput = z.object({
  rental_id: z.string().describe('Rental ID to extend'),
  duration_hours: z.number().int().describe('Additional duration in hours to add'),
});

export const CancelRentalInput = z.object({
  rental_id: z.string().describe('Rental ID to cancel — full refund, only eligible within 20 minutes of purchase and before any SMS is received. Works for either tier.'),
});

export const ReleaseRentalInput = z.object({
  rental_id: z.string().describe('Rental ID to release early — Full Access (local) tier only, pro-rated refund, requires a 2-hour minimum hold since purchase'),
});

export const RetryOrderInput = z.object({
  order_id: z.string().describe('Order ID to request a fresh SMS resend on (same phone number — use swap_number instead for a new number)'),
});

export const CheckNumberInput = z.object({
  number: z.string().describe('Phone number in E.164 format (e.g. "+447911123456") to look up carrier + line-type info for'),
});

// ─── Tool Definitions ────────────────────────────────────────────────────────

export const TOOL_DEFINITIONS = [
  {
    name: 'virtualsms_list_proxy_catalog',
    title: 'List Proxy Catalog',
    description:
      'List available proxy pool types, countries, and price-per-GB. ' +
      'Use this before buying proxy traffic.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
    annotations: {
      title: 'List Proxy Catalog',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_list_proxies',
    title: 'List My Proxies',
    description:
      'List all proxies on your account with remaining GB and login credentials.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
    annotations: {
      title: 'List My Proxies',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_buy_proxy',
    title: 'Buy Proxy GB',
    description:
      'Purchase proxy traffic (GB) for a selected pool type. Returns proxy credentials and remaining balance. ' +
      'country_code here is only a soft preference for provisioning — for actual per-connection targeting ' +
      '(country/state/city/zip/asn) or a ready-to-use connection string, use virtualsms_generate_proxy_endpoint ' +
      'after buying. To persist a default targeting on the sub-user, use virtualsms_set_proxy_targeting.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        pool_type: {
          type: 'string',
          description: 'Pool type: residential, residential_premium, mobile, datacenter',
        },
        gb: {
          type: 'number',
          description: 'Amount of traffic to add in GB',
        },
        country_code: {
          type: 'string',
          description: 'Optional ISO-2 country preference (e.g. us, gb)',
        },
        idempotency_key: {
          type: 'string',
          description: 'Optional key for safe retries without double charges',
        },
      },
      required: ['pool_type', 'gb'],
    },
    annotations: {
      title: 'Buy Proxy GB',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_rotate_proxy',
    title: 'Rotate Proxy IP',
    description:
      'Request a fresh IP for an existing proxy. Useful when an endpoint flags the current exit IP.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        proxy_id: {
          type: 'string',
          description: 'Proxy ID returned by list_proxies or buy_proxy',
        },
        port: {
          type: 'number',
          description: 'Optional proxy port. Defaults to rotating HTTP port.',
        },
      },
      required: ['proxy_id'],
    },
    annotations: {
      title: 'Rotate Proxy IP',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_get_proxy_usage',
    title: 'Get Proxy Usage',
    description:
      'Get cached GB used/remaining and request count for one proxy. Cheap, no upstream call — reads a cached value refreshed every ~5 minutes.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        proxy_id: { type: 'string', description: 'Proxy ID returned by list_proxies or buy_proxy' },
      },
      required: ['proxy_id'],
    },
    annotations: {
      title: 'Get Proxy Usage',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_get_proxy_usage_history',
    title: 'Get Proxy Usage History',
    description:
      'Get a per-day traffic (GB) and request-count series for one proxy over the last 7 or 30 days.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        proxy_id: { type: 'string', description: 'Proxy ID returned by list_proxies or buy_proxy' },
        range: { type: 'string', enum: ['7d', '30d'], description: 'History window (default: 7d)' },
      },
      required: ['proxy_id'],
    },
    annotations: {
      title: 'Get Proxy Usage History',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_set_proxy_targeting',
    title: 'Set Proxy Default Targeting',
    description:
      'Persist a default geo-targeting (country, and optionally cities/ASNs) on an existing proxy sub-user. ' +
      'Country-only is free. Adding cities or ASNs bills the GB on your OWN allocation at 2x (not on ' +
      'residential_premium, where refined targeting is included free). This changes the STORED default — for a ' +
      'one-off connection string with any targeting (including state/zip), use virtualsms_generate_proxy_endpoint instead.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        proxy_id: { type: 'string', description: 'Proxy ID returned by list_proxies or buy_proxy' },
        country_code: { type: 'string', description: 'ISO-2 country code (required)' },
        cities: { type: 'array', items: { type: 'string' }, description: 'Optional city slugs — triggers 2x billing on non-premium pools' },
        asns: { type: 'array', items: { type: 'number' }, description: 'Optional ASN numbers — triggers 2x billing on non-premium pools' },
      },
      required: ['proxy_id', 'country_code'],
    },
    annotations: {
      title: 'Set Proxy Default Targeting',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_test_proxy',
    title: 'Test Proxy Connectivity',
    description:
      'Make one request through a proxy and report the exit IP, country, city, ISP, and latency — proves the proxy ' +
      'works and which country it exits from. Consumes a small amount of the proxy\'s GB allocation. ' +
      'Rate-limited to about once per 20 seconds per proxy.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        proxy_id: { type: 'string', description: 'Proxy ID returned by list_proxies or buy_proxy' },
        country: { type: 'string', description: 'ISO-2 country to test the exit IP through (e.g. "us", "gb")' },
        session: { type: 'string', enum: ['rotating', 'sticky'], description: 'Connection session type (default: rotating)' },
        protocol: { type: 'string', enum: ['http', 'socks5'], description: 'Protocol to test (default: http)' },
      },
      required: ['proxy_id', 'country'],
    },
    annotations: {
      title: 'Test Proxy Connectivity',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_list_proxy_locations',
    title: 'List Proxy Locations',
    description:
      'List available cities, states, ASNs, or ZIP codes for a pool type + country — use this to discover valid ' +
      'location_code values before calling virtualsms_generate_proxy_endpoint or virtualsms_set_proxy_targeting ' +
      'with sub-country targeting. Public endpoint, no purchase required. Not available for residential_premium ' +
      '(only residential, mobile, datacenter).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        pool_type: { type: 'string', enum: ['residential', 'mobile', 'datacenter'], description: 'Pool type' },
        country: { type: 'string', description: 'ISO-2 country code (e.g. "US", "DE")' },
        kind: { type: 'string', enum: ['cities', 'states', 'asns', 'zipcodes'], description: 'Which location dimension to list' },
      },
      required: ['pool_type', 'country', 'kind'],
    },
    annotations: {
      title: 'List Proxy Locations',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_generate_proxy_endpoint',
    title: 'Generate Proxy Connection Endpoint',
    description:
      'Build ready-to-use proxy connection string(s) for an owned proxy — country/state/city/zip/asn targeting, ' +
      'rotating or sticky session, HTTP or SOCKS5, in host:port:user:pass / user:pass@host:port / curl format. ' +
      'Nothing is purchased or changed server-side — this only composes a connection string from the proxy\'s ' +
      'existing credentials (same convention as the VirtualSMS dashboard\'s endpoint generator). Sub-country ' +
      'targeting (state/city/zip/asn) bills the proxy\'s own GB at 2x on non-premium pools, free on residential_premium.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        proxy_id: { type: 'string', description: 'Proxy ID returned by list_proxies or buy_proxy' },
        country_code: { type: 'string', description: 'ISO-2 country to target (e.g. "us", "gb")' },
        target_by: { type: 'string', enum: ['country', 'state', 'city', 'zip', 'asn'], description: 'Refinement level (default: country)' },
        location_code: { type: 'string', description: 'Location value matching target_by — required when target_by is not "country"' },
        session: { type: 'string', enum: ['rotating', 'sticky'], description: 'rotating = new IP per connection (default). sticky = holds one IP per generated endpoint.' },
        sticky_ttl_minutes: { type: 'number', description: 'How long a sticky session holds its IP, in minutes (default: 10)' },
        count: { type: 'number', description: 'How many endpoint strings to generate (default: 1)' },
        protocol: { type: 'string', enum: ['HTTP', 'SOCKS5'], description: 'Proxy protocol (default: HTTP)' },
        format: { type: 'string', enum: ['host:port:user:pass', 'user:pass@host:port', 'curl'], description: 'Output string format (default: host:port:user:pass)' },
      },
      required: ['proxy_id', 'country_code'],
    },
    annotations: {
      title: 'Generate Proxy Connection Endpoint',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'virtualsms_start_manual_registration_session',
    title: 'Start Manual Registration Session',
    description:
      'Start a private cloud-browser session for manual signup/verification. Returns debug_url for live takeover, optional order phone number, and timeline. Pair with create_order for OTP + browser in one agent flow.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        service_name: { type: 'string', description: 'Service hint (telegram, whatsapp, …)' },
        country: { type: 'string', description: 'ISO-2 country for proxy match' },
        device_mode: { type: 'string', enum: ['desktop', 'mobile'], description: 'Viewport profile' },
        with_proxy: { type: 'boolean', description: 'Attach matching VSMS proxy' },
        target_url: { type: 'string', description: 'URL for generic prep' },
        order_id: { type: 'string', description: 'Activation order UUID to attach' },
        mode: { type: 'string', enum: ['attach', 'fresh'], description: 'Session attach mode' },
        run_prep: { type: 'boolean', description: 'Run prep after start' },
        prep_preset: { type: 'string', enum: ['generic', 'telegram'], description: 'Prep preset' },
      },
      required: [],
    },
    annotations: {
      title: 'Start Manual Registration Session',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_list_services',
    title: 'List Available Services',
    description:
      'Get all available SMS verification services (Telegram, WhatsApp, Google, etc.). ' +
      'Use this to discover valid service codes before buying a number.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        search: {
          type: 'string',
          description: 'Filter services by name (optional)',
        },
      },
      required: [],
    },
    annotations: {
      title: 'List Available Services',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_list_countries',
    title: 'List Available Countries',
    description:
      'Get all available countries for SMS verification. ' +
      'Use this to discover valid country codes before buying a number.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        service: {
          type: 'string',
          description: 'Filter countries available for a specific service (optional)',
        },
      },
      required: [],
    },
    annotations: {
      title: 'List Available Countries',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_get_price',
    title: 'Check Service Price',
    description:
      'Check the price and availability for a specific service + country combination. ' +
      'Always check price before buying to confirm availability.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        service: {
          type: 'string',
          description: 'Service code (e.g. "telegram", "whatsapp", "google")',
        },
        country: {
          type: 'string',
          description: 'Country ISO code (e.g. "US", "GB", "RU")',
        },
      },
      required: ['service', 'country'],
    },
    annotations: {
      title: 'Check Service Price',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_get_balance',
    title: 'Get Account Balance',
    description:
      'Check your VirtualSMS account balance in USD. ' +
      'Requires VIRTUALSMS_API_KEY to be set.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        currency: {
          type: 'string',
          description: 'Display balance in specific currency (default: USD)',
        },
      },
      required: [],
    },
    annotations: {
      title: 'Get Account Balance',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_create_order',
    title: 'Buy Virtual Number',
    description:
      'Purchase a virtual phone number for SMS verification. ' +
      'Returns order_id and phone_number. ' +
      'Codes typically arrive within ~10-60 seconds after purchase. ' +
      'Use check_sms to poll for the verification code, or use wait_for_sms to block until it arrives.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        service: {
          type: 'string',
          description: 'Service code (e.g. "telegram", "whatsapp", "google")',
        },
        country: {
          type: 'string',
          description: 'Country ISO code (e.g. "US", "GB", "RU")',
        },
      },
      required: ['service', 'country'],
    },
    annotations: {
      title: 'Buy Virtual Number',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_get_sms',
    title: 'Check SMS Code',
    description:
      'Check if an SMS verification code has been received for an order. ' +
      'Returns status, phone_number, and (when delivered) messages[] array plus an extracted code. ' +
      'Poll this every 5-10 seconds after buying a number, or use wait_for_sms to block until delivery.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        order_id: {
          type: 'string',
          description: 'Order ID returned from buy_number',
        },
      },
      required: ['order_id'],
    },
    annotations: {
      title: 'Check SMS Code',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_cancel_order',
    title: 'Cancel Order',
    description:
      'Cancel an order and request a refund. ' +
      'Only works if no SMS has been received yet. ' +
      'Use this if the service is taking too long or you want to try a different number. ' +
      '**Cooldown:** cancel is only available 120 seconds after purchase. ' +
      'Check `cancel_available_at` on the order before calling. ' +
      'Calling earlier returns a `cooldown_active` error from this MCP server (no backend round-trip).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        order_id: {
          type: 'string',
          description: 'Order ID to cancel',
        },
      },
      required: ['order_id'],
    },
    annotations: {
      title: 'Cancel Order',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_wait_for_sms',
    title: 'Wait for SMS on Existing Order',
    description:
      'Wait (block) until the SMS arrives on an existing order_id, or until timeout. ' +
      'Codes typically arrive within ~10-60 seconds. ' +
      'This call BLOCKS for up to timeout_seconds (default 60, max 600) before returning. ' +
      'Uses real-time WebSocket delivery with automatic polling fallback. ' +
      'Pass an order_id from create_order. To buy AND wait in one step, call create_order then this tool.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        order_id: {
          type: 'string',
          description: 'Existing order ID returned from create_order',
        },
        timeout_seconds: {
          type: 'number',
          description: 'How long to wait for SMS in seconds (default: 60, min: 5, max: 600)',
          default: 60,
          minimum: 5,
          maximum: 600,
        },
      },
      required: ['order_id'],
    },
    annotations: {
      title: 'Wait for SMS on Existing Order',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_find_cheapest',
    title: 'Find Cheapest Countries',
    description:
      'Find the cheapest countries for a given service, sorted by price. ' +
      'Returns available countries with prices and stock levels so you can pick the best deal.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        service: {
          type: 'string',
          description: 'Service code (e.g. "telegram", "whatsapp", "google")',
        },
        limit: {
          type: 'number',
          description: 'Number of cheapest options to return (default: 5)',
          default: 5,
        },
      },
      required: ['service'],
    },
    annotations: {
      title: 'Find Cheapest Countries',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_search_services',
    title: 'Search Service by Name',
    description:
      'Find the right service code using natural language. ' +
      'Don\'t know the exact code? Just search "uber", "binance", "steam" etc. ' +
      'Returns matching services with similarity scores.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query (e.g. "uber", "whatsapp", "binance")',
        },
      },
      required: ['query'],
    },
    annotations: {
      title: 'Search Service by Name',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_swap_number',
    title: 'Swap Phone Number',
    description:
      'Swap a phone number on an existing order. Gets a new number for the same service and country without additional charge. ' +
      'Use when the current number isn\'t receiving SMS. ' +
      '**Cooldown:** swap is only available 120 seconds after purchase. ' +
      'Check `swap_available_at` on the order before calling. ' +
      'Calling earlier returns a `cooldown_active` error from this MCP server (no backend round-trip).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        order_id: {
          type: 'string',
          description: 'Order ID to swap — must be in waiting/created status with no SMS received',
        },
      },
      required: ['order_id'],
    },
    annotations: {
      title: 'Swap Phone Number',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_list_orders',
    title: 'List Active Orders',
    description:
      'List your active orders. Essential for crash recovery — if your session was interrupted, ' +
      'use this to find pending orders and their phone numbers, then use check_sms to retrieve codes.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          description: 'Optional status filter: "pending", "sms_received", "cancelled", "completed"',
        },
      },
      required: [],
    },
    annotations: {
      title: 'List Active Orders',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_get_order',
    title: 'Get Order Details',
    description:
      'Get the full details of a specific order, including status, phone number, service, country, ' +
      'timestamps, and any received SMS code/text. Use this when you have an order_id and need the ' +
      'latest state beyond what check_sms returns.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        order_id: {
          type: 'string',
          description: 'Order ID to retrieve full details for',
        },
      },
      required: ['order_id'],
    },
    annotations: {
      title: 'Get Order Details',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_cancel_all_orders',
    title: 'Cancel All Active Orders',
    description:
      'Bulk-cancel every currently active order in your account. Returns the number of orders ' +
      'cancelled plus any failures. Useful for quick cleanup after a batch run or test session.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
    annotations: {
      title: 'Cancel All Active Orders',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_order_history',
    title: 'Order History',
    description:
      'List past orders with optional filters for status, service, country, and a lookback window in days. ' +
      'Returns up to 50 orders (server cap) ordered most-recent-first.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          description: 'Optional status filter: "completed", "cancelled", "expired", "sms_received", "waiting"',
        },
        service: {
          type: 'string',
          description: 'Optional service code filter (e.g. "telegram", "whatsapp")',
        },
        country: {
          type: 'string',
          description: 'Optional country ISO code filter (e.g. "US", "GB")',
        },
        since_days: {
          type: 'number',
          description: 'Only include orders from the last N days',
        },
        limit: {
          type: 'number',
          description: 'Max orders to return (default: 20, server cap: 50)',
          default: 20,
        },
      },
      required: [],
    },
    annotations: {
      title: 'Order History',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_get_stats',
    title: 'Get Account Stats',
    description:
      'Account usage stats aggregated from your order history: total orders, success rate, total spend, ' +
      'top services/countries, and status breakdown over a configurable lookback window.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        since_days: {
          type: 'number',
          description: 'Window in days for activity stats (default: 30)',
          default: 30,
        },
      },
      required: [],
    },
    annotations: {
      title: 'Get Account Stats',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_get_profile',
    title: 'Get Account Profile',
    description:
      'Full account profile: email, Telegram link status, current balance, lifetime spend, total orders, ' +
      'active API keys, and account creation date.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
    annotations: {
      title: 'Get Account Profile',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_get_transactions',
    title: 'Get Transaction History',
    description:
      'Transaction history for the account with optional filters for type, date range, and pagination. ' +
      'Types: "deposit", "purchase", "refund", "admin_credit".',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          description: 'Filter by type: "deposit", "purchase", "refund", "admin_credit"',
        },
        from: {
          type: 'string',
          description: 'Lower bound on created_at — RFC3339 or YYYY-MM-DD',
        },
        to: {
          type: 'string',
          description: 'Upper bound on created_at — RFC3339 or YYYY-MM-DD',
        },
        limit: {
          type: 'number',
          description: 'Max transactions (1-200, default: 50)',
          default: 50,
        },
        offset: {
          type: 'number',
          description: 'Pagination offset (default: 0)',
          default: 0,
        },
      },
      required: [],
    },
    annotations: {
      title: 'Get Transaction History',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'virtualsms_rentals_pricing',
    title: 'List Rental Pricing Tiers',
    description:
      'List all active rental pricing tiers (Full Access tier — local SIM inventory, durations and prices). ' +
      'Use rentals_price for platform-tier (per-country, per-service) pricing instead.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] },
    annotations: { title: 'List Rental Pricing Tiers', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'virtualsms_rentals_available',
    title: 'List Rental Country Availability',
    description:
      'List countries with rental stock, available counts, and pricing. tier=full_access (default) shows local-SIM ' +
      'inventory; tier=platform shows countries available via our global supplier network (with per-country service ' +
      'counts and popular services). Use this before creating a rental.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        country: { type: 'string', description: 'Optional ISO-2 country filter' },
        service: { type: 'string', description: 'Optional service filter (full_access tier only)' },
        type: { type: 'string', enum: ['service', 'full'], description: 'Optional full_access sub-type filter' },
        tier: { type: 'string', enum: ['full_access', 'platform'], description: 'Which tier to list (default: full_access)' },
      },
      required: [],
    },
    annotations: { title: 'List Rental Country Availability', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'virtualsms_rentals_services',
    title: 'List Platform-Tier Rental Services',
    description:
      'List services available for platform-tier rental in a given country, with physical stock counts and retail price. ' +
      'Platform-tier rentals are locked to ONE chosen service per number — use this to pick a valid service code before creating one.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        country_code: { type: 'string', description: 'ISO-2 country code (e.g. "GR")' },
        duration_hours: { type: 'number', description: 'Duration in hours (default: 24)' },
      },
      required: ['country_code'],
    },
    annotations: { title: 'List Platform-Tier Rental Services', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'virtualsms_rentals_price',
    title: 'Get Platform-Tier Rental Price',
    description: 'Get the catalog-driven retail price for a (service, country, duration) platform-tier rental combo.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        service: { type: 'string', description: 'Service code' },
        country_code: { type: 'string', description: 'ISO-2 country code' },
        duration_hours: { type: 'number', description: 'Duration in hours' },
      },
      required: ['service', 'country_code', 'duration_hours'],
    },
    annotations: { title: 'Get Platform-Tier Rental Price', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'virtualsms_create_rental',
    title: 'Create Rental',
    description:
      'Rent a phone number for an extended period (as opposed to a one-off number via create_order). Two tiers: ' +
      '"full_access" = local SIM inventory, works across ANY service on that number, no refund countdown (early ' +
      'release available after a 2h minimum hold). "platform" = sourced via our global supplier network, locked to ' +
      'ONE chosen service, durations 1/3/7 days only, with a 20-minute full-refund window. Check rentals_available ' +
      'and rentals_price/rentals_pricing first to confirm country/service/duration and cost.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tier: { type: 'string', enum: ['full_access', 'platform'], description: 'Rental tier' },
        country: { type: 'string', description: 'ISO-2 country code' },
        duration_hours: { type: 'number', description: 'Duration in hours (platform tier: 24, 72, or 168 only)' },
        service: { type: 'string', description: 'Service code — required for platform tier; optional for full_access' },
        auto_renew: { type: 'boolean', description: 'full_access tier only — auto-renew at expiry (default: false)' },
      },
      required: ['tier', 'country', 'duration_hours'],
    },
    annotations: { title: 'Create Rental', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: 'virtualsms_list_rentals',
    title: 'List My Rentals',
    description: 'List your rentals (both tiers), optionally filtered by status.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', description: 'Optional status filter: "active", "cancelled", "completed", "expired", or "all" (default: "active")' },
      },
      required: [],
    },
    annotations: { title: 'List My Rentals', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'virtualsms_get_rental',
    title: 'Get Rental Details',
    description: 'Get the full details of a specific rental by ID.',
    inputSchema: {
      type: 'object' as const,
      properties: { rental_id: { type: 'string', description: 'Rental ID to retrieve' } },
      required: ['rental_id'],
    },
    annotations: { title: 'Get Rental Details', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'virtualsms_extend_rental',
    title: 'Extend Rental',
    description: 'Extend an active rental by an additional duration. Charges your balance at the current catalog price for that duration.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        rental_id: { type: 'string', description: 'Rental ID to extend' },
        duration_hours: { type: 'number', description: 'Additional duration in hours to add' },
      },
      required: ['rental_id', 'duration_hours'],
    },
    annotations: { title: 'Extend Rental', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: 'virtualsms_cancel_rental',
    title: 'Cancel Rental',
    description:
      'Cancel a rental for a full refund. Only eligible within 20 minutes of purchase AND before any SMS has been ' +
      'received. Works for either tier. For a Full Access rental past the 20-minute window, use release_rental instead.',
    inputSchema: {
      type: 'object' as const,
      properties: { rental_id: { type: 'string', description: 'Rental ID to cancel' } },
      required: ['rental_id'],
    },
    annotations: { title: 'Cancel Rental', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'virtualsms_release_rental',
    title: 'Release Rental Early',
    description:
      'End a Full Access (local-tier) rental early for a pro-rated refund. Requires a 2-hour minimum hold since ' +
      'purchase. NOT available for platform-tier rentals — those run to their natural expiry or must be cancelled ' +
      'within the 20-minute window instead.',
    inputSchema: {
      type: 'object' as const,
      properties: { rental_id: { type: 'string', description: 'Rental ID to release' } },
      required: ['rental_id'],
    },
    annotations: { title: 'Release Rental Early', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  {
    name: 'virtualsms_retry_order',
    title: 'Retry Order (Resend SMS)',
    description:
      'Ask the provider to resend the SMS to the SAME phone number on an existing order (order must be in ' +
      'waiting/created status). Not all order types support this — some providers only support swap_number instead, ' +
      'which returns a NEW number.',
    inputSchema: {
      type: 'object' as const,
      properties: { order_id: { type: 'string', description: 'Order ID to retry' } },
      required: ['order_id'],
    },
    annotations: { title: 'Retry Order', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: 'virtualsms_check_number',
    title: 'Check Phone Number',
    description: 'Public carrier + line-type lookup for an arbitrary E.164 phone number (mobile/landline/VoIP, spam risk). No API key required.',
    inputSchema: {
      type: 'object' as const,
      properties: { number: { type: 'string', description: 'Phone number in E.164 format (e.g. "+447911123456")' } },
      required: ['number'],
    },
    annotations: { title: 'Check Phone Number', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  // ─── Session-drive tools — gated behind VIRTUALSMS_ENABLE_SESSIONS (default off) ───
  {
    name: 'virtualsms_stop_session',
    title: 'Stop Browser Session',
    description: 'Stop an active browser session and release it.',
    inputSchema: {
      type: 'object' as const,
      properties: { session_id: { type: 'string', description: 'Browser session ID to stop' } },
      required: ['session_id'],
    },
    annotations: { title: 'Stop Browser Session', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    requiresSessions: true,
  },
  {
    name: 'virtualsms_navigate_session',
    title: 'Navigate Browser Session',
    description: 'Navigate an active browser session to a URL.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Active browser session ID to navigate' },
        url: { type: 'string', description: 'URL to navigate the session to' },
      },
      required: ['session_id', 'url'],
    },
    annotations: { title: 'Navigate Browser Session', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    requiresSessions: true,
  },
  {
    name: 'virtualsms_session_viewer',
    title: 'Get Session Live Viewer',
    description: 'Get the live viewer URL and current status for an active browser session.',
    inputSchema: {
      type: 'object' as const,
      properties: { session_id: { type: 'string', description: 'Browser session ID to get the live viewer URL for' } },
      required: ['session_id'],
    },
    annotations: { title: 'Get Session Live Viewer', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    requiresSessions: true,
  },
];

// Marker used by index.ts / http-server.ts to gate the 3 session-drive tools
// above behind VIRTUALSMS_ENABLE_SESSIONS (default off). Tools with no
// `requiresSessions` marker are always served — unaffected by the flag.
export function getToolDefinitions(enableSessions: boolean) {
  if (enableSessions) return TOOL_DEFINITIONS;
  return TOOL_DEFINITIONS.filter((t) => !('requiresSessions' in t) || !t.requiresSessions);
}

// ─── Tool Handlers ────────────────────────────────────────────────────────────

export async function handleListServices(client: IVirtualSMSClient) {
  const services = await client.listServices();
  return jsonResult(services);
}

export async function handleListProxyCatalog(client: IVirtualSMSClient) {
  const catalog = await client.listProxyCatalog();
  return jsonResult(catalog);
}

export async function handleListProxies(client: IVirtualSMSClient) {
  const proxies = await client.listProxies();
  return jsonResult(proxies);
}

export async function handleBuyProxy(
  client: IVirtualSMSClient,
  args: z.infer<typeof BuyProxyInput>
) {
  const result = await client.purchaseProxy(args);
  return jsonResult(result);
}

export async function handleRotateProxy(
  client: IVirtualSMSClient,
  args: z.infer<typeof RotateProxyInput>
) {
  const result = await client.rotateProxy(args.proxy_id, args.port);
  return jsonResult(result);
}

export async function handleGetProxyUsage(
  client: IVirtualSMSClient,
  args: z.infer<typeof GetProxyUsageInput>
) {
  const result = await client.getProxyUsage(args.proxy_id);
  return jsonResult(result);
}

export async function handleGetProxyUsageHistory(
  client: IVirtualSMSClient,
  args: z.infer<typeof GetProxyUsageHistoryInput>
) {
  const result = await client.getProxyUsageHistory(args.proxy_id, args.range);
  return jsonResult(result);
}

export async function handleSetProxyTargeting(
  client: IVirtualSMSClient,
  args: z.infer<typeof SetProxyTargetingInput>
) {
  const result = await client.setProxyTargeting(args.proxy_id, {
    countryCode: args.country_code,
    cities: args.cities,
    asns: args.asns,
  });
  return jsonResult(result);
}

export async function handleTestProxy(
  client: IVirtualSMSClient,
  args: z.infer<typeof TestProxyInput>
) {
  const result = await client.testProxy(args.proxy_id, {
    country: args.country,
    session: args.session,
    protocol: args.protocol,
  });
  return jsonResult(result);
}

export async function handleListProxyLocations(
  client: IVirtualSMSClient,
  args: z.infer<typeof ListProxyLocationsInput>
) {
  const result = await client.listProxyLocations({
    poolType: args.pool_type,
    country: args.country,
    kind: args.kind,
  });
  return jsonResult(result);
}

export async function handleGenerateProxyEndpoint(
  client: IVirtualSMSClient,
  args: z.infer<typeof GenerateProxyEndpointInput>
) {
  if (args.target_by && args.target_by !== 'country' && !args.location_code?.trim()) {
    throw new Error(`location_code is required when target_by is "${args.target_by}"`);
  }
  const result = await client.generateProxyEndpoint({
    proxyId: args.proxy_id,
    countryCode: args.country_code,
    targetBy: args.target_by,
    locationCode: args.location_code,
    session: args.session,
    stickyTtlMinutes: args.sticky_ttl_minutes,
    count: args.count,
    protocol: args.protocol,
    format: args.format,
  });
  return jsonResult(result);
}

export async function handleStartManualRegistrationSession(
  client: IVirtualSMSClient,
  args: z.infer<typeof StartManualRegistrationSessionInput>
) {
  const session = await client.startManualRegistrationSession({
    serviceName: args.service_name,
    country: args.country,
    deviceMode: args.device_mode,
    withProxy: args.with_proxy,
    targetUrl: args.target_url,
    orderId: args.order_id,
    mode: args.mode,
  });

  if (args.run_prep && session.id) {
    const preset = args.prep_preset ?? (args.service_name?.toLowerCase() === 'telegram' ? 'telegram' : 'generic');
    const prepped = await client.prepBrowserSession(session.id, preset, args.target_url);
    return jsonResult({ session: prepped, prep_preset: preset });
  }

  return jsonResult({ session });
}

export async function handleListCountries(client: IVirtualSMSClient) {
  const countries = await client.listCountries();
  return jsonResult(countries);
}

export async function handleCheckPrice(
  client: IVirtualSMSClient,
  args: z.infer<typeof CheckPriceInput>
) {
  let price;
  try {
    price = await client.checkPrice(args.service, args.country);
  } catch (err) {
    const msg = (err as Error).message ?? '';
    // 404 or explicit unavailability → return clear user-facing message
    if (msg.includes('Not found') || msg.includes('404')) {
      return jsonResult({ available: false, message: 'Service/country combination not available' });
    }
    throw err;
  }

  // /api/v1/price returns no availability field, so real stock is sourced from the
  // catalog's per-country `count` (count>0 = in stock) — same source as find_cheapest
  // and the website. Fail closed if the combo isn't in stock or the lookup fails.
  try {
    const catalog = await client.getCatalogCountries(args.service);
    const row = catalog.find(
      (c) => c.iso.toUpperCase() === args.country.toUpperCase()
    );
    price.available = !!row && row.count > 0;
  } catch {
    // Keep checkPrice's fail-closed default (false) on catalog lookup error.
  }

  // Guard: if not in stock, don't pass through a misleading result
  if (!price.available) {
    return jsonResult({ available: false, message: 'Service/country combination not available' });
  }

  return jsonResult(price);
}

export async function handleGetBalance(client: IVirtualSMSClient) {
  const balance = await client.getBalance();
  return jsonResult(balance);
}

export async function handleBuyNumber(
  client: IVirtualSMSClient,
  args: z.infer<typeof BuyNumberInput>
) {
  const order = await client.createOrder(args.service, args.country);
  return jsonResult({
    order_id: order.order_id,
    phone_number: order.phone_number,
    expires_at: order.expires_at,
    status: order.status,
    tip: 'Codes typically arrive within ~10-60 seconds. Use check_sms to poll for the code, or wait_for_sms to block until it arrives. cancel_order to refund.',
  });
}

// Pull the most likely numeric verification code out of an SMS body.
// Heuristic: first 4-8 digit run wins (covers "SMS code: 666512", "Your code is 1234", etc.).
function extractCode(text: string): string | undefined {
  if (!text) return undefined;
  const m = text.match(/\b(\d{4,8})\b/);
  return m ? m[1] : undefined;
}

export async function handleCheckSms(
  client: IVirtualSMSClient,
  args: z.infer<typeof CheckSmsInput>
) {
  const order = await client.getOrder(args.order_id);

  // Normalize messages: prefer canonical messages[] from API; synthesize from
  // legacy sms_code/sms_text if needed so older responses still work.
  const messages = (order.messages && order.messages.length > 0)
    ? order.messages
    : (order.sms_text || order.sms_code)
      ? [{ content: order.sms_text || order.sms_code || '', sender: undefined, received_at: undefined }]
      : [];

  // Surface the most useful single field: extracted numeric code.
  const firstContent = messages[0]?.content;
  const code = order.sms_code || (firstContent ? extractCode(firstContent) : undefined);

  const result: Record<string, unknown> = {
    status: order.status,
    phone_number: order.phone_number,
  };
  if (messages.length > 0) result.messages = messages;
  if (code) result.code = code;
  // Backward-compat aliases — older consumers read these.
  if (code) result.sms_code = code;
  if (firstContent) result.sms_text = firstContent;

  return jsonResult(result);
}

// preCheckCooldown reads cancel_available_at / swap_available_at off an order
// and returns a cooldown_active payload if it's still in the future. Returns
// null when the action is allowed (or the field is missing on a legacy payload,
// in which case we let the backend make the call). Saves a 4xx round-trip on
// the typical "agent fires immediately after purchase" pattern.
function preCheckCooldown(
  availableAt: string | undefined,
  action: 'cancel' | 'swap'
): (ReturnType<typeof jsonResult> & { isError: boolean }) | null {
  if (!availableAt) return null;
  const availableMs = Date.parse(availableAt);
  if (!Number.isFinite(availableMs)) return null;
  const now = Date.now();
  if (now >= availableMs) return null;
  const waitSeconds = Math.ceil((availableMs - now) / 1000);
  return {
    ...jsonResult({
      error: 'cooldown_active',
      action,
      message: `${action === 'cancel' ? 'Cancel' : 'Swap'} cooldown active. Try again in ${waitSeconds} seconds.`,
      retry_at: availableAt,
      wait_seconds: waitSeconds,
    }),
    isError: true,
  };
}

export async function handleCancelOrder(
  client: IVirtualSMSClient,
  args: z.infer<typeof CancelOrderInput>
) {
  // Pre-check: fetch order to see if cancel_available_at is still in the future.
  // This is best-effort — if the lookup fails we still call the backend (which
  // enforces the cooldown anyway).
  try {
    const order = await client.getOrder(args.order_id);
    const blocked = preCheckCooldown(order.cancel_available_at, 'cancel');
    if (blocked) return blocked;
  } catch {
    // Lookup failed — let the backend handle it.
  }

  const result = await client.cancelOrder(args.order_id);
  return jsonResult(result);
}

export async function handleSwapNumber(
  client: IVirtualSMSClient,
  args: z.infer<typeof SwapNumberInput>
) {
  // Pre-check: fetch order to see if swap_available_at is still in the future.
  // Best-effort, same fallback as handleCancelOrder.
  try {
    const order = await client.getOrder(args.order_id);
    const blocked = preCheckCooldown(order.swap_available_at, 'swap');
    if (blocked) return blocked;
  } catch {
    // Lookup failed — let the backend handle it.
  }

  const result = await client.swapNumber(args.order_id);
  return jsonResult(result);
}

// ─── WebSocket + Polling for wait_for_code ────────────────────────────────────

interface SMSResult {
  sms_code: string;
  sms_text?: string;
  delivery_method: 'websocket' | 'polling';
}

/**
 * Try to receive SMS via WebSocket. Returns null if WS unavailable.
 * Falls back to polling automatically.
 */
function waitForSMSViaWebSocket(
  baseUrl: string,
  apiKey: string,
  orderId: string,
  timeoutMs: number
): Promise<SMSResult | null> {
  return new Promise((resolve) => {
    const wsUrl = baseUrl.replace(/^http/, 'ws') + `/ws/orders?order_id=${encodeURIComponent(orderId)}&api_key=${encodeURIComponent(apiKey)}`;

    let ws: WebSocket | null = null;
    let resolved = false;
    let reconnected = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws?.close();
        resolve(null); // trigger polling fallback
      }
    }, timeoutMs);

    function connect() {
      ws = new WebSocket(wsUrl);

      ws.on('error', () => {
        if (!resolved && !reconnected) {
          reconnected = true;
          ws?.close();
          // Try once more after 1s
          setTimeout(connect, 1000);
        } else if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(null); // WS failed, use polling
        }
      });

      ws.on('close', () => {
        if (!resolved && !reconnected) {
          reconnected = true;
          setTimeout(connect, 1000);
        } else if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(null); // WS closed, use polling
        }
      });

      ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          // Message format from server: {type: "sms", code: "...", full_text: "..."}
          if (msg.type === 'sms' && msg.code) {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              ws?.close();
              resolve({
                sms_code: msg.code,
                sms_text: msg.full_text,
                delivery_method: 'websocket',
              });
            }
          }
          // Also handle sms_received type from backend
          if (msg.type === 'sms_received' && msg.code) {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              ws?.close();
              resolve({
                sms_code: msg.code,
                sms_text: msg.message,
                delivery_method: 'websocket',
              });
            }
          }
        } catch {
          // ignore parse errors
        }
      });
    }

    connect();
  });
}

export async function handleWaitForCode(
  client: IVirtualSMSClient,
  args: z.infer<typeof WaitForCodeInput>
) {
  const timeoutMs = (args.timeout_seconds ?? 60) * 1000;
  const pollIntervalMs = 5000;
  const startTime = Date.now();

  const orderId = args.order_id;
  const apiKey = client.getApiKey();
  const baseUrl = client.getBaseUrl();

  // Fetch the order once up front so we can return phone_number on timeout
  // and short-circuit if SMS already arrived before this call.
  let initial;
  try {
    initial = await client.getOrder(orderId);
  } catch (err) {
    throw new Error(`Failed to load order ${orderId}: ${(err as Error).message}`);
  }

  const phoneNumber = initial.phone_number;

  const buildSuccess = (
    messages: Array<{ content: string; sender?: string; received_at?: string }>,
    deliveryMethod: 'websocket' | 'polling' | 'instant',
    pollAttempts?: number
  ) => {
    const firstContent = messages[0]?.content || '';
    const code = extractCode(firstContent);
    return jsonResult({
      success: true,
      order_id: orderId,
      phone_number: phoneNumber,
      status: 'sms_received',
      messages,
      code,
      // Backward-compat aliases
      sms_code: code,
      sms_text: firstContent,
      delivery_method: deliveryMethod,
      elapsed_seconds: Math.round((Date.now() - startTime) / 1000),
      ...(pollAttempts !== undefined ? { poll_attempts: pollAttempts } : {}),
    });
  };

  // Short-circuit: SMS already delivered before we got called.
  if (initial.messages && initial.messages.length > 0) {
    return buildSuccess(initial.messages, 'instant');
  }
  if (initial.sms_code || initial.sms_text) {
    return buildSuccess(
      [{ content: initial.sms_text || initial.sms_code || '', sender: undefined, received_at: undefined }],
      'instant'
    );
  }

  // WebSocket path (if we have an API key) — race against timeout.
  if (apiKey) {
    const remainingMs = timeoutMs - (Date.now() - startTime);
    if (remainingMs > 0) {
      const wsResult = await waitForSMSViaWebSocket(baseUrl, apiKey, orderId, remainingMs);
      if (wsResult) {
        return buildSuccess(
          [{ content: wsResult.sms_text || wsResult.sms_code, sender: undefined, received_at: undefined }],
          'websocket'
        );
      }
      // WS timed out or failed — fall through to polling for any remaining time.
    }
  }

  // Polling fallback.
  let attempts = 0;
  while (Date.now() - startTime < timeoutMs) {
    attempts++;

    try {
      const status = await client.getOrder(orderId);

      if (status.messages && status.messages.length > 0) {
        return buildSuccess(status.messages, 'polling', attempts);
      }
      if (status.sms_code || status.sms_text) {
        return buildSuccess(
          [{ content: status.sms_text || status.sms_code || '', sender: undefined, received_at: undefined }],
          'polling',
          attempts
        );
      }

      if (status.status === 'cancelled' || status.status === 'failed') {
        throw new Error(
          `Order ${orderId} was ${status.status} before SMS arrived.`
        );
      }
    } catch (err) {
      const message = (err as Error).message;
      if (!message.includes('waiting') && !message.includes('pending')) {
        throw err;
      }
    }

    const remaining = timeoutMs - (Date.now() - startTime);
    if (remaining <= 0) break;
    await sleep(Math.min(pollIntervalMs, remaining));
  }

  // Timeout — return order_id for crash recovery (don't cancel automatically).
  return jsonResult({
    success: false,
    error: 'timeout',
    message: `No SMS received within ${args.timeout_seconds} seconds.`,
    order_id: orderId,
    phone_number: phoneNumber,
    tip: 'Call get_sms with this order_id later to check, or cancel_order to refund.',
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function handleFindCheapest(
  client: IVirtualSMSClient,
  args: z.infer<typeof FindCheapestInput>
) {
  const limit = args.limit ?? 5;

  // Stock comes from the catalog's real per-country `count` (count>0 = in stock),
  // the same source the website uses. The old path fanned out to /api/v1/price
  // per country, but that endpoint returns no availability field — so every priced
  // combo was fabricated as in-stock (e.g. TikTok/Yemen showed stock:true despite
  // count:0 and OUT OF STOCK on the site).
  const catalog = await client.getCatalogCountries(args.service);

  const results = catalog
    .filter((c) => c.count > 0)
    .map((c) => ({
      country: c.iso,
      country_name: c.name,
      price_usd: c.price_usd,
      stock: true as const,
    }));

  results.sort((a, b) => a.price_usd - b.price_usd);
  const top = results.slice(0, limit);

  if (top.length === 0) {
    return jsonResult({
      service: args.service,
      cheapest_options: [],
      total_available_countries: 0,
      message: `No countries available for service "${args.service}". Use search_service to verify the service code, or list_services to see all available services.`,
    });
  }

  return jsonResult({
    service: args.service,
    cheapest_options: top,
    total_available_countries: results.length,
  });
}

export async function handleSearchService(
  client: IVirtualSMSClient,
  args: z.infer<typeof SearchServiceInput>
) {
  const services = await client.listServices();
  const query = args.query.toLowerCase().trim();

  const scored = services.map((s) => {
    const name = s.name.toLowerCase();
    const code = s.code.toLowerCase();

    let score = 0;

    if (code === query || name === query) {
      score = 1.0;
    } else if (code.startsWith(query) || name.startsWith(query)) {
      score = 0.9;
    } else if (code.includes(query) || name.includes(query)) {
      score = 0.7;
    } else {
      const queryTokens = query.split(/\s+/);
      const nameTokens = name.split(/[\s_-]+/);
      let matches = 0;
      for (const qt of queryTokens) {
        if (nameTokens.some((nt) => nt.includes(qt) || qt.includes(nt))) {
          matches++;
        }
      }
      if (matches > 0) {
        score = (matches / Math.max(queryTokens.length, nameTokens.length)) * 0.6;
      }
    }

    return { code: s.code, name: s.name, match_score: Math.round(score * 100) / 100 };
  });

  const matches = scored
    .filter((s) => s.match_score >= 0.5)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 5);

  return jsonResult(
    matches.length > 0
      ? {
          query: args.query,
          matches,
          tip: `Use the "code" field as the service parameter in other tools.`,
        }
      : {
          query: args.query,
          matches: [],
          message: 'No matching services found',
          tip: `Try list_services to browse all available services.`,
        }
  );
}

export async function handleActiveOrders(
  client: IVirtualSMSClient,
  args: z.infer<typeof ActiveOrdersInput>
) {
  const orders = await client.listOrders(args.status);
  return jsonResult({
    count: orders.length,
    orders: orders.map((o) => ({
      order_id: o.order_id,
      phone_number: o.phone_number,
      status: o.status,
      sms_code: o.sms_code,
      sms_text: o.sms_text,
      expires_at: o.expires_at,
    })),
    tip: orders.length > 0
      ? 'Use check_sms with any order_id to get the latest status, or cancel_order to refund pending orders.'
      : 'No orders found.',
  });
}

export async function handleGetOrder(
  client: IVirtualSMSClient,
  args: z.infer<typeof GetOrderInput>
) {
  const order = await client.getOrder(args.order_id);
  const messages = (order.messages && order.messages.length > 0)
    ? order.messages
    : (order.sms_text || order.sms_code)
      ? [{ content: order.sms_text || order.sms_code || '', sender: undefined, received_at: undefined }]
      : [];
  const firstContent = messages[0]?.content;
  const code = order.sms_code || (firstContent ? extractCode(firstContent) : undefined);
  const out: Record<string, unknown> = {
    order_id: order.order_id,
    phone_number: order.phone_number,
    service: order.service,
    country: order.country,
    price: order.price,
    status: order.status,
    created_at: order.created_at,
    expires_at: order.expires_at,
  };
  if (messages.length > 0) out.messages = messages;
  if (code) {
    out.code = code;
    out.sms_code = code;
  }
  if (firstContent) out.sms_text = firstContent;
  return jsonResult(out);
}

// Statuses considered "active" (order is live and billable/cancellable).
const ACTIVE_STATUSES = new Set(['waiting', 'pending', 'sms_received', 'created']);

export async function handleCancelAllOrders(client: IVirtualSMSClient) {
  const orders = await client.listOrders();
  const active = orders.filter((o) => ACTIVE_STATUSES.has(o.status));

  if (active.length === 0) {
    return jsonResult({ cancelled: 0, failed: 0, message: 'No active orders to cancel.' });
  }

  const results = await Promise.allSettled(
    active.map((o) =>
      client.cancelOrder(o.order_id).then((res) => ({ order_id: o.order_id, ...res }))
    )
  );

  const succeeded: Array<{ order_id: string; refunded: boolean }> = [];
  const failed: Array<{ order_id: string; error: string }> = [];

  results.forEach((r, i) => {
    const orderId = active[i].order_id;
    if (r.status === 'fulfilled') {
      succeeded.push({ order_id: orderId, refunded: r.value.refunded });
    } else {
      failed.push({ order_id: orderId, error: (r.reason as Error)?.message ?? String(r.reason) });
    }
  });

  return jsonResult({
    cancelled: succeeded.length,
    failed: failed.length,
    total_active: active.length,
    cancelled_orders: succeeded,
    failures: failed,
  });
}

function parseOrderDate(value?: string): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

export async function handleOrderHistory(
  client: IVirtualSMSClient,
  args: z.infer<typeof OrderHistoryInput>
) {
  const limit = args.limit ?? 20;
  const orders = await client.listOrders(args.status);

  const cutoffMs = args.since_days
    ? Date.now() - args.since_days * 24 * 60 * 60 * 1000
    : null;

  const serviceFilter = args.service?.toLowerCase();
  const countryFilter = args.country?.toUpperCase();

  const filtered = orders.filter((o) => {
    if (cutoffMs !== null) {
      const ts = parseOrderDate(o.created_at);
      if (ts === null || ts < cutoffMs) return false;
    }
    if (serviceFilter && (o.service ?? '').toLowerCase() !== serviceFilter) return false;
    if (countryFilter && (o.country ?? '').toUpperCase() !== countryFilter) return false;
    return true;
  });

  const capped = filtered.slice(0, limit);

  return jsonResult({
    count: capped.length,
    total_matched: filtered.length,
    filters: {
      status: args.status,
      service: args.service,
      country: args.country,
      since_days: args.since_days,
    },
    orders: capped.map((o) => ({
      order_id: o.order_id,
      phone_number: o.phone_number,
      service: o.service,
      country: o.country,
      price: o.price,
      status: o.status,
      created_at: o.created_at,
      sms_code: o.sms_code,
    })),
  });
}

export async function handleGetStats(
  client: IVirtualSMSClient,
  args: z.infer<typeof GetStatsInput>
) {
  const sinceDays = args.since_days ?? 30;
  const cutoffMs = Date.now() - sinceDays * 24 * 60 * 60 * 1000;

  const [balance, orders] = await Promise.all([
    client.getBalance(),
    client.listOrders(),
  ]);

  const inWindow = orders.filter((o) => {
    const ts = parseOrderDate(o.created_at);
    return ts !== null && ts >= cutoffMs;
  });

  const byStatus: Record<string, number> = {};
  const byService: Record<string, number> = {};
  const byCountry: Record<string, number> = {};
  let totalSpend = 0;
  let successful = 0;
  let terminal = 0;

  for (const o of inWindow) {
    byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
    if (o.service) byService[o.service] = (byService[o.service] ?? 0) + 1;
    if (o.country) byCountry[o.country] = (byCountry[o.country] ?? 0) + 1;

    // Spend: charges that weren't fully refunded. Cancelled orders typically refunded.
    if (o.status !== 'cancelled' && typeof o.price === 'number') {
      totalSpend += o.price;
    }

    // Success rate denominator = orders in terminal state (excludes still-waiting)
    if (['completed', 'sms_received', 'expired', 'cancelled'].includes(o.status)) {
      terminal++;
      if (o.status === 'completed' || o.status === 'sms_received') successful++;
    }
  }

  const topEntries = (rec: Record<string, number>, n = 5) =>
    Object.entries(rec)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([key, count]) => ({ key, count }));

  return jsonResult({
    window_days: sinceDays,
    balance_usd: balance.balance_usd,
    total_orders: inWindow.length,
    successful_orders: successful,
    success_rate: terminal > 0 ? Math.round((successful / terminal) * 1000) / 10 : null,
    total_spend_usd: Math.round(totalSpend * 100) / 100,
    status_breakdown: byStatus,
    top_services: topEntries(byService),
    top_countries: topEntries(byCountry),
    note:
      orders.length >= 50
        ? 'Server caps order history at 50 rows — stats may undercount if your activity exceeds 50 orders in the window.'
        : undefined,
  });
}

export async function handleGetProfile(client: IVirtualSMSClient) {
  const profile = await client.getProfile();
  return jsonResult(profile);
}

export async function handleGetTransactions(
  client: IVirtualSMSClient,
  args: z.infer<typeof GetTransactionsInput>
) {
  const page = await client.getTransactions({
    type: args.type,
    from: args.from,
    to: args.to,
    limit: args.limit,
    offset: args.offset,
  });
  return jsonResult(
    {
      count: page.count,
      limit: page.limit,
      offset: page.offset,
      filters: {
        type: args.type,
        from: args.from,
        to: args.to,
      },
      transactions: page.transactions,
      tip:
        page.transactions.length === 0
          ? 'No transactions match the filters. Try widening the date range or removing the type filter.'
          : page.count === page.limit
            ? 'Page is full — increment offset by limit to fetch the next page.'
            : undefined,
    }
  );
}

// ─── Rentals handlers ─────────────────────────────────────────────────────────

// Every tool response carries both a human-readable text block (unchanged
// behavior — same JSON serialization as before) AND a machine-parseable
// structuredContent object (MCP structured tool output) so clients can skip
// re-parsing the JSON-in-text. The MCP spec requires structuredContent to be
// an object (not a bare array/primitive) — top-level arrays get wrapped under
// an `items` key for structuredContent only; the text block is untouched.
function jsonResult(payload: unknown) {
  const structured: Record<string, unknown> = Array.isArray(payload)
    ? { items: payload }
    : (payload as Record<string, unknown>) ?? {};
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify(payload, null, 2) },
    ],
    structuredContent: structured,
  };
}

export async function handleRentalsPricing(client: IVirtualSMSClient) {
  return jsonResult(await client.listRentalPricing());
}

export async function handleRentalsAvailable(
  client: IVirtualSMSClient,
  args: z.infer<typeof RentalsAvailableInput>
) {
  return jsonResult(await client.getRentalAvailability(args));
}

export async function handleRentalsServices(
  client: IVirtualSMSClient,
  args: z.infer<typeof RentalsServicesInput>
) {
  return jsonResult(
    await client.listRentalServices({ countryCode: args.country_code, durationHours: args.duration_hours })
  );
}

export async function handleRentalsPrice(
  client: IVirtualSMSClient,
  args: z.infer<typeof RentalsPriceInput>
) {
  return jsonResult(
    await client.getRentalPrice({
      service: args.service,
      countryCode: args.country_code,
      durationHours: args.duration_hours,
    })
  );
}

export async function handleCreateRental(
  client: IVirtualSMSClient,
  args: z.infer<typeof CreateRentalInput>
) {
  if (args.tier === 'platform') {
    if (!args.service) {
      throw new Error('service is required for platform-tier rentals');
    }
    const result = await client.createPlatformRental({
      service: args.service,
      countryCode: args.country,
      durationHours: args.duration_hours,
    });
    return jsonResult({ tier: 'platform', ...result });
  }
  const result = await client.createFullAccessRental({
    country: args.country,
    rentalType: args.service ? 'service' : 'full',
    durationHours: args.duration_hours,
    service: args.service,
    autoRenew: args.auto_renew,
  });
  return jsonResult({ tier: 'full_access', ...result });
}

export async function handleListRentals(
  client: IVirtualSMSClient,
  args: z.infer<typeof ListRentalsInput>
) {
  const rentals = await client.listRentals(args.status);
  return jsonResult({ count: rentals.length, rentals });
}

export async function handleGetRental(
  client: IVirtualSMSClient,
  args: z.infer<typeof GetRentalInput>
) {
  const rental: Rental | undefined = await client.getRental(args.rental_id);
  if (!rental) {
    return jsonResult({ error: 'not_found', message: `Rental ${args.rental_id} not found` });
  }
  return jsonResult(rental);
}

export async function handleExtendRental(
  client: IVirtualSMSClient,
  args: z.infer<typeof ExtendRentalInput>
) {
  return jsonResult(await client.extendRental(args.rental_id, args.duration_hours));
}

export async function handleCancelRental(
  client: IVirtualSMSClient,
  args: z.infer<typeof CancelRentalInput>
) {
  return jsonResult(await client.cancelRental(args.rental_id));
}

export async function handleReleaseRental(
  client: IVirtualSMSClient,
  args: z.infer<typeof ReleaseRentalInput>
) {
  return jsonResult(await client.releaseRental(args.rental_id));
}

export async function handleRetryOrder(
  client: IVirtualSMSClient,
  args: z.infer<typeof RetryOrderInput>
) {
  return jsonResult(await client.retryOrder(args.order_id));
}

export async function handleCheckNumber(
  client: IVirtualSMSClient,
  args: z.infer<typeof CheckNumberInput>
) {
  return jsonResult(await client.checkNumber(args.number));
}

// ─── Session-drive handlers (gated behind VIRTUALSMS_ENABLE_SESSIONS) ────────

// The session-drive endpoints don't exist on every deployed VirtualSMS host
// yet (feature-flagged server-side). Surface a clean generic message instead
// of a raw 404/503 — never leak the upstream supplier name in the error text.
function isSessionsUnavailableError(err: unknown): boolean {
  const message = (err as Error)?.message ?? '';
  return (
    message.includes('Not found') ||
    message.includes('404') ||
    message.includes('server error (503)') ||
    message.includes('not available')
  );
}

const SESSIONS_UNAVAILABLE_MESSAGE = 'Browser sessions are not available on this endpoint.';

export async function handleStopSession(
  client: IVirtualSMSClient,
  args: z.infer<typeof StopSessionInput>
) {
  try {
    const session = await client.stopBrowserSession(args.session_id);
    return jsonResult({ session });
  } catch (err) {
    if (isSessionsUnavailableError(err)) {
      return { ...jsonResult({ error: SESSIONS_UNAVAILABLE_MESSAGE }), isError: true };
    }
    throw err;
  }
}

export async function handleNavigateSession(
  client: IVirtualSMSClient,
  args: z.infer<typeof NavigateSessionInput>
) {
  try {
    const result = await client.navigateBrowserSession(args.session_id, args.url);
    return jsonResult(result);
  } catch (err) {
    if (isSessionsUnavailableError(err)) {
      return { ...jsonResult({ error: SESSIONS_UNAVAILABLE_MESSAGE }), isError: true };
    }
    throw err;
  }
}

export async function handleSessionViewer(
  client: IVirtualSMSClient,
  args: z.infer<typeof SessionViewerInput>
) {
  try {
    const session = await client.getBrowserSession(args.session_id);
    if (!session.viewer_url) {
      return jsonResult({
        id: session.id,
        status: session.status,
        message: 'No live viewer is available for this session yet.',
      });
    }
    return jsonResult({ id: session.id, status: session.status, viewer_url: session.viewer_url });
  } catch (err) {
    if (isSessionsUnavailableError(err)) {
      return { ...jsonResult({ error: SESSIONS_UNAVAILABLE_MESSAGE }), isError: true };
    }
    throw err;
  }
}
