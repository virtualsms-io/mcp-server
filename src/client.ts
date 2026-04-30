import axios, { AxiosInstance, AxiosError } from 'axios';

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

// ─── v1.3.0 types ────────────────────────────────────────────────────────────

export interface X402Info {
  enabled: boolean;
  x402_version?: number;
  // Pairs of {network, token} the server accepts.
  networks: Array<{ network: string; token: string }>;
  // Recipient addresses (one per chain family). Public info — fine to surface.
  evm_relayer?: string;
  solana_relayer?: string;
  min_topup_usd?: number;
  max_topup_usd?: number;
  default_topup_usd?: number;
  default_price_usdc?: number;
  topup_endpoint?: string;
  // Pattern A (per-call) endpoint. Currently 410-deprecated server-side, but
  // surfaced here for any self-hosted deployment that still has it enabled.
  resource?: string;
}

// Raw 402-manifest payload — passed through to MCP callers untouched so the
// `x402-fetch`/wallet client can parse it. Shape comes from the x402 spec.
export type X402Manifest = Record<string, unknown>;

// Successful topup response — backend returns api_key + balance + endpoint map.
export interface X402TopupResult {
  api_key: string;
  balance_usd: number;
  user_id?: string;
  endpoints?: Record<string, string>;
  // The raw payload (kept for extension fields).
  raw: Record<string, unknown>;
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  threshold_usd?: number;
  description?: string;
  secret?: string;
  active?: boolean;
  created_at?: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id?: string;
  event?: string;
  status?: string;
  response_code?: number;
  attempted_at?: string;
  delivered_at?: string;
  payload?: unknown;
}

export interface BatchPurchaseResult {
  succeeded: Array<{ index: number; order_id: string; phone_number: string; price?: number }>;
  failed: Array<{ index: number; error: string }>;
}

export class VirtualSMSClient {
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
      return config;
    });

    // Handle errors gracefully
    this.http.interceptors.response.use(
      (res) => res,
      (err: AxiosError) => {
        const status = err.response?.status;
        const data = err.response?.data as Record<string, unknown> | undefined;
        const message = data?.message || data?.error || err.message;

        if (status === 401) {
          throw new Error('Invalid API key. Get one at https://virtualsms.io');
        } else if (status === 402) {
          throw new Error('Insufficient balance. Top up at https://virtualsms.io');
        } else if (status === 404) {
          throw new Error(`Not found: ${message}`);
        } else if (status === 429) {
          throw new Error('Rate limit exceeded. Please slow down requests.');
        } else if (status && status >= 500) {
          throw new Error(`VirtualSMS server error (${status}). Please try again.`);
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
    const raw = res.data as Record<string, unknown>;
    return {
      price_usd: Number(raw.price ?? raw.price_usd ?? 0),
      currency: String(raw.currency ?? 'USD'),
      available: raw.available !== undefined ? Boolean(raw.available) : true,
    };
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

  getApiKey(): string | undefined {
    return this.apiKey;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  // ─── v1.3.0 methods ──────────────────────────────────────────────────────

  /**
   * Discover x402 capabilities. No api key required — this is the public
   * money-path manifest. Surfaces enabled flag, accepted (network, token)
   * pairs, recipient addresses, and topup amount bounds.
   */
  async getX402Info(): Promise<X402Info> {
    const res = await this.http.get('/api/v1/x402/info');
    const raw = res.data as Record<string, unknown>;
    const networksRaw = Array.isArray(raw.networks) ? (raw.networks as Array<Record<string, unknown>>) : [];
    return {
      enabled: Boolean(raw.enabled),
      x402_version: typeof raw.x402_version === 'number' ? raw.x402_version : undefined,
      networks: networksRaw.map((n) => ({
        network: String(n.network ?? ''),
        token: String(n.token ?? ''),
      })),
      evm_relayer: raw.evm_relayer ? String(raw.evm_relayer) : undefined,
      solana_relayer: raw.solana_relayer ? String(raw.solana_relayer) : undefined,
      min_topup_usd: typeof raw.min_topup_usd === 'number' ? raw.min_topup_usd : undefined,
      max_topup_usd: typeof raw.max_topup_usd === 'number' ? raw.max_topup_usd : undefined,
      default_topup_usd: typeof raw.default_topup_usd === 'number' ? raw.default_topup_usd : undefined,
      default_price_usdc: typeof raw.default_price_usdc === 'number' ? raw.default_price_usdc : undefined,
      topup_endpoint: raw.topup_endpoint ? String(raw.topup_endpoint) : undefined,
      resource: raw.resource ? String(raw.resource) : undefined,
    };
  }

  /**
   * Top up balance via x402.
   *
   * Two-step protocol mirrors the server:
   * - First call (no payment_proof) → backend returns the 402 manifest
   *   (`accepts[]` array per the x402 spec). Caller signs the payment with
   *   their wallet/x402-fetch, then calls again with `payment_proof` set.
   * - Second call (with payment_proof) → backend validates the on-chain
   *   payment and returns `{ api_key, balance_usd, ... }`.
   *
   * The MCP layer tells the two responses apart by the presence of `api_key`
   * vs `accepts`. We pass-through raw `data` so the caller can inspect either.
   */
  async topup(opts: {
    amount_usd: number;
    payment_method: 'usdc-base' | 'usdc-solana' | 'usdt-solana';
    payment_proof?: string;
  }): Promise<X402Manifest | X402TopupResult> {
    const headers: Record<string, string> = {};
    if (opts.payment_proof) {
      headers['X-PAYMENT'] = opts.payment_proof;
    }
    try {
      const res = await this.http.post(
        '/api/v1/x402/topup',
        { amount_usd: opts.amount_usd, payment_method: opts.payment_method },
        { headers }
      );
      const raw = res.data as Record<string, unknown>;
      // Manifest shape (no api_key) → return raw.
      if (!raw.api_key) {
        return raw;
      }
      // Paid shape.
      return {
        api_key: String(raw.api_key),
        balance_usd: Number(raw.balance_usd ?? 0),
        user_id: raw.user_id ? String(raw.user_id) : undefined,
        endpoints: raw.endpoints as Record<string, string> | undefined,
        raw,
      };
    } catch (err) {
      // Backend returns 402 on the manifest path — axios treats that as an
      // error. Pull the manifest body off the response and return it.
      const e = err as { response?: { status?: number; data?: unknown }; message?: string };
      if (e.response?.status === 402 && e.response.data) {
        return e.response.data as X402Manifest;
      }
      throw err;
    }
  }

  async listWebhooks(): Promise<Webhook[]> {
    this.requireApiKey();
    const res = await this.http.get('/api/v1/customer/webhooks');
    const raw = res.data as Record<string, unknown> | unknown[];
    const items: Array<Record<string, unknown>> = Array.isArray(raw)
      ? (raw as Array<Record<string, unknown>>)
      : Array.isArray((raw as Record<string, unknown>).webhooks)
        ? ((raw as Record<string, unknown>).webhooks as Array<Record<string, unknown>>)
        : [];
    return items.map((w) => ({
      id: String(w.id ?? w.webhook_id ?? ''),
      url: String(w.url ?? ''),
      events: Array.isArray(w.events) ? (w.events as string[]) : [],
      threshold_usd: typeof w.threshold_usd === 'number' ? w.threshold_usd : undefined,
      description: w.description ? String(w.description) : undefined,
      active: w.active !== undefined ? Boolean(w.active) : undefined,
      created_at: w.created_at ? String(w.created_at) : undefined,
    }));
  }

  async createWebhook(opts: {
    url: string;
    events: string[];
    threshold_usd?: number;
    description?: string;
  }): Promise<Webhook> {
    this.requireApiKey();
    const payload: Record<string, unknown> = { url: opts.url, events: opts.events };
    if (opts.threshold_usd !== undefined) payload.threshold_usd = opts.threshold_usd;
    if (opts.description !== undefined) payload.description = opts.description;
    const res = await this.http.post('/api/v1/customer/webhooks', payload);
    const raw = res.data as Record<string, unknown>;
    return {
      id: String(raw.id ?? raw.webhook_id ?? ''),
      url: String(raw.url ?? opts.url),
      events: Array.isArray(raw.events) ? (raw.events as string[]) : opts.events,
      threshold_usd: typeof raw.threshold_usd === 'number' ? raw.threshold_usd : opts.threshold_usd,
      description: raw.description ? String(raw.description) : opts.description,
      secret: raw.secret ? String(raw.secret) : undefined,
      active: raw.active !== undefined ? Boolean(raw.active) : true,
      created_at: raw.created_at ? String(raw.created_at) : undefined,
    };
  }

  async deleteWebhook(id: string): Promise<{ deleted: boolean }> {
    this.requireApiKey();
    const res = await this.http.delete(`/api/v1/customer/webhooks/${encodeURIComponent(id)}`);
    const raw = res.data as Record<string, unknown> | undefined;
    return { deleted: raw?.deleted !== undefined ? Boolean(raw.deleted) : true };
  }

  async testWebhook(id: string): Promise<{ delivered: boolean; response_code?: number; error?: string }> {
    this.requireApiKey();
    const res = await this.http.post(`/api/v1/customer/webhooks/${encodeURIComponent(id)}/test`);
    const raw = (res.data ?? {}) as Record<string, unknown>;
    return {
      delivered: raw.delivered !== undefined ? Boolean(raw.delivered) : false,
      response_code: typeof raw.response_code === 'number' ? raw.response_code : undefined,
      error: raw.error ? String(raw.error) : undefined,
    };
  }

  async getDeliveries(id: string): Promise<WebhookDelivery[]> {
    this.requireApiKey();
    const res = await this.http.get(`/api/v1/customer/webhooks/${encodeURIComponent(id)}/deliveries`);
    const raw = res.data as Record<string, unknown> | unknown[];
    const items: Array<Record<string, unknown>> = Array.isArray(raw)
      ? (raw as Array<Record<string, unknown>>)
      : Array.isArray((raw as Record<string, unknown>).deliveries)
        ? ((raw as Record<string, unknown>).deliveries as Array<Record<string, unknown>>)
        : [];
    return items.map((d) => ({
      id: String(d.id ?? ''),
      webhook_id: d.webhook_id ? String(d.webhook_id) : undefined,
      event: d.event ? String(d.event) : undefined,
      status: d.status ? String(d.status) : undefined,
      response_code: typeof d.response_code === 'number' ? d.response_code : undefined,
      attempted_at: d.attempted_at ? String(d.attempted_at) : undefined,
      delivered_at: d.delivered_at ? String(d.delivered_at) : undefined,
      payload: d.payload,
    }));
  }

  /**
   * Fan out N parallel `createOrder` calls (1-20). Returns succeeded[] +
   * failed[] arrays without throwing on partial failure. Callers pass the
   * shared service+country once.
   */
  async createOrderBatch(
    service: string,
    country: string,
    count: number
  ): Promise<BatchPurchaseResult> {
    this.requireApiKey();
    if (!Number.isFinite(count) || count < 1 || count > 20) {
      throw new Error('count must be between 1 and 20');
    }
    const calls: Promise<Order>[] = [];
    for (let i = 0; i < count; i++) {
      calls.push(this.createOrder(service, country));
    }
    const settled = await Promise.allSettled(calls);
    const succeeded: BatchPurchaseResult['succeeded'] = [];
    const failed: BatchPurchaseResult['failed'] = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        succeeded.push({
          index: i,
          order_id: String(r.value.order_id ?? ''),
          phone_number: String(r.value.phone_number ?? ''),
          price: typeof r.value.price === 'number' ? r.value.price : undefined,
        });
      } else {
        const reason = r.reason as Error | undefined;
        failed.push({ index: i, error: reason?.message ?? String(r.reason) });
      }
    });
    return { succeeded, failed };
  }
}
