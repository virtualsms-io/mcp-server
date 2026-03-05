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
        config.headers['Authorization'] = `Bearer ${this.apiKey}`;
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
    const res = await this.http.get('/api/v1/services');
    return res.data;
  }

  async listCountries(): Promise<Country[]> {
    const res = await this.http.get('/api/v1/countries');
    return res.data;
  }

  async checkPrice(service: string, country: string): Promise<Price> {
    const res = await this.http.get('/api/v1/price', {
      params: { service, country },
    });
    return res.data;
  }

  async getBalance(): Promise<Balance> {
    this.requireApiKey();
    const res = await this.http.get('/api/v1/balance');
    return res.data;
  }

  async createOrder(service: string, country: string): Promise<Order> {
    this.requireApiKey();
    const res = await this.http.post('/api/v1/order', { service, country });
    return res.data;
  }

  async getOrder(orderId: string): Promise<Order> {
    this.requireApiKey();
    const res = await this.http.get(`/api/v1/order/${orderId}`);
    return res.data;
  }

  async cancelOrder(orderId: string): Promise<CancelResult> {
    this.requireApiKey();
    const res = await this.http.put(`/api/v1/order/${orderId}`, {
      action: 'cancel',
    });
    return res.data;
  }

  async completeOrder(orderId: string): Promise<Order> {
    this.requireApiKey();
    const res = await this.http.put(`/api/v1/order/${orderId}`, {
      action: 'complete',
    });
    return res.data;
  }

  async listOrders(status?: string): Promise<Order[]> {
    this.requireApiKey();
    const params = status ? { status } : {};
    const res = await this.http.get('/api/v1/orders', { params });
    return res.data;
  }

  getApiKey(): string | undefined {
    return this.apiKey;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}
