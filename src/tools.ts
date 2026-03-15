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
  service: z.string().describe('Service code (e.g. "telegram", "whatsapp", "google")'),
  country: z.string().describe('Country ISO code (e.g. "US", "GB", "RU")'),
  timeout_seconds: z.number()
    .int()
    .min(10)
    .max(600)
    .default(120)
    .describe('How long to wait for SMS code in seconds (default: 120, max: 600)'),
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

// ─── Tool Definitions ────────────────────────────────────────────────────────

export const TOOL_DEFINITIONS = [
  {
    name: 'list_services',
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
    name: 'list_countries',
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
    name: 'check_price',
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
    name: 'get_balance',
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
    name: 'buy_number',
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
    name: 'check_sms',
    description:
      'Check if an SMS verification code has been received for an order. ' +
      'Poll this every 5-10 seconds after buying a number. ' +
      'For automatic polling, use wait_for_code instead.',
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
    name: 'cancel_order',
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
    name: 'wait_for_code',
    description:
      'RECOMMENDED: One-step tool that buys a number AND waits for the SMS code automatically. ' +
      'Uses real-time WebSocket delivery with automatic polling fallback. ' +
      'Always returns order_id in the response — even on timeout — so you can use check_sms to recover.',
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
        timeout_seconds: {
          type: 'number',
          description: 'How long to wait for SMS code in seconds (default: 120, max: 600)',
          default: 120,
        },
      },
      required: ['service', 'country'],
    },
    annotations: {
      title: 'Buy Number and Wait for SMS Code',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'find_cheapest',
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
    name: 'search_service',
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
    name: 'swap_number',
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
    name: 'list_active_orders',
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

export async function handleCheckSms(
  client: VirtualSMSClient,
  args: z.infer<typeof CheckSmsInput>
) {
  const order = await client.getOrder(args.order_id);
  const result: Record<string, unknown> = {
    status: order.status,
    phone_number: order.phone_number,
  };
  if (order.sms_code) result.sms_code = order.sms_code;
  if (order.sms_text) result.sms_text = order.sms_text;

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
  const timeoutMs = (args.timeout_seconds ?? 120) * 1000;
  const pollIntervalMs = 5000;
  const startTime = Date.now();

  // Step 1: Buy the number
  let order;
  try {
    order = await client.createOrder(args.service, args.country);
  } catch (err) {
    throw new Error(`Failed to buy number: ${(err as Error).message}`);
  }

  const orderId = order.order_id;
  const phoneNumber = order.phone_number;
  const apiKey = client.getApiKey();
  const baseUrl = client.getBaseUrl();

  // Step 2: Try WebSocket first (if we have an API key)
  if (apiKey) {
    const remainingMs = timeoutMs - (Date.now() - startTime);
    const wsResult = await waitForSMSViaWebSocket(baseUrl, apiKey, orderId, remainingMs);

    if (wsResult) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                phone_number: phoneNumber,
                sms_code: wsResult.sms_code,
                sms_text: wsResult.sms_text,
                order_id: orderId,
                delivery_method: wsResult.delivery_method,
                elapsed_seconds: Math.round((Date.now() - startTime) / 1000),
              },
              null,
              2
            ),
          },
        ],
      };
    }
    // WS timed out or failed — fall through to polling
  }

  // Step 3: Polling fallback
  let attempts = 0;
  while (Date.now() - startTime < timeoutMs) {
    attempts++;

    try {
      const status = await client.getOrder(orderId);

      if (status.sms_code) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  phone_number: phoneNumber,
                  sms_code: status.sms_code,
                  sms_text: status.sms_text,
                  order_id: orderId,
                  delivery_method: 'polling',
                  elapsed_seconds: Math.round((Date.now() - startTime) / 1000),
                  poll_attempts: attempts,
                },
                null,
                2
              ),
            },
          ],
        };
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

  // Timeout — return order_id for crash recovery (don't cancel automatically)
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
            tip: 'Use check_sms with this order_id to check if code arrived later, or cancel_order to get a refund.',
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
