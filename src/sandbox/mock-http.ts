/**
 * Sandbox mock client — stands in for VirtualSMSClient when VIRTUALSMS_SANDBOX
 * is active. No real network calls, no API key required. Returns realistic
 * FAKE data so an agent (or a registry scanner) can exercise every tool
 * end-to-end without touching production or spending real money.
 *
 * Structural contract: this class implements the same public method surface
 * as VirtualSMSClient (same names, params, return shapes) so tools.ts handlers
 * work unmodified against either — TypeScript structural typing does the rest.
 * It does NOT extend VirtualSMSClient (no real axios instance, no real base
 * URL requirement) to keep it fully offline.
 */

import { randomUUID } from 'node:crypto';
import type {
  IVirtualSMSClient,
  Service,
  Country,
  Price,
  CatalogCountry,
  Balance,
  Profile,
  Transaction,
  TransactionsPage,
  Order,
  CancelResult,
  ProxyCatalogPoolType,
  ProxyListItem,
  ProxyPurchaseResult,
  ProxyRotateResult,
  ProxyUsage,
  ProxyUsageHistoryResult,
  ProxyTargetingResult,
  ProxyTestResult,
  ProxyLocationItem,
  ProxyEndpointResult,
  BrowserSessionResult,
  NavigateSessionResult,
  RentalPricingTier,
  RentalAvailabilityResult,
  RentalCatalogService,
  RentalPriceResult,
  Rental,
  CreateRentalResult,
  RentalActionResult,
  RetryOrderResult,
  NumberCheckResult,
} from '../client.js';
import { buildProxyEndpointResult } from '../client.js';

const SANDBOX_VIEWER_URL = 'https://virtualsms.io/sandbox/session-viewer-placeholder';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Small canned catalog — enough variety to exercise search/find_cheapest/list flows.
const MOCK_SERVICES: Service[] = [
  { code: 'telegram', name: 'Telegram' },
  { code: 'whatsapp', name: 'WhatsApp' },
  { code: 'google', name: 'Google' },
  { code: 'discord', name: 'Discord' },
  { code: 'uber', name: 'Uber' },
];

const MOCK_COUNTRIES: Country[] = [
  { iso: 'US', name: 'United States' },
  { iso: 'GB', name: 'United Kingdom' },
  { iso: 'DE', name: 'Germany' },
  { iso: 'ID', name: 'Indonesia' },
  { iso: 'PH', name: 'Philippines' },
];

const MOCK_PRICE_TABLE: Record<string, number> = {
  US: 1.2, GB: 0.95, DE: 1.05, ID: 0.35, PH: 0.4,
};

interface MockOrderState extends Order {
  _createdAtMs: number;
  _smsAtMs: number; // when the fake SMS becomes visible
}

interface MockRentalState extends Rental {
  _createdAtMs: number;
}

interface MockProxyState extends ProxyListItem {}

export class MockVirtualSMSClient implements IVirtualSMSClient {
  private readonly baseUrl: string;
  private readonly orders = new Map<string, MockOrderState>();
  private readonly rentals = new Map<string, MockRentalState>();
  private readonly proxies = new Map<string, MockProxyState>();
  private readonly sessions = new Map<string, BrowserSessionResult>();
  private balanceUsd = 500.0;
  private orderSeq = 0;
  private rentalSeq = 0;
  private proxySeq = 0;
  private sessionSeq = 0;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    process.stderr.write(
      '[virtualsms-mcp] SANDBOX MODE active: serving fake in-memory data, no API key required, no real network calls.\n'
    );
  }

  // requireApiKey is a no-op in sandbox — every tool works with zero key.
  requireApiKey(): void {
    return;
  }

  getApiKey(): string | undefined {
    return undefined;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  // ─── Discovery ──────────────────────────────────────────────────────────

  async listServices(): Promise<Service[]> {
    return MOCK_SERVICES;
  }

  async listCountries(): Promise<Country[]> {
    return MOCK_COUNTRIES;
  }

  async checkPrice(service: string, country: string): Promise<Price> {
    const iso = country.toUpperCase();
    const known = MOCK_COUNTRIES.some((c) => c.iso === iso);
    const price = MOCK_PRICE_TABLE[iso] ?? 0.5;
    return {
      price_usd: price,
      currency: 'USD',
      available: known,
    };
  }

  async getCatalogCountries(_service: string): Promise<CatalogCountry[]> {
    return MOCK_COUNTRIES.map((c) => ({
      iso: c.iso,
      name: c.name,
      price_usd: MOCK_PRICE_TABLE[c.iso] ?? 0.5,
      count: 10,
    }));
  }

  async checkNumber(number: string): Promise<NumberCheckResult> {
    return {
      valid: true,
      e164: number,
      national: number.replace(/^\+\d{1,3}/, ''),
      country_code: 'US',
      country_name: 'United States',
      country_prefix: '+1',
      location: 'Sandbox',
      carrier: 'Sandbox Mobile',
      line_type: 'mobile',
      spam_risk: 'low',
      cached: false,
      message: 'Sandbox mock result, not a real lookup.',
    };
  }

  // ─── Account ────────────────────────────────────────────────────────────

  async getBalance(): Promise<Balance> {
    return { balance_usd: Math.round(this.balanceUsd * 100) / 100 };
  }

  async getProfile(): Promise<Profile> {
    return {
      id: 'sandbox-user-0001',
      email: 'sandbox@virtualsms.io',
      telegram_linked: false,
      balance_usd: this.balanceUsd,
      total_spent_usd: 12.5,
      total_credits_usd: 500,
      total_orders: this.orders.size,
      active_api_keys: 0,
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  async getTransactions(params: {
    type?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<TransactionsPage> {
    const all: Transaction[] = [
      {
        id: 'txn-sandbox-0001',
        amount: 500,
        type: 'deposit',
        description: 'Sandbox seed balance',
        balance_before: 0,
        balance_after: 500,
        created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];
    const filtered = params.type ? all.filter((t) => t.type === params.type) : all;
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;
    return {
      count: filtered.length,
      limit,
      offset,
      transactions: filtered.slice(offset, offset + limit),
    };
  }

  // ─── Orders ─────────────────────────────────────────────────────────────

  async createOrder(service: string, country: string): Promise<Order> {
    this.orderSeq++;
    const orderId = `sandbox-order-${String(this.orderSeq).padStart(4, '0')}`;
    const phoneNumber = `+1555${String(1000000 + this.orderSeq).slice(-7)}`;
    const price = MOCK_PRICE_TABLE[country.toUpperCase()] ?? 0.5;
    this.balanceUsd = Math.round((this.balanceUsd - price) * 100) / 100;
    const now = Date.now();
    const order: MockOrderState = {
      order_id: orderId,
      phone_number: phoneNumber,
      service,
      country: country.toUpperCase(),
      price,
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + 20 * 60 * 1000).toISOString(),
      status: 'waiting',
      cancel_available_at: new Date(now + 120 * 1000).toISOString(),
      swap_available_at: new Date(now + 120 * 1000).toISOString(),
      _createdAtMs: now,
      // Fake SMS "arrives" ~3s after purchase — fast enough for a demo/test
      // flow, but still exercises the wait/poll path.
      _smsAtMs: now + 3000,
    };
    this.orders.set(orderId, order);
    return order;
  }

  async getOrder(orderId: string): Promise<Order> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Not found: sandbox order ${orderId} does not exist`);
    }
    if (Date.now() >= order._smsAtMs && order.status === 'waiting') {
      order.status = 'sms_received';
      order.sms_code = String(100000 + (this.orderSeq * 7919) % 900000);
      order.sms_text = `Your VirtualSMS sandbox verification code is ${order.sms_code}`;
      order.messages = [
        { content: order.sms_text, sender: 'SANDBOX', received_at: new Date().toISOString() },
      ];
    }
    return order;
  }

  async swapNumber(orderId: string): Promise<Order> {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`Not found: sandbox order ${orderId} does not exist`);
    this.orderSeq++;
    order.phone_number = `+1555${String(1000000 + this.orderSeq).slice(-7)}`;
    order.status = 'waiting';
    order.sms_code = undefined;
    order.sms_text = undefined;
    order.messages = undefined;
    const now = Date.now();
    order._smsAtMs = now + 3000;
    order.swap_available_at = new Date(now + 120 * 1000).toISOString();
    return order;
  }

  async cancelOrder(orderId: string): Promise<CancelResult> {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`Not found: sandbox order ${orderId} does not exist`);
    order.status = 'cancelled';
    if (typeof order.price === 'number') {
      this.balanceUsd = Math.round((this.balanceUsd + order.price) * 100) / 100;
    }
    return { success: true, refunded: true };
  }

  async completeOrder(orderId: string): Promise<Order> {
    return this.getOrder(orderId);
  }

  async listOrders(status?: string): Promise<Order[]> {
    const all = Array.from(this.orders.values());
    if (!status) return all;
    return all.filter((o) => o.status === status);
  }

  // ─── Proxies ────────────────────────────────────────────────────────────

  async listProxyCatalog(): Promise<ProxyCatalogPoolType[]> {
    return [
      {
        id: 'residential',
        label: 'Residential',
        price_per_gb: 4.5,
        countries: [
          { code: 'US', name: 'United States', available: true, ip_count: 15000 },
          { code: 'DE', name: 'Germany', available: true, ip_count: 8200 },
        ],
      },
      {
        id: 'datacenter',
        label: 'Datacenter',
        price_per_gb: 0.8,
        countries: [
          { code: 'US', name: 'United States', available: true, ip_count: 5000 },
        ],
      },
    ];
  }

  async listProxies(): Promise<ProxyListItem[]> {
    return Array.from(this.proxies.values());
  }

  async purchaseProxy(params: {
    pool_type: string;
    gb: number;
    country_code?: string;
    idempotency_key?: string;
  }): Promise<ProxyPurchaseResult> {
    this.proxySeq++;
    const proxyId = `sandbox-proxy-${String(this.proxySeq).padStart(4, '0')}`;
    const countryCode = (params.country_code ?? 'us').toUpperCase();
    const pricePerGb = params.pool_type === 'residential' ? 4.5 : 0.8;
    const price = Math.round(pricePerGb * params.gb * 100) / 100;
    this.balanceUsd = Math.round((this.balanceUsd - price) * 100) / 100;
    const proxy: MockProxyState = {
      proxy_id: proxyId,
      pool_type: params.pool_type,
      country_code: countryCode,
      country_name: countryCode,
      gb_total: params.gb,
      gb_used: 0,
      gb_remaining: params.gb,
      proxy_host: 'sandbox-proxy.virtualsms.io',
      proxy_port: 10000 + this.proxySeq,
      proxy_login: `sandbox_${proxyId}`,
      proxy_password: randomUUID().slice(0, 12),
      created_at: new Date().toISOString(),
    };
    this.proxies.set(proxyId, proxy);
    return {
      proxy_id: proxy.proxy_id,
      pool_type: proxy.pool_type,
      gb_added: params.gb,
      gb_remaining: proxy.gb_remaining,
      country_code: proxy.country_code,
      proxy_login: proxy.proxy_login,
      proxy_password: proxy.proxy_password,
      proxy_host: proxy.proxy_host,
      proxy_port: proxy.proxy_port,
      price,
      balance: this.balanceUsd,
    };
  }

  async rotateProxy(proxyId: string, port?: number): Promise<ProxyRotateResult> {
    const proxy = this.proxies.get(proxyId);
    if (!proxy) throw new Error(`Not found: sandbox proxy ${proxyId} does not exist`);
    return {
      rotated: true,
      port: port ?? proxy.proxy_port,
      message: 'Sandbox proxy IP rotated (fake ack, no real proxy exists).',
    };
  }

  async getProxyUsage(proxyId: string): Promise<ProxyUsage> {
    const proxy = this.proxies.get(proxyId);
    if (!proxy) throw new Error(`Not found: sandbox proxy ${proxyId} does not exist`);
    return {
      gb_used: proxy.gb_used,
      gb_remaining: proxy.gb_remaining,
      requests: 1337,
      updated_at: new Date().toISOString(),
    };
  }

  async getProxyUsageHistory(proxyId: string, range?: '7d' | '30d'): Promise<ProxyUsageHistoryResult> {
    const proxy = this.proxies.get(proxyId);
    if (!proxy) throw new Error(`Not found: sandbox proxy ${proxyId} does not exist`);
    const days = range === '30d' ? 30 : 7;
    const series = Array.from({ length: days }, (_, i) => ({
      date: new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10),
      gb: Math.round(Math.random() * 100) / 100,
      requests: Math.floor(Math.random() * 500),
    }));
    return {
      series,
      totals: {
        gb: Math.round(series.reduce((s, p) => s + p.gb, 0) * 100) / 100,
        requests: series.reduce((s, p) => s + p.requests, 0),
      },
    };
  }

  async setProxyTargeting(proxyId: string, params: {
    countryCode: string;
    cities?: string[];
    asns?: number[];
  }): Promise<ProxyTargetingResult> {
    const proxy = this.proxies.get(proxyId);
    if (!proxy) throw new Error(`Not found: sandbox proxy ${proxyId} does not exist`);
    const premium2x = ((params.cities?.length ?? 0) > 0 || (params.asns?.length ?? 0) > 0)
      && proxy.pool_type !== 'residential_premium';
    proxy.country_code = params.countryCode.toUpperCase();
    return { ok: true, country_code: params.countryCode, premium_2x: premium2x };
  }

  async testProxy(proxyId: string, params: {
    country: string;
    session?: 'rotating' | 'sticky';
    protocol?: 'http' | 'socks5';
  }): Promise<ProxyTestResult> {
    const proxy = this.proxies.get(proxyId);
    if (!proxy) throw new Error(`Not found: sandbox proxy ${proxyId} does not exist`);
    const cc = params.country.toUpperCase();
    return {
      ok: true,
      exit_ip: '198.51.100.42',
      country_code: cc,
      country_name: MOCK_COUNTRIES.find((c) => c.iso === cc)?.name ?? cc,
      city: 'Sandbox City',
      region: 'Sandbox Region',
      isp: 'Sandbox Network',
      asn: 'AS64512',
      latency_ms: 120,
    };
  }

  async listProxyLocations(params: {
    poolType: 'residential' | 'mobile' | 'datacenter';
    country: string;
    kind: 'cities' | 'states' | 'asns' | 'zipcodes';
  }): Promise<ProxyLocationItem[]> {
    const base: Record<string, string> = {
      cities: 'City',
      states: 'State',
      asns: 'AS64512',
      zipcodes: '10001',
    };
    return [
      { code: base[params.kind] ?? 'x1', name: `Sandbox ${params.kind} 1`, count: 500 },
      { code: `${base[params.kind] ?? 'x2'}-2`, name: `Sandbox ${params.kind} 2`, count: 120 },
    ];
  }

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
    const proxy = this.proxies.get(params.proxyId);
    if (!proxy) throw new Error(`Not found: sandbox proxy ${params.proxyId} does not exist`);
    return buildProxyEndpointResult(proxy, params);
  }

  // ─── Browser sessions ───────────────────────────────────────────────────

  async startManualRegistrationSession(params: {
    serviceName?: string;
    country?: string;
    deviceMode?: 'desktop' | 'mobile';
    withProxy?: boolean;
    targetUrl?: string;
    orderId?: string;
    mode?: 'attach' | 'fresh';
  }): Promise<BrowserSessionResult> {
    this.sessionSeq++;
    const id = `sandbox-session-${String(this.sessionSeq).padStart(4, '0')}`;
    const session: BrowserSessionResult = {
      id,
      status: 'running',
      service_name: params.serviceName,
      country_code: params.country,
      device_mode: params.deviceMode ?? 'desktop',
      with_proxy: params.withProxy ?? Boolean(params.country),
      // Placeholder — NOT a real cloud-browser session. Static sandbox page.
      viewer_url: SANDBOX_VIEWER_URL,
      target_url: params.targetUrl,
      order_id: params.orderId,
      timeline: [{ at: new Date().toISOString(), event: 'session_started', detail: 'sandbox mock' }],
    };
    this.sessions.set(id, session);
    return session;
  }

  async prepBrowserSession(
    sessionId: string,
    preset: 'generic' | 'telegram',
    targetUrl?: string,
  ): Promise<BrowserSessionResult> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Not found: sandbox session ${sessionId} does not exist`);
    session.target_url = targetUrl ?? session.target_url;
    session.timeline = [
      ...(session.timeline ?? []),
      { at: new Date().toISOString(), event: 'prep_run', detail: preset },
    ];
    return session;
  }

  async stopBrowserSession(sessionId: string): Promise<BrowserSessionResult> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Not found: sandbox session ${sessionId} does not exist`);
    session.status = 'stopped';
    return session;
  }

  async navigateBrowserSession(sessionId: string, url: string): Promise<NavigateSessionResult> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Not found: sandbox session ${sessionId} does not exist`);
    session.target_url = url;
    return { ok: true, status: 'navigating', url };
  }

  async getBrowserSession(sessionId: string): Promise<BrowserSessionResult> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Not found: sandbox session ${sessionId} does not exist`);
    return session;
  }

  // ─── Rentals ────────────────────────────────────────────────────────────

  async listRentalPricing(): Promise<RentalPricingTier[]> {
    return [
      { rental_type: 'full', duration_hours: 24, duration_label: '1 day', base_price: 3.5, country_code: 'US', service_id: 'any' },
      { rental_type: 'full', duration_hours: 168, duration_label: '7 days', base_price: 18, country_code: 'US', service_id: 'any' },
    ];
  }

  async getRentalAvailability(params: {
    country?: string;
    service?: string;
    type?: 'service' | 'full';
    tier?: 'full_access' | 'platform';
  } = {}): Promise<RentalAvailabilityResult> {
    return {
      countries: [
        {
          country_code: 'US',
          country_name: 'United States',
          available_count: 42,
          pricing: { '24': [{ duration_hours: 24, duration_label: '1 day', price: 3.5 }] },
          service_count: params.tier === 'platform' ? 25 : undefined,
          popular_services: params.tier === 'platform' ? ['telegram', 'whatsapp'] : undefined,
          min_price_per_day: params.tier === 'platform' ? 2.5 : undefined,
        },
      ],
      total_available: 42,
      provider: params.tier === 'platform' ? 'network' : undefined,
    };
  }

  async listRentalServices(params: {
    countryCode: string;
    durationHours?: number;
  }): Promise<RentalCatalogService[]> {
    return [
      { service_id: 'telegram', service_name: 'Telegram', physical_count: 10, our_price: 3.5, popular: true },
      { service_id: 'whatsapp', service_name: 'WhatsApp', physical_count: 6, our_price: 4.0, popular: true },
    ];
  }

  async getRentalPrice(params: {
    service: string;
    countryCode: string;
    durationHours: number;
  }): Promise<RentalPriceResult> {
    return { price: 3.5, duration_hours: params.durationHours };
  }

  async createFullAccessRental(params: {
    country: string;
    rentalType: 'service' | 'full';
    durationHours: number;
    service?: string;
    autoRenew?: boolean;
  }): Promise<CreateRentalResult> {
    return this.createMockRental('full_access', params.country, params.durationHours, params.service, params.autoRenew);
  }

  async createPlatformRental(params: {
    service: string;
    countryCode: string;
    durationHours: number;
  }): Promise<CreateRentalResult> {
    return this.createMockRental('platform', params.countryCode, params.durationHours, params.service, false);
  }

  private createMockRental(
    tier: 'full_access' | 'platform',
    country: string,
    durationHours: number,
    service?: string,
    autoRenew?: boolean,
  ): CreateRentalResult {
    this.rentalSeq++;
    const rentalId = `sandbox-rental-${String(this.rentalSeq).padStart(4, '0')}`;
    const phoneNumber = `+1555${String(2000000 + this.rentalSeq).slice(-7)}`;
    const price = tier === 'platform' ? 3.5 : 3.5 * (durationHours / 24);
    this.balanceUsd = Math.round((this.balanceUsd - price) * 100) / 100;
    const now = Date.now();
    const rental: MockRentalState = {
      id: rentalId,
      phone_number: phoneNumber,
      rental_type: tier,
      service_id: service,
      duration_hours: durationHours,
      started_at: new Date(now).toISOString(),
      expires_at: new Date(now + durationHours * 60 * 60 * 1000).toISOString(),
      price,
      auto_renew: autoRenew ?? false,
      status: 'active',
      sms_received: 0,
      sms_forwarded: 0,
      provider: tier === 'platform' ? 'network' : 'local',
      _createdAtMs: now,
    };
    this.rentals.set(rentalId, rental);
    return {
      success: true,
      rental_id: rentalId,
      phone_number: phoneNumber,
      rental_type: tier,
      service,
      duration: `${durationHours}h`,
      price,
      started_at: rental.started_at,
      expires_at: rental.expires_at,
      auto_renew: rental.auto_renew,
      status: 'active',
      retail_cost: price,
      currency: 'USD',
    };
  }

  async listRentals(status?: string): Promise<Rental[]> {
    const all = Array.from(this.rentals.values());
    if (!status || status === 'all') return all;
    return all.filter((r) => r.status === status);
  }

  async getRental(rentalId: string): Promise<Rental | undefined> {
    return this.rentals.get(rentalId);
  }

  async extendRental(rentalId: string, durationHours: number): Promise<RentalActionResult> {
    const rental = this.rentals.get(rentalId);
    if (!rental) throw new Error(`Not found: sandbox rental ${rentalId} does not exist`);
    const price = 3.5 * (durationHours / 24);
    this.balanceUsd = Math.round((this.balanceUsd - price) * 100) / 100;
    const newExpiry = new Date(Date.parse(rental.expires_at) + durationHours * 60 * 60 * 1000).toISOString();
    rental.expires_at = newExpiry;
    return { success: true, rental_id: rentalId, status: rental.status, new_expires_at: newExpiry, price };
  }

  async cancelRental(rentalId: string): Promise<RentalActionResult> {
    const rental = this.rentals.get(rentalId);
    if (!rental) throw new Error(`Not found: sandbox rental ${rentalId} does not exist`);
    rental.status = 'cancelled';
    this.balanceUsd = Math.round((this.balanceUsd + rental.price) * 100) / 100;
    return { success: true, rental_id: rentalId, status: 'cancelled', refund: rental.price };
  }

  async releaseRental(rentalId: string): Promise<RentalActionResult> {
    const rental = this.rentals.get(rentalId);
    if (!rental) throw new Error(`Not found: sandbox rental ${rentalId} does not exist`);
    rental.status = 'completed';
    const proratedRefund = Math.round(rental.price * 0.4 * 100) / 100;
    this.balanceUsd = Math.round((this.balanceUsd + proratedRefund) * 100) / 100;
    return { success: true, rental_id: rentalId, status: 'completed', refund: proratedRefund, hours_used: '2h' };
  }

  // ─── Orders — retry ─────────────────────────────────────────────────────

  async retryOrder(orderId: string): Promise<RetryOrderResult> {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`Not found: sandbox order ${orderId} does not exist`);
    order._smsAtMs = Date.now() + 2000;
    order.status = 'waiting';
    return { success: true, order_id: orderId, message: 'Sandbox retry accepted, a fresh fake SMS will arrive shortly.' };
  }
}

// Small helper re-exported for the sandbox startup-log note in index.ts/http-server.ts.
export function isSandboxEnabled(env: NodeJS.ProcessEnv, smitheryEnvironment?: string): boolean {
  const flagTruthy = /^(1|true|yes)$/i.test(env.VIRTUALSMS_SANDBOX ?? '');
  return flagTruthy || smitheryEnvironment === 'sandbox';
}

// no-op export to keep sleep available if future handlers need artificial delay
export { sleep as _sandboxSleep };
