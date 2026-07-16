import axios, { AxiosInstance, AxiosError } from 'axios';
import { randomUUID } from 'node:crypto';

// ─── GET-only retry policy (Tier-A hardening) ──────────────────────────────
// Mutating calls (POST purchase/cancel/swap/rotate/extend/etc.) are NEVER
// retried here — a 5xx (or a dropped connection) on a mutating request does
// NOT mean the operation failed server-side, it may have gone through right
// before the error was returned. Blindly retrying risks a double purchase,
// double cancel, or double proxy rotation. Only idempotent reads (GET/HEAD)
// get this safety net, and only for failures that are plausibly transient.
export const GET_RETRY_MAX_ATTEMPTS = 3; // 1 initial try + up to 2 retries
const GET_RETRY_BASE_DELAY_MS = 300;

/**
 * Whether a failed request should be retried, given the method that was
 * used and how the request failed. GET/HEAD only. Retries on network
 * errors (no response at all — timeout, connection reset, DNS failure) and
 * 5xx server errors. Never retries 4xx: 401/402/404 are not transient, and
 * 429 retried blindly would actively fight the server's own rate limiter.
 */
export function shouldRetryGet(params: {
  method: string;
  status: number | undefined;
  hasResponse: boolean;
  attemptsSoFar: number; // total attempts made so far, including the one that just failed
}): boolean {
  const method = params.method.toLowerCase();
  if (method !== 'get' && method !== 'head') return false;
  if (params.attemptsSoFar >= GET_RETRY_MAX_ATTEMPTS) return false;
  if (!params.hasResponse) return true;
  return typeof params.status === 'number' && params.status >= 500;
}

/** Exponential backoff delay before retry attempt number `attemptNumber` (1-indexed). */
export function getRetryDelayMs(attemptNumber: number): number {
  return GET_RETRY_BASE_DELAY_MS * 2 ** (attemptNumber - 1);
}

export interface Service {
  code: string;
  name: string;
  icon?: string;
}

export interface Country {
  iso: string;
  name: string;
  flag?: string;
}

export interface Price {
  price_usd: number;
  currency: string;
  available: boolean;
}

export interface CatalogCountry {
  iso: string;
  name: string;
  price_usd: number;
  count: number;
}

export interface Balance {
  balance_usd: number;
}

export interface Profile {
  id: string;
  email: string;
  telegram_linked: boolean;
  telegram_username?: string;
  balance_usd: number;
  total_spent_usd: number;
  total_credits_usd: number;
  total_orders: number;
  active_api_keys: number;
  created_at: string;
}

export interface Transaction {
  id: string;
  amount: number;
  type: string;
  description?: string;
  order_id?: string;
  balance_before: number;
  balance_after: number;
  created_at: string;
}

export interface TransactionsPage {
  count: number;
  limit: number;
  offset: number;
  transactions: Transaction[];
}

export interface SmsMessage {
  content: string;
  sender?: string;
  received_at?: string;
}

export interface Order {
  order_id: string;
  phone_number: string;
  service?: string;
  country?: string;
  price?: number;
  created_at?: string;
  expires_at?: string;
  status: string;
  // Legacy fields — kept for backward compat with older API responses.
  sms_code?: string;
  sms_text?: string;
  // Canonical SMS payload — server returns one entry per inbound message.
  messages?: SmsMessage[];
  sms_received?: boolean;
  // Cooldown timestamps (added v1.2.3) — RFC3339 wallclock when cancel/swap
  // become available. Lets MCP pre-validate without a 4xx round-trip. Backend
  // always sets these; consumers fall back gracefully if missing on legacy
  // payloads.
  cancel_available_at?: string;
  swap_available_at?: string;
  rules?: {
    cancel_cooldown_seconds?: number;
    swap_cooldown_seconds?: number;
  };
}

export interface CancelResult {
  success: boolean;
  refunded: boolean;
}

export interface ProxyCatalogCountry {
  code: string;
  name: string;
  available: boolean;
  ip_count: number;
}

export interface ProxyCatalogPoolType {
  id: string;
  label: string;
  price_per_gb: number;
  countries: ProxyCatalogCountry[];
}

export interface ProxyListItem {
  proxy_id: string;
  pool_type: string;
  country_code: string;
  country_name?: string;
  gb_total: number;
  gb_used: number;
  gb_remaining: number;
  proxy_host: string;
  proxy_port: number;
  proxy_login: string;
  proxy_password: string;
  updated_at?: string;
  created_at?: string;
}

export interface ProxyPurchaseResult {
  proxy_id: string;
  pool_type: string;
  gb_added: number;
  gb_remaining: number;
  country_code: string;
  proxy_login: string;
  proxy_password: string;
  proxy_host: string;
  proxy_port: number;
  proxy_port_socks?: number;
  price: number;
  balance?: number;
}

export interface ProxyRotateResult {
  rotated: boolean;
  port: number;
  message: string;
}

export interface ProxyUsage {
  gb_used: number;
  gb_remaining: number;
  requests: number;
  updated_at?: string;
}

export interface ProxyUsageHistoryPoint {
  date: string;
  gb: number;
  requests: number;
}

export interface ProxyUsageHistoryResult {
  series: ProxyUsageHistoryPoint[];
  totals: { gb: number; requests: number };
}

export interface ProxyTargetingResult {
  ok: boolean;
  country_code: string;
  // true when city/state/zip/asn targeting was requested on a non-premium
  // pool — the sub-country refinement burns the customer's own funded GB
  // 2x faster (see Vault/Operations/proxy-system.md §2). Free on
  // residential_premium.
  premium_2x: boolean;
}

export interface ProxyTestResult {
  ok: boolean;
  exit_ip?: string;
  country_code?: string;
  country_name?: string;
  city?: string;
  region?: string;
  isp?: string;
  asn?: string;
  latency_ms?: number;
  error?: string;
}

export interface ProxyLocationItem {
  code: string;
  name: string;
  count: number;
}

export interface ProxyEndpointResult {
  proxy_id: string;
  pool_type: string;
  host: string;
  port: number;
  protocol: 'HTTP' | 'SOCKS5';
  session: 'rotating' | 'sticky';
  sticky_ttl_minutes?: number;
  country_code: string;
  target_by: 'country' | 'state' | 'city' | 'zip' | 'asn';
  location_code?: string;
  premium_2x: boolean;
  endpoints: string[];
}

export interface BrowserSessionResult {
  id: string;
  status: string;
  service_name?: string;
  country_code?: string;
  device_mode?: string;
  with_proxy?: boolean;
  debug_url?: string;
  viewer_url?: string;
  target_url?: string;
  order_id?: string;
  phone_number?: string;
  timeline?: Array<{ at: string; event: string; detail?: string }>;
}

export interface NavigateSessionResult {
  ok: boolean;
  status: string;
  url: string;
}

// ─── Rentals ────────────────────────────────────────────────────────────────
// Two rental tiers, reflected generically (no supplier names):
//   "full_access" — local SIM inventory, full SMS access across any service,
//                    no 20-minute refund countdown (early release after a
//                    2h minimum hold instead).
//   "platform"    — sourced via our global supplier network, locked to ONE
//                    chosen service per number, 20-minute auto-refund window.

export interface RentalPricingTier {
  rental_type: string;
  duration_hours: number;
  duration_label: string;
  base_price: number;
  country_code: string;
  service_id: string;
}

export interface RentalDurationPrice {
  duration_hours: number;
  duration_label: string;
  price: number;
}

export interface RentalAvailabilityCountry {
  country_code: string;
  country_name: string;
  flag?: string;
  available_count: number;
  pricing: Record<string, RentalDurationPrice[]>;
  // Populated only for the platform tier (provider=network).
  service_count?: number;
  popular_services?: string[];
  min_price_per_day?: number;
}

export interface RentalFullAccessCountry {
  country_code: string;
  country_name: string;
  flag?: string;
  available_count: number;
  pricing: Record<string, number>; // duration_hours -> price
}

export interface RentalAvailabilityResult {
  countries: RentalAvailabilityCountry[];
  total_available: number;
  full_access_countries?: RentalFullAccessCountry[];
  provider?: string;
}

export interface RentalCatalogService {
  service_id: string;
  service_name: string;
  physical_count: number;
  our_price?: number;
  base_price?: number;
  popular: boolean;
  icon_url?: string;
}

export interface RentalPriceResult {
  price: number;
  duration_hours: number;
}

export interface Rental {
  id: string;
  phone_number: string;
  rental_type: string;
  service_id?: string;
  duration_hours: number;
  started_at: string;
  expires_at: string;
  price: number;
  auto_renew: boolean;
  status: string;
  sms_received: number;
  sms_forwarded: number;
  last_sms_at?: string;
  provider: string;
}

export interface CreateRentalResult {
  success: boolean;
  rental_id: string;
  phone_number: string;
  rental_type?: string;
  service?: string;
  duration?: string;
  price?: number;
  started_at?: string;
  expires_at: string;
  auto_renew?: boolean;
  status?: string;
  retail_cost?: number;
  currency?: string;
}

export interface RentalActionResult {
  success: boolean;
  rental_id: string;
  status?: string;
  refund?: number;
  new_expires_at?: string;
  price?: number;
  hours_used?: string;
  message?: string;
}

export interface RetryOrderResult {
  success: boolean;
  order_id: string;
  message: string;
}

export interface NumberCheckResult {
  valid: boolean;
  e164: string;
  national?: string;
  country_code: string;
  country_name: string;
  country_prefix?: string;
  location?: string;
  carrier?: string;
  line_type: string;
  spam_risk: string;
  cached: boolean;
  message?: string;
}

// Internal ISO-3166 alpha-2 → platform-network numeric country ID map.
// Required only by the platform-tier create call (the backend's create
// endpoint takes a numeric ID; every other rentals endpoint resolves
// country_code server-side). Server-side only in the sense that these IDs
// carry no product/supplier meaning on their own — this is the same mapping
// already shipped in the customer-facing frontend bundle for the same
// purpose. Not every ISO code the platform lists is rental-capable; an
// unmapped code means that country isn't available for platform-tier rentals.
const PLATFORM_TIER_COUNTRY_IDS: Record<string, number> = {
  RU: 0, UA: 1, KZ: 2, CN: 3, PH: 4, MM: 5, ID: 6, MY: 7, KE: 8, TZ: 9,
  VN: 10, KG: 11, IL: 13, HK: 14, PL: 15, GB: 16, MG: 17, CD: 18, NG: 19,
  MO: 20, EG: 21, IN: 22, IE: 23, KH: 24, LA: 25, HT: 26, CI: 27, GM: 28,
  RS: 29, YE: 30, ZA: 31, RO: 32, CO: 33, EE: 34, AZ: 35, CA: 36, MA: 37,
  GH: 38, AR: 39, UZ: 40, CM: 41, TD: 42, DE: 43, LT: 44, HR: 45, SE: 46,
  IQ: 47, NL: 48, LV: 49, AT: 50, BY: 51, TH: 52, SA: 53, MX: 54, TW: 55,
  ES: 56, IR: 57, DZ: 58, SI: 59, BD: 60, SN: 61, TR: 62, CZ: 63, LK: 64,
  PE: 65, PK: 66, NZ: 67, GN: 68, ML: 69, VE: 70, ET: 71, MN: 72, BR: 73,
  AF: 74, UG: 75, AO: 76, CY: 77, FR: 78, PG: 79, MZ: 80, NP: 81, BE: 82,
  BG: 83, HU: 84, MD: 85, IT: 86, PY: 87, HN: 88, TN: 89, NI: 90, TL: 91,
  BO: 92, CR: 93, GT: 94, AE: 95, ZW: 96, PR: 97, SD: 98, TG: 99, KW: 100,
  SV: 101, LY: 102, JM: 103, TT: 104, EC: 105, SZ: 106, OM: 107, BA: 108,
  DO: 109, SY: 110, QA: 111, PA: 112, CU: 113, MR: 114, SL: 115, JO: 116,
  PT: 117, BB: 118, BI: 119, BJ: 120, BN: 121, BS: 122, BW: 123, CF: 125,
  GD: 127, GE: 128, GR: 129, GW: 130, GY: 131, IS: 132, KM: 133, KN: 134,
  LR: 135, LS: 136, MW: 137, NA: 138, NE: 139, RW: 140, SK: 141, SR: 142,
  TJ: 143, MC: 144, BH: 145, RE: 146, ZM: 147, US: 187,
};

// ─── Proxy endpoint composition (pure, no network call) ──────────────────────
// Mirrors frontend/src/components/my-numbers-v2/ProxyEndpointGenerator.tsx
// buildUsername()/buildEndpoint() exactly, so an agent gets the same
// connection string a customer would copy from the dashboard. Shared by
// VirtualSMSClient.generateProxyEndpoint() and the sandbox mock so both
// paths produce identical output shapes.

function buildProxyUsername(
  login: string,
  countryCode: string,
  targetBy: 'country' | 'state' | 'city' | 'zip' | 'asn',
  locationCode: string | undefined,
  stickyIndex?: number,
  stickyMinutes?: number,
): string {
  let u = `${login}__cr.${countryCode.toLowerCase()}`;
  const loc = (locationCode ?? '').trim();
  if (loc && targetBy !== 'country') {
    if (targetBy === 'state') u += `;state.${loc.toLowerCase()}`;
    else if (targetBy === 'city') u += `;city.${loc.toLowerCase()}`;
    else if (targetBy === 'zip') u += `;zip.${loc}`;
    else if (targetBy === 'asn') u += `;asn.${loc}`;
  }
  if (stickyIndex !== undefined) {
    u += `;sessid.s${stickyIndex};sessttl.${stickyMinutes ?? 10}`;
  }
  return u;
}

// Fixed gateway ports (frontend/src/components/my-numbers-v2/ProxyEndpointGenerator.tsx
// HTTP_PORT/SOCKS5_PORT) — rotating vs. sticky is encoded entirely in the
// username's sessid/sessttl params, NOT by port selection.
const PROXY_HTTP_PORT = 823;
const PROXY_SOCKS5_PORT = 824;

function buildProxyEndpointString(
  host: string,
  port: number,
  user: string,
  pass: string,
  format: 'host:port:user:pass' | 'user:pass@host:port' | 'curl',
  protocol: 'HTTP' | 'SOCKS5',
): string {
  if (format === 'host:port:user:pass') return `${host}:${port}:${user}:${pass}`;
  if (format === 'user:pass@host:port') return `${user}:${pass}@${host}:${port}`;
  const scheme = protocol === 'SOCKS5' ? 'socks5h' : 'http';
  return `curl -x "${scheme}://${user}:${pass}@${host}:${port}" https://api.ipify.org`;
}

export function buildProxyEndpointResult(
  proxy: ProxyListItem,
  params: {
    countryCode: string;
    targetBy?: 'country' | 'state' | 'city' | 'zip' | 'asn';
    locationCode?: string;
    session?: 'rotating' | 'sticky';
    stickyTtlMinutes?: number;
    count?: number;
    protocol?: 'HTTP' | 'SOCKS5';
    format?: 'host:port:user:pass' | 'user:pass@host:port' | 'curl';
  },
): ProxyEndpointResult {
  const targetBy = params.targetBy ?? 'country';
  const session = params.session ?? 'rotating';
  const protocol = params.protocol ?? 'HTTP';
  const format = params.format ?? 'host:port:user:pass';
  const ttl = params.stickyTtlMinutes ?? 10;
  const count = Math.max(1, Math.min(100, Math.floor(params.count ?? 1)));
  const port = protocol === 'SOCKS5' ? PROXY_SOCKS5_PORT : PROXY_HTTP_PORT;

  const premium2x = targetBy !== 'country' && !!(params.locationCode ?? '').trim() && proxy.pool_type !== 'residential_premium';

  let endpoints: string[];
  if (session === 'rotating') {
    const user = buildProxyUsername(proxy.proxy_login, params.countryCode, targetBy, params.locationCode);
    const ep = buildProxyEndpointString(proxy.proxy_host, port, user, proxy.proxy_password, format, protocol);
    endpoints = Array.from({ length: count }, () => ep);
  } else {
    endpoints = Array.from({ length: count }, (_, i) => {
      const user = buildProxyUsername(proxy.proxy_login, params.countryCode, targetBy, params.locationCode, i + 1, ttl);
      return buildProxyEndpointString(proxy.proxy_host, port, user, proxy.proxy_password, format, protocol);
    });
  }

  return {
    proxy_id: proxy.proxy_id,
    pool_type: proxy.pool_type,
    host: proxy.proxy_host,
    port,
    protocol,
    session,
    sticky_ttl_minutes: session === 'sticky' ? ttl : undefined,
    country_code: params.countryCode,
    target_by: targetBy,
    location_code: params.locationCode,
    premium_2x: premium2x,
    endpoints,
  };
}

export class VirtualSMSClient implements IVirtualSMSClient {
  private http: AxiosInstance;
  private apiKey?: string;
  private baseUrl: string;

  constructor(baseUrl: string, apiKey?: string, timeoutSeconds?: number) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: (timeoutSeconds ?? 30) * 1000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // Add auth header if API key is set
    this.http.interceptors.request.use((config) => {
      if (this.apiKey) {
        config.headers['X-API-Key'] = this.apiKey;
      }
      // Auto-generate a fresh X-Idempotency-Key on every mutating request
      // (POST/PUT/PATCH/DELETE). Forward-compatible: the proxies endpoint
      // already dedups on this header/body key; orders/rentals endpoints
      // ignore it harmlessly until backend support lands there too. GETs
      // never get a key — nothing to dedup on a read.
      const method = (config.method ?? 'get').toLowerCase();
      if (method !== 'get' && method !== 'head') {
        config.headers['X-Idempotency-Key'] = randomUUID();
      }
      return config;
    });

    // Handle errors gracefully
    this.http.interceptors.response.use(
      (res) => res,
      async (err: AxiosError) => {
        // GET-only bounded retry — see shouldRetryGet()/getRetryDelayMs()
        // above for the safety rationale. Runs before the status-code
        // mapping below so a transient failure never surfaces to the
        // caller at all if a retry succeeds.
        const retryConfig = err.config as (NonNullable<AxiosError['config']> & { __retryCount?: number }) | undefined;
        if (retryConfig) {
          const method = (retryConfig.method ?? 'get').toLowerCase();
          const attemptsSoFar = (retryConfig.__retryCount ?? 0) + 1;
          if (shouldRetryGet({ method, status: err.response?.status, hasResponse: !!err.response, attemptsSoFar })) {
            retryConfig.__retryCount = attemptsSoFar;
            await new Promise((resolve) => setTimeout(resolve, getRetryDelayMs(attemptsSoFar)));
            return this.http.request(retryConfig);
          }
        }

        const status = err.response?.status;
        const data = err.response?.data as Record<string, unknown> | undefined;
        const rawMessage = data?.message || data?.error || err.message;
        // Surface the raw backend error text when present, not just err.message,
        // so the agent sees the actual reason instead of a generic axios string.
        const message = typeof rawMessage === 'string' ? rawMessage : JSON.stringify(rawMessage);
        const method = (err.config?.method ?? 'get').toLowerCase();
        const isMutating = method !== 'get' && method !== 'head';

        if (status === 401) {
          throw new Error('Invalid API key. Get one at https://virtualsms.io');
        } else if (status === 402) {
          throw new Error('Insufficient balance. Top up at https://virtualsms.io');
        } else if (status === 404) {
          throw new Error(`Not found: ${message}`);
        } else if (status === 429) {
          throw new Error('Rate limit exceeded. Please slow down requests.');
        } else if (status && status >= 500) {
          // Anti-blind-retry: a 5xx on a mutating call (purchase/create/cancel/
          // extend/etc.) does NOT mean the operation failed server-side — it
          // may have gone through before the error was returned. Never tell
          // the agent to just retry a money-moving call blind.
          throw new Error(
            isMutating
              ? `VirtualSMS had a server error (${status}) on a request that may have made a purchase or changed state. ` +
                `DO NOT blindly retry: first verify with a list/get tool (e.g. list_orders, list_rentals, get_order) ` +
                `whether it actually succeeded, as you may have been charged. Details: ${message}`
              : `VirtualSMS server error (${status}). Safe to retry this read-only request. Details: ${message}`
          );
        }
        throw new Error(`API error: ${message}`);
      }
    );
  }

  requireApiKey(): void {
    if (!this.apiKey) {
      throw new Error(
        'VIRTUALSMS_API_KEY is required for this operation. ' +
        'Get your API key at https://virtualsms.io'
      );
    }
  }

  async listServices(): Promise<Service[]> {
    const res = await this.http.get('/api/v1/customer/services');
    // API returns: {services: [{service_id, service_name, base_price, ...}], success: true}
    const raw: Array<Record<string, unknown>> = res.data?.services ?? res.data;
    return raw.map((s) => ({
      code: String(s.service_id ?? s.code ?? ''),
      name: String(s.service_name ?? s.name ?? ''),
      icon: s.icon ? String(s.icon) : undefined,
    }));
  }

  async listCountries(): Promise<Country[]> {
    const res = await this.http.get('/api/v1/customer/countries');
    // API returns: {countries: [{country_id, country_name, min_price, services:[...]}, ...], success: true}
    const raw: Array<Record<string, unknown>> = res.data?.countries ?? res.data;
    return raw.map((c) => ({
      iso: String(c.country_id ?? c.iso ?? ''),
      name: String(c.country_name ?? c.name ?? ''),
      flag: c.flag ? String(c.flag) : undefined,
    }));
  }

  async checkPrice(service: string, country: string): Promise<Price> {
    const res = await this.http.get('/api/v1/price', {
      params: { service, country },
    });
    // API returns: {price: 0.9, country: "GB", service: "wa", success: true}
    // NOTE: /api/v1/price returns NO availability field. Fail closed — a missing
    // field must never read as in-stock. Real stock comes from getCatalogCountries().
    const raw = res.data as Record<string, unknown>;
    return {
      price_usd: Number(raw.price ?? raw.price_usd ?? 0),
      currency: String(raw.currency ?? 'USD'),
      available: Boolean(raw.available),
    };
  }

  async getCatalogCountries(service: string): Promise<CatalogCountry[]> {
    const res = await this.http.get('/api/v1/catalog/countries', {
      params: { service },
    });
    // API returns: {countries: [{id:"AT", name:"Austria", price:0.27, count:9240, ...}], success:true}
    // `count` is the real per-country stock (frontend treats count>0 as in-stock).
    const raw: Array<Record<string, unknown>> = Array.isArray(res.data?.countries)
      ? (res.data.countries as Array<Record<string, unknown>>)
      : Array.isArray(res.data)
        ? (res.data as Array<Record<string, unknown>>)
        : [];
    return raw.map((c) => ({
      iso: String(c.id ?? c.iso ?? c.country ?? ''),
      name: String(c.name ?? c.country_name ?? ''),
      price_usd: Number(c.price ?? c.our_price ?? c.price_usd ?? 0),
      count: Number(c.count ?? 0),
    }));
  }

  async getBalance(): Promise<Balance> {
    this.requireApiKey();
    const res = await this.http.get('/api/v1/customer/balance');
    const raw = res.data as Record<string, unknown>;
    return {
      balance_usd: Number(raw.balance_usd ?? raw.balance ?? 0),
    };
  }

  async getProfile(): Promise<Profile> {
    this.requireApiKey();
    const res = await this.http.get('/api/v1/customer/profile');
    const raw = res.data as Record<string, unknown>;
    return {
      id: String(raw.id ?? ''),
      email: String(raw.email ?? ''),
      telegram_linked: Boolean(raw.telegram_linked),
      telegram_username: raw.telegram_username ? String(raw.telegram_username) : undefined,
      balance_usd: Number(raw.balance_usd ?? 0),
      total_spent_usd: Number(raw.total_spent_usd ?? 0),
      total_credits_usd: Number(raw.total_credits_usd ?? 0),
      total_orders: Number(raw.total_orders ?? 0),
      active_api_keys: Number(raw.active_api_keys ?? 0),
      created_at: String(raw.created_at ?? ''),
    };
  }

  async getTransactions(params: {
    type?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<TransactionsPage> {
    this.requireApiKey();
    const res = await this.http.get('/api/v1/customer/transactions', { params });
    const raw = res.data as Record<string, unknown>;
    const items: Array<Record<string, unknown>> = Array.isArray(raw.transactions)
      ? (raw.transactions as Array<Record<string, unknown>>)
      : [];
    return {
      count: Number(raw.count ?? items.length),
      limit: Number(raw.limit ?? 0),
      offset: Number(raw.offset ?? 0),
      transactions: items.map((t) => ({
        id: String(t.id ?? ''),
        amount: Number(t.amount ?? 0),
        type: String(t.type ?? ''),
        description: t.description ? String(t.description) : undefined,
        order_id: t.order_id ? String(t.order_id) : undefined,
        balance_before: Number(t.balance_before ?? 0),
        balance_after: Number(t.balance_after ?? 0),
        created_at: String(t.created_at ?? ''),
      })),
    };
  }

  async createOrder(service: string, country: string): Promise<Order> {
    this.requireApiKey();
    const res = await this.http.post('/api/v1/customer/purchase', { service, country });
    return res.data as Order;
  }

  async getOrder(orderId: string): Promise<Order> {
    this.requireApiKey();
    const res = await this.http.get(`/api/v1/customer/order/${orderId}`);
    return res.data as Order;
  }

  async swapNumber(orderId: string): Promise<Order> {
    this.requireApiKey();
    const res = await this.http.post(`/api/v1/customer/swap/${orderId}`);
    return res.data as Order;
  }

  async cancelOrder(orderId: string): Promise<CancelResult> {
    this.requireApiKey();
    const res = await this.http.post(`/api/v1/customer/cancel/${orderId}`);
    return res.data as CancelResult;
  }

  async completeOrder(orderId: string): Promise<Order> {
    this.requireApiKey();
    // No separate "complete" endpoint — just return the current order status
    return this.getOrder(orderId);
  }

  async listOrders(status?: string): Promise<Order[]> {
    this.requireApiKey();
    const params = status ? { status } : {};
    try {
      const res = await this.http.get('/api/v1/customer/orders', { params });
      const raw = res.data;
      // Handle both array and {orders: [...]} shapes
      const orders: Array<Record<string, unknown>> = Array.isArray(raw) ? raw : (raw?.orders ?? []);
      // Map 'id' → 'order_id' for consistency with other endpoints
      return orders.map((o) => ({
        order_id: String(o.order_id ?? o.id ?? ''),
        phone_number: String(o.phone_number ?? ''),
        service: String(o.service_id ?? o.service ?? ''),
        country: String(o.country_id ?? o.country ?? ''),
        price: Number(o.price_charged ?? o.price ?? 0),
        created_at: o.created_at ? String(o.created_at) : undefined,
        expires_at: o.expires_at ? String(o.expires_at) : undefined,
        status: String(o.status ?? ''),
        sms_code: o.sms_code ? String(o.sms_code) : undefined,
        sms_text: o.sms_text ? String(o.sms_text) : undefined,
      })) as Order[];
    } catch (err) {
      // Endpoint may not exist yet — return empty list gracefully
      const message = (err as Error).message;
      if (message.includes('Not found') || message.includes('404')) {
        return [];
      }
      throw err;
    }
  }

  async listProxyCatalog(): Promise<ProxyCatalogPoolType[]> {
    const res = await this.http.get('/api/v1/proxies/catalog');
    const raw = Array.isArray(res.data?.pool_types) ? res.data.pool_types : (Array.isArray(res.data) ? res.data : []);
    return raw.map((p: Record<string, unknown>) => ({
      id: String(p.id ?? ''),
      label: String(p.label ?? ''),
      price_per_gb: Number(p.price_per_gb ?? 0),
      countries: Array.isArray(p.countries)
        ? p.countries.map((c: Record<string, unknown>) => ({
            code: String(c.code ?? ''),
            name: String(c.name ?? ''),
            available: Boolean(c.available),
            ip_count: Number(c.ip_count ?? 0),
          }))
        : [],
    }));
  }

  async listProxies(): Promise<ProxyListItem[]> {
    this.requireApiKey();
    const res = await this.http.get('/api/v1/proxies');
    const raw = Array.isArray(res.data) ? res.data : [];
    return raw.map((p: Record<string, unknown>) => ({
      proxy_id: String(p.proxy_id ?? ''),
      pool_type: String(p.pool_type ?? ''),
      country_code: String(p.country_code ?? ''),
      country_name: p.country_name ? String(p.country_name) : undefined,
      gb_total: Number(p.gb_total ?? 0),
      gb_used: Number(p.gb_used ?? 0),
      gb_remaining: Number(p.gb_remaining ?? 0),
      proxy_host: String(p.proxy_host ?? ''),
      proxy_port: Number(p.proxy_port ?? 0),
      proxy_login: String(p.proxy_login ?? ''),
      proxy_password: String(p.proxy_password ?? ''),
      updated_at: p.updated_at ? String(p.updated_at) : undefined,
      created_at: p.created_at ? String(p.created_at) : undefined,
    }));
  }

  async purchaseProxy(params: {
    pool_type: string;
    gb: number;
    country_code?: string;
    idempotency_key?: string;
  }): Promise<ProxyPurchaseResult> {
    this.requireApiKey();
    const res = await this.http.post('/api/v1/proxies', params);
    return res.data as ProxyPurchaseResult;
  }

  async rotateProxy(proxyId: string, port?: number): Promise<ProxyRotateResult> {
    this.requireApiKey();
    const body = typeof port === 'number' ? { port } : {};
    const res = await this.http.post(`/api/v1/proxies/${proxyId}/rotate`, body);
    return res.data as ProxyRotateResult;
  }

  async getProxyUsage(proxyId: string): Promise<ProxyUsage> {
    this.requireApiKey();
    const res = await this.http.get(`/api/v1/proxies/${proxyId}/usage`);
    const d = (res.data ?? {}) as Record<string, unknown>;
    return {
      gb_used: Number(d.gb_used ?? 0),
      gb_remaining: Number(d.gb_remaining ?? 0),
      requests: Number(d.requests ?? 0),
      updated_at: d.updated_at ? String(d.updated_at) : undefined,
    };
  }

  async getProxyUsageHistory(proxyId: string, range?: '7d' | '30d'): Promise<ProxyUsageHistoryResult> {
    this.requireApiKey();
    const res = await this.http.get(`/api/v1/proxies/${proxyId}/usage-history`, {
      params: range ? { range } : undefined,
    });
    const d = (res.data ?? {}) as Record<string, unknown>;
    const series = Array.isArray(d.series) ? (d.series as Array<Record<string, unknown>>) : [];
    const totals = (d.totals ?? {}) as Record<string, unknown>;
    return {
      series: series.map((p) => ({
        date: String(p.date ?? ''),
        gb: Number(p.gb ?? 0),
        requests: Number(p.requests ?? 0),
      })),
      totals: {
        gb: Number(totals.gb ?? 0),
        requests: Number(totals.requests ?? 0),
      },
    };
  }

  /**
   * SetTargeting updates the sub-user's DEFAULT geo-targeting via the
   * reseller API (persisted server-side, applies to future connections that
   * don't override it). Country-only is free; cities/asns bill the
   * customer's own funded GB at 2x on non-premium pools (backend response
   * carries premium_2x so the caller can warn). Matches
   * ws-gateway/handlers/proxies.go SetTargeting exactly — note the backend
   * does NOT accept state/zip here (only country_code + cities + asns);
   * state/zip refinement is a per-connection username param only — see
   * generateProxyEndpoint.
   */
  async setProxyTargeting(proxyId: string, params: {
    countryCode: string;
    cities?: string[];
    asns?: number[];
  }): Promise<ProxyTargetingResult> {
    this.requireApiKey();
    const res = await this.http.post(`/api/v1/proxies/${proxyId}/targeting`, {
      country_code: params.countryCode,
      cities: params.cities,
      asns: params.asns,
    });
    const d = (res.data ?? {}) as Record<string, unknown>;
    return {
      ok: Boolean(d.ok),
      country_code: String(d.country_code ?? params.countryCode),
      premium_2x: Boolean(d.premium_2x),
    };
  }

  /**
   * TestProxy dials out through the proxy and reports the exit IP/country —
   * the only backend-supported use of a per-request `session` param
   * (rotating|sticky). Matches ws-gateway/handlers/proxies.go TestProxy.
   * Server-side cooldown (~20s) applies; a 429 surfaces as a thrown Error
   * via the response interceptor.
   */
  async testProxy(proxyId: string, params: {
    country: string;
    session?: 'rotating' | 'sticky';
    protocol?: 'http' | 'socks5';
  }): Promise<ProxyTestResult> {
    this.requireApiKey();
    const res = await this.http.post(`/api/v1/proxies/${proxyId}/test`, {
      country: params.country,
      session: params.session,
      protocol: params.protocol,
    });
    const d = (res.data ?? {}) as Record<string, unknown>;
    return {
      ok: Boolean(d.ok),
      exit_ip: d.exit_ip ? String(d.exit_ip) : undefined,
      country_code: d.country_code ? String(d.country_code) : undefined,
      country_name: d.country_name ? String(d.country_name) : undefined,
      city: d.city ? String(d.city) : undefined,
      region: d.region ? String(d.region) : undefined,
      isp: d.isp ? String(d.isp) : undefined,
      asn: d.asn ? String(d.asn) : undefined,
      latency_ms: typeof d.latency_ms === 'number' ? d.latency_ms : undefined,
      error: d.error ? String(d.error) : undefined,
    };
  }

  /**
   * GetLocations — public inventory endpoint (no auth, no FEATURE_PROXIES
   * gate). Backend excludes residential_premium from pool_type here (its
   * locations API doesn't support it) — see
   * ws-gateway/handlers/proxies.go GetLocations validLocPoolTypes.
   */
  async listProxyLocations(params: {
    poolType: 'residential' | 'mobile' | 'datacenter';
    country: string;
    kind: 'cities' | 'states' | 'asns' | 'zipcodes';
  }): Promise<ProxyLocationItem[]> {
    const res = await this.http.get('/api/v1/proxies/locations', {
      params: { pool_type: params.poolType, country: params.country, kind: params.kind },
    });
    const items = Array.isArray(res.data?.items) ? (res.data.items as Array<Record<string, unknown>>) : [];
    return items.map((it) => ({
      code: String(it.code ?? ''),
      name: String(it.name ?? ''),
      count: Number(it.count ?? 0),
    }));
  }

  /**
   * generateProxyEndpoint composes ready-to-use connection string(s) — no
   * backend call. Mirrors the frontend's ProxyEndpointGenerator
   * (frontend/src/components/my-numbers-v2/ProxyEndpointGenerator.tsx)
   * buildUsername()/buildEndpoint() exactly: targeting is encoded in the
   * username at connection time per the per-connection convention in
   * Vault/Operations/proxy-system.md §2 — one credential serves every
   * country/refinement, nothing is purchased or persisted here. Looks up
   * the proxy's login/password/host/port via listProxies() first.
   */
  async generateProxyEndpoint(params: {
    proxyId: string;
    countryCode: string;
    targetBy?: 'country' | 'state' | 'city' | 'zip' | 'asn';
    locationCode?: string;
    session?: 'rotating' | 'sticky';
    stickyTtlMinutes?: number;
    count?: number;
    protocol?: 'HTTP' | 'SOCKS5';
    format?: 'host:port:user:pass' | 'user:pass@host:port' | 'curl';
  }): Promise<ProxyEndpointResult> {
    this.requireApiKey();
    const proxies = await this.listProxies();
    const proxy = proxies.find((p) => p.proxy_id === params.proxyId);
    if (!proxy) {
      throw new Error(`Not found: proxy ${params.proxyId} does not exist on this account`);
    }
    return buildProxyEndpointResult(proxy, params);
  }

  async startManualRegistrationSession(params: {
    serviceName?: string;
    country?: string;
    deviceMode?: 'desktop' | 'mobile';
    withProxy?: boolean;
    targetUrl?: string;
    orderId?: string;
    mode?: 'attach' | 'fresh';
  }): Promise<BrowserSessionResult> {
    this.requireApiKey();
    const withProxy = params.withProxy ?? Boolean(params.country);
    const res = await this.http.post('/api/v1/browser-sessions/start', {
      serviceName: params.serviceName,
      country: params.country,
      deviceMode: params.deviceMode,
      withProxy,
      targetUrl: params.targetUrl,
      orderId: params.orderId,
      mode: params.mode ?? 'fresh',
    });
    const data = res.data as { session?: BrowserSessionResult };
    return data.session ?? (res.data as BrowserSessionResult);
  }

  async prepBrowserSession(
    sessionId: string,
    preset: 'generic' | 'telegram',
    targetUrl?: string,
  ): Promise<BrowserSessionResult> {
    this.requireApiKey();
    const res = await this.http.post(`/api/v1/browser-sessions/${sessionId}/prep`, {
      preset,
      targetUrl,
    });
    const data = res.data as { session?: BrowserSessionResult };
    return data.session ?? (res.data as BrowserSessionResult);
  }

  async stopBrowserSession(sessionId: string): Promise<BrowserSessionResult> {
    this.requireApiKey();
    const res = await this.http.post(`/api/v1/browser-sessions/${sessionId}/stop`, {});
    const data = res.data as { session?: BrowserSessionResult };
    return data.session ?? (res.data as BrowserSessionResult);
  }

  /** Drive an existing (owned) session's address bar to a URL — runs async server-side, returns 202 immediately. */
  async navigateBrowserSession(sessionId: string, url: string): Promise<NavigateSessionResult> {
    this.requireApiKey();
    const res = await this.http.post(`/api/v1/browser-sessions/${sessionId}/navigate`, { url });
    return res.data as NavigateSessionResult;
  }

  /** Session detail incl. our own proxied viewer_url (never the raw upstream debug URL). */
  async getBrowserSession(sessionId: string): Promise<BrowserSessionResult> {
    this.requireApiKey();
    const res = await this.http.get(`/api/v1/browser-sessions/${sessionId}`);
    const data = res.data as { session?: BrowserSessionResult };
    return data.session ?? (res.data as BrowserSessionResult);
  }

  getApiKey(): string | undefined {
    return this.apiKey;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  // ─── Rentals ──────────────────────────────────────────────────────────────

  async listRentalPricing(): Promise<RentalPricingTier[]> {
    const res = await this.http.get('/api/v1/rentals/pricing');
    return (Array.isArray(res.data) ? res.data : []) as RentalPricingTier[];
  }

  async getRentalAvailability(params: {
    country?: string;
    service?: string;
    type?: 'service' | 'full';
    tier?: 'full_access' | 'platform';
  } = {}): Promise<RentalAvailabilityResult> {
    const res = await this.http.get('/api/v1/rentals/available', {
      params: {
        country: params.country,
        service: params.service,
        type: params.type,
        // "platform" tier maps to the backend's opaque provider=network token.
        provider: params.tier === 'platform' ? 'network' : undefined,
      },
    });
    return res.data as RentalAvailabilityResult;
  }

  async listRentalServices(params: {
    countryCode: string;
    durationHours?: number;
  }): Promise<RentalCatalogService[]> {
    const res = await this.http.get('/api/v1/rentals/services', {
      params: {
        country_code: params.countryCode,
        duration: params.durationHours,
      },
    });
    const raw: Array<Record<string, unknown>> = Array.isArray(res.data) ? res.data : [];
    // Explicit field allowlist — the backend response includes an internal
    // supplier-code field we never forward (see HARD RULE 5 in this repo).
    return raw.map((s) => ({
      service_id: String(s.service_id ?? ''),
      service_name: String(s.service_name ?? ''),
      physical_count: Number(s.physical_count ?? 0),
      our_price: s.our_price !== undefined ? Number(s.our_price) : undefined,
      base_price: s.base_price !== undefined ? Number(s.base_price) : undefined,
      popular: Boolean(s.popular),
      icon_url: s.icon_url ? String(s.icon_url) : undefined,
    }));
  }

  async getRentalPrice(params: {
    service: string;
    countryCode: string;
    durationHours: number;
  }): Promise<RentalPriceResult> {
    const res = await this.http.get('/api/v1/rentals/price', {
      params: {
        service: params.service,
        country_code: params.countryCode,
        duration: params.durationHours,
      },
    });
    return res.data as RentalPriceResult;
  }

  /** Full Access tier — local SIM inventory, any service, no refund countdown. */
  async createFullAccessRental(params: {
    country: string;
    rentalType: 'service' | 'full';
    durationHours: number;
    service?: string;
    autoRenew?: boolean;
  }): Promise<CreateRentalResult> {
    this.requireApiKey();
    const res = await this.http.post('/api/v1/rentals', {
      country: params.country,
      rental_type: params.rentalType,
      duration_hours: params.durationHours,
      service: params.service,
      auto_renew: params.autoRenew ?? false,
    });
    return res.data as CreateRentalResult;
  }

  /**
   * Platform tier — sourced via our global supplier network, locked to one
   * service per number, durations 1/3/7 days only, 20-minute refund window.
   * Takes country_code (ISO) and resolves the internal numeric ID itself —
   * callers never need to know or pass the numeric ID.
   */
  async createPlatformRental(params: {
    service: string;
    countryCode: string;
    durationHours: number;
  }): Promise<CreateRentalResult> {
    this.requireApiKey();
    const countryID = PLATFORM_TIER_COUNTRY_IDS[params.countryCode.toUpperCase()];
    if (!countryID && countryID !== 0) {
      throw new Error(
        `Platform-tier rentals are not available for country_code "${params.countryCode}". ` +
        'Use rentals_available with tier=platform to see supported countries.'
      );
    }
    const res = await this.http.post('/api/v1/rentals/provider', {
      service: params.service,
      country: countryID,
      duration_hours: params.durationHours,
      provider: 'network',
    });
    const data = res.data as Record<string, unknown>;
    return {
      success: Boolean(data.success ?? true),
      rental_id: String(data.rental_id ?? ''),
      phone_number: String(data.phone_number ?? ''),
      expires_at: String(data.expires_at ?? ''),
      retail_cost: data.retail_cost !== undefined ? Number(data.retail_cost) : undefined,
      currency: data.currency !== undefined ? String(data.currency) : undefined,
      status: 'active',
    };
  }

  async listRentals(status?: string): Promise<Rental[]> {
    this.requireApiKey();
    const res = await this.http.get('/api/v1/rentals', { params: status ? { status } : {} });
    return (Array.isArray(res.data) ? res.data : []) as Rental[];
  }

  async getRental(rentalId: string): Promise<Rental | undefined> {
    const all = await this.listRentals('all');
    return all.find((r) => r.id === rentalId);
  }

  async extendRental(rentalId: string, durationHours: number): Promise<RentalActionResult> {
    this.requireApiKey();
    const res = await this.http.post(`/api/v1/rentals/${rentalId}/extend`, {
      duration_hours: durationHours,
    });
    return res.data as RentalActionResult;
  }

  /** Full refund — only eligible within 20 minutes of purchase and 0 SMS received. Any provider. */
  async cancelRental(rentalId: string): Promise<RentalActionResult> {
    this.requireApiKey();
    const res = await this.http.post(`/api/v1/rentals/${rentalId}/cancel`, {});
    return res.data as RentalActionResult;
  }

  /** Early release with pro-rated refund — Full Access (local) tier only, after a 2h minimum hold. */
  async releaseRental(rentalId: string): Promise<RentalActionResult> {
    this.requireApiKey();
    const res = await this.http.post(`/api/v1/rentals/${rentalId}/release`, {});
    return res.data as RentalActionResult;
  }

  // ─── Orders — retry ───────────────────────────────────────────────────────

  /** Ask the current provider to resend the SMS to the SAME number (not a new number — see swapNumber for that). */
  async retryOrder(orderId: string): Promise<RetryOrderResult> {
    this.requireApiKey();
    const res = await this.http.post(`/api/v1/orders/${orderId}/retry`, {});
    return res.data as RetryOrderResult;
  }

  // ─── Public tools ───────────────────────────────────────────────────────

  /** Public carrier + line-type lookup for an arbitrary E.164 number. No API key required. */
  async checkNumber(number: string): Promise<NumberCheckResult> {
    const res = await this.http.get('/api/v1/tools/number-check', { params: { number } });
    return res.data as NumberCheckResult;
  }
}

// ─── Client interface ────────────────────────────────────────────────────────
// Structural contract shared by VirtualSMSClient (real backend) and
// MockVirtualSMSClient (sandbox — see src/sandbox/mock-http.ts). Tool handlers
// in tools.ts accept this interface instead of the concrete class so the same
// handler code runs unmodified against either implementation.
export interface IVirtualSMSClient {
  requireApiKey(): void;
  getApiKey(): string | undefined;
  getBaseUrl(): string;

  listServices(): Promise<Service[]>;
  listCountries(): Promise<Country[]>;
  checkPrice(service: string, country: string): Promise<Price>;
  getCatalogCountries(service: string): Promise<CatalogCountry[]>;
  checkNumber(number: string): Promise<NumberCheckResult>;

  getBalance(): Promise<Balance>;
  getProfile(): Promise<Profile>;
  getTransactions(params?: {
    type?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): Promise<TransactionsPage>;

  createOrder(service: string, country: string): Promise<Order>;
  getOrder(orderId: string): Promise<Order>;
  swapNumber(orderId: string): Promise<Order>;
  cancelOrder(orderId: string): Promise<CancelResult>;
  completeOrder(orderId: string): Promise<Order>;
  listOrders(status?: string): Promise<Order[]>;

  listProxyCatalog(): Promise<ProxyCatalogPoolType[]>;
  listProxies(): Promise<ProxyListItem[]>;
  purchaseProxy(params: {
    pool_type: string;
    gb: number;
    country_code?: string;
    idempotency_key?: string;
  }): Promise<ProxyPurchaseResult>;
  rotateProxy(proxyId: string, port?: number): Promise<ProxyRotateResult>;
  getProxyUsage(proxyId: string): Promise<ProxyUsage>;
  getProxyUsageHistory(proxyId: string, range?: '7d' | '30d'): Promise<ProxyUsageHistoryResult>;
  setProxyTargeting(proxyId: string, params: {
    countryCode: string;
    cities?: string[];
    asns?: number[];
  }): Promise<ProxyTargetingResult>;
  testProxy(proxyId: string, params: {
    country: string;
    session?: 'rotating' | 'sticky';
    protocol?: 'http' | 'socks5';
  }): Promise<ProxyTestResult>;
  listProxyLocations(params: {
    poolType: 'residential' | 'mobile' | 'datacenter';
    country: string;
    kind: 'cities' | 'states' | 'asns' | 'zipcodes';
  }): Promise<ProxyLocationItem[]>;
  generateProxyEndpoint(params: {
    proxyId: string;
    countryCode: string;
    targetBy?: 'country' | 'state' | 'city' | 'zip' | 'asn';
    locationCode?: string;
    session?: 'rotating' | 'sticky';
    stickyTtlMinutes?: number;
    count?: number;
    protocol?: 'HTTP' | 'SOCKS5';
    format?: 'host:port:user:pass' | 'user:pass@host:port' | 'curl';
  }): Promise<ProxyEndpointResult>;

  startManualRegistrationSession(params: {
    serviceName?: string;
    country?: string;
    deviceMode?: 'desktop' | 'mobile';
    withProxy?: boolean;
    targetUrl?: string;
    orderId?: string;
    mode?: 'attach' | 'fresh';
  }): Promise<BrowserSessionResult>;
  prepBrowserSession(
    sessionId: string,
    preset: 'generic' | 'telegram',
    targetUrl?: string,
  ): Promise<BrowserSessionResult>;
  stopBrowserSession(sessionId: string): Promise<BrowserSessionResult>;
  navigateBrowserSession(sessionId: string, url: string): Promise<NavigateSessionResult>;
  getBrowserSession(sessionId: string): Promise<BrowserSessionResult>;

  listRentalPricing(): Promise<RentalPricingTier[]>;
  getRentalAvailability(params?: {
    country?: string;
    service?: string;
    type?: 'service' | 'full';
    tier?: 'full_access' | 'platform';
  }): Promise<RentalAvailabilityResult>;
  listRentalServices(params: {
    countryCode: string;
    durationHours?: number;
  }): Promise<RentalCatalogService[]>;
  getRentalPrice(params: {
    service: string;
    countryCode: string;
    durationHours: number;
  }): Promise<RentalPriceResult>;
  createFullAccessRental(params: {
    country: string;
    rentalType: 'service' | 'full';
    durationHours: number;
    service?: string;
    autoRenew?: boolean;
  }): Promise<CreateRentalResult>;
  createPlatformRental(params: {
    service: string;
    countryCode: string;
    durationHours: number;
  }): Promise<CreateRentalResult>;
  listRentals(status?: string): Promise<Rental[]>;
  getRental(rentalId: string): Promise<Rental | undefined>;
  extendRental(rentalId: string, durationHours: number): Promise<RentalActionResult>;
  cancelRental(rentalId: string): Promise<RentalActionResult>;
  releaseRental(rentalId: string): Promise<RentalActionResult>;

  retryOrder(orderId: string): Promise<RetryOrderResult>;
}
