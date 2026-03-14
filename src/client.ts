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

export interface Order {
  order_id: string;
  phone_number: string;
  service?: string;
  country?: string;
  price?: number;
  expires_at?: string;
  status: string;
  sms_code?: string;
  sms_text?: string;
}

export interface CancelResult {
  success: boolean;
  refunded: boolean;
}

export class VirtualSMSClient {
  private http: AxiosInstance;
  private apiKey?: string;
  private baseUrl: string;

  constructor(baseUrl: string, apiKey?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
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
}
