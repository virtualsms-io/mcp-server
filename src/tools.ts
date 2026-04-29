import { z } from 'zod';
import WebSocket from 'ws';
import { VirtualSMSClient } from './client.js';

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

// ─── Tool Definitions ────────────────────────────────────────────────────────

export const TOOL_DEFINITIONS = [
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
      'Use check_sms to poll for the verification code, or use wait_for_code to do it automatically.',
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
      'Use this if the service is taking too long or you want to try a different number.',
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
      'Use when the current number isn\'t receiving SMS.',
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
];

// ─── Tool Handlers ────────────────────────────────────────────────────────────

export async function handleListServices(client: VirtualSMSClient) {
  const services = await client.listServices();
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(services, null, 2),
      },
    ],
  };
}

export async function handleListCountries(client: VirtualSMSClient) {
  const countries = await client.listCountries();
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(countries, null, 2),
      },
    ],
  };
}

export async function handleCheckPrice(
  client: VirtualSMSClient,
  args: z.infer<typeof CheckPriceInput>
) {
  let price;
  try {
    price = await client.checkPrice(args.service, args.country);
  } catch (err) {
    const msg = (err as Error).message ?? '';
    // 404 or explicit unavailability → return clear user-facing message
    if (msg.includes('Not found') || msg.includes('404')) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { available: false, message: 'Service/country combination not available' },
              null,
              2
            ),
          },
        ],
      };
    }
    throw err;
  }

  // Guard: if backend says not available, don't pass through a misleading result
  if (!price.available) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            { available: false, message: 'Service/country combination not available' },
            null,
            2
          ),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(price, null, 2),
      },
    ],
  };
}

export async function handleGetBalance(client: VirtualSMSClient) {
  const balance = await client.getBalance();
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(balance, null, 2),
      },
    ],
  };
}

export async function handleBuyNumber(
  client: VirtualSMSClient,
  args: z.infer<typeof BuyNumberInput>
) {
  const order = await client.createOrder(args.service, args.country);
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            order_id: order.order_id,
            phone_number: order.phone_number,
            expires_at: order.expires_at,
            status: order.status,
            tip: 'Use check_sms to poll for the code, or cancel_order to refund.',
          },
          null,
          2
        ),
      },
    ],
  };
}

// Pull the most likely numeric verification code out of an SMS body.
// Heuristic: first 4-8 digit run wins (covers "SMS code: 666512", "Your code is 1234", etc.).
function extractCode(text: string): string | undefined {
  if (!text) return undefined;
  const m = text.match(/\b(\d{4,8})\b/);
  return m ? m[1] : undefined;
}

export async function handleCheckSms(
  client: VirtualSMSClient,
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

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

export async function handleCancelOrder(
  client: VirtualSMSClient,
  args: z.infer<typeof CancelOrderInput>
) {
  const result = await client.cancelOrder(args.order_id);
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

export async function handleSwapNumber(
  client: VirtualSMSClient,
  args: z.infer<typeof SwapNumberInput>
) {
  const result = await client.swapNumber(args.order_id);
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
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
  client: VirtualSMSClient,
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
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
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
            },
            null,
            2
          ),
        },
      ],
    };
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
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            success: false,
            error: 'timeout',
            message: `No SMS received within ${args.timeout_seconds} seconds.`,
            order_id: orderId,
            phone_number: phoneNumber,
            tip: 'Call get_sms with this order_id later to check, or cancel_order to refund.',
          },
          null,
          2
        ),
      },
    ],
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function handleFindCheapest(
  client: VirtualSMSClient,
  args: z.infer<typeof FindCheapestInput>
) {
  const limit = args.limit ?? 5;

  const countries = await client.listCountries();

  const results: Array<{ country: string; country_name: string; price_usd: number; stock: boolean }> = [];
  const batchSize = 10;

  for (let i = 0; i < countries.length; i += batchSize) {
    const batch = countries.slice(i, i + batchSize);
    const priceChecks = await Promise.allSettled(
      batch.map(async (c) => {
        const price = await client.checkPrice(args.service, c.iso);
        return {
          country: c.iso,
          country_name: c.name,
          price_usd: price.price_usd,
          stock: price.available,
        };
      })
    );

    for (const result of priceChecks) {
      // Skip any country where the price check failed (404, unavailable, network error, etc.)
      if (result.status === 'fulfilled' && result.value.stock) {
        results.push(result.value);
      }
      // 'rejected' entries are silently skipped — invalid service/country combos
    }
  }

  results.sort((a, b) => a.price_usd - b.price_usd);
  const top = results.slice(0, limit);

  if (top.length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              service: args.service,
              cheapest_options: [],
              total_available_countries: 0,
              message: `No countries available for service "${args.service}". Use search_service to verify the service code, or list_services to see all available services.`,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            service: args.service,
            cheapest_options: top,
            total_available_countries: results.length,
          },
          null,
          2
        ),
      },
    ],
  };
}

export async function handleSearchService(
  client: VirtualSMSClient,
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

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
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
              },
          null,
          2
        ),
      },
    ],
  };
}

export async function handleActiveOrders(
  client: VirtualSMSClient,
  args: z.infer<typeof ActiveOrdersInput>
) {
  const orders = await client.listOrders(args.status);
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
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
          },
          null,
          2
        ),
      },
    ],
  };
}

export async function handleGetOrder(
  client: VirtualSMSClient,
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
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(out, null, 2),
      },
    ],
  };
}

// Statuses considered "active" (order is live and billable/cancellable).
const ACTIVE_STATUSES = new Set(['waiting', 'pending', 'sms_received', 'created']);

export async function handleCancelAllOrders(client: VirtualSMSClient) {
  const orders = await client.listOrders();
  const active = orders.filter((o) => ACTIVE_STATUSES.has(o.status));

  if (active.length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            { cancelled: 0, failed: 0, message: 'No active orders to cancel.' },
            null,
            2
          ),
        },
      ],
    };
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

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            cancelled: succeeded.length,
            failed: failed.length,
            total_active: active.length,
            cancelled_orders: succeeded,
            failures: failed,
          },
          null,
          2
        ),
      },
    ],
  };
}

function parseOrderDate(value?: string): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

export async function handleOrderHistory(
  client: VirtualSMSClient,
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

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
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
          },
          null,
          2
        ),
      },
    ],
  };
}

export async function handleGetStats(
  client: VirtualSMSClient,
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

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
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
          },
          null,
          2
        ),
      },
    ],
  };
}

export async function handleGetProfile(client: VirtualSMSClient) {
  const profile = await client.getProfile();
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(profile, null, 2),
      },
    ],
  };
}

export async function handleGetTransactions(
  client: VirtualSMSClient,
  args: z.infer<typeof GetTransactionsInput>
) {
  const page = await client.getTransactions({
    type: args.type,
    from: args.from,
    to: args.to,
    limit: args.limit,
    offset: args.offset,
  });
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
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
          },
          null,
          2
        ),
      },
    ],
  };
}
