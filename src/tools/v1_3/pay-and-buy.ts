/**
 * virtualsms_pay_and_buy — x402 deposit-first one-shot.
 *
 * STATUS: v1.3.0 STUB — signatures only, no implementation logic.
 * See docs/v1.3.0-design.md §4.4 and docs/v1.3.0-plan.md Task 7.
 *
 * Two-step flow:
 *   Call 1 (no payment_proof) → returns 402-equivalent manifest
 *   Call 2 (with payment_proof) → tops up + optionally buys
 */

import { z } from 'zod';
import type { VirtualSMSClient, X402TopupResult } from '../../client.js';
import { VirtualSMSClient as VirtualSMSClientCtor } from '../../client.js';

export const PayAndBuyInput = z.object({
  amount_usd: z
    .number()
    .min(2)
    .max(50)
    .describe('USD amount to deposit (server-enforced 2-50)'),
  service: z.string().optional().describe('Optional — if set, immediately buy after topup'),
  country: z.string().optional().describe('Optional — required if service is set'),
  payment_method: z
    .enum(['usdc-base', 'usdc-solana', 'usdt-solana'])
    .default('usdc-base')
    .describe('Which network/asset to pay with'),
  payment_proof: z
    .string()
    .optional()
    .describe('x402 X-PAYMENT header value. Omit on first call to receive manifest, then re-call with this set.'),
});

export const PAY_AND_BUY_TOOL_DEF = {
  name: 'virtualsms_pay_and_buy',
  title: 'Pay (x402) and Optionally Buy',
  description:
    'Deposit funds via x402 and optionally buy a number in one call. ' +
    'Two-step: first call (no payment_proof) returns the x402 manifest with recipient address(es). ' +
    'Sign the payment with your wallet, then re-call with payment_proof set. ' +
    'On success returns api_key bound to the topped-up balance. ' +
    'If service+country provided, also creates the order in the same call.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      amount_usd: { type: 'number', minimum: 2, maximum: 50 },
      service: { type: 'string' },
      country: { type: 'string' },
      payment_method: {
        type: 'string',
        enum: ['usdc-base', 'usdc-solana', 'usdt-solana'],
        default: 'usdc-base',
      },
      payment_proof: { type: 'string' },
    },
    required: ['amount_usd'],
  },
  annotations: {
    title: 'Pay (x402) and Optionally Buy',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
};

function isPaid(r: unknown): r is X402TopupResult {
  return typeof r === 'object' && r !== null && typeof (r as { api_key?: unknown }).api_key === 'string';
}

export async function handlePayAndBuy(
  client: VirtualSMSClient,
  args: z.infer<typeof PayAndBuyInput>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // Validate service+country pairing before charging anything.
  if (args.service && !args.country) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              error: 'input_error',
              message: 'service requires country (and vice versa). Pass both, or omit both for topup-only.',
            },
            null,
            2
          ),
        },
      ],
    };
  }
  if (args.country && !args.service) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              error: 'input_error',
              message: 'country requires service. Pass both, or omit both for topup-only.',
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const result = await client.topup({
    amount_usd: args.amount_usd,
    payment_method: args.payment_method,
    payment_proof: args.payment_proof,
  });

  // First call (no payment_proof) — backend returned the 402 manifest.
  if (!isPaid(result)) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              status: 'payment_required',
              manifest: result,
              tip: 'Sign this manifest with x402-fetch or your wallet, then re-call this tool with payment_proof set to the X-PAYMENT header value.',
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // Paid path — `result` is X402TopupResult.
  const baseResponse: Record<string, unknown> = {
    status: 'paid',
    credited_balance_usd: result.balance_usd,
    api_key: result.api_key,
    user_id: result.user_id,
    next_action: 'Set VIRTUALSMS_API_KEY=' + result.api_key + ' to use the other 23 MCP tools.',
  };

  // If no auto-buy requested, we're done.
  if (!args.service || !args.country) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(baseResponse, null, 2),
        },
      ],
    };
  }

  // Auto-buy: build a fresh client with the new api_key (don't mutate the
  // caller's client — they may have a different key for other tools). For
  // unit tests where the same mock client exposes createOrder, this falls
  // through to the existing client.createOrder when baseUrl is missing.
  let bundledClient: VirtualSMSClient = client;
  try {
    const baseUrl = client.getBaseUrl();
    if (baseUrl) {
      bundledClient = new VirtualSMSClientCtor(baseUrl, result.api_key);
    }
  } catch {
    // Fall through with the original client — covers test fakes.
  }

  try {
    const order = await bundledClient.createOrder(args.service, args.country);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              ...baseResponse,
              status: 'paid_and_bought',
              order: {
                order_id: order.order_id,
                phone_number: order.phone_number,
                service: order.service ?? args.service,
                country: order.country ?? args.country,
                status: order.status,
                expires_at: order.expires_at,
              },
              tip: 'Use wait_for_sms with this order_id to collect the SMS code.',
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (err) {
    // Topup succeeded but the bundled buy failed. Don't lose the api_key.
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              ...baseResponse,
              status: 'paid_buy_failed',
              buy_error: (err as Error).message,
              tip: 'Topup succeeded — your api_key is bound to a $' + result.balance_usd.toFixed(2) + ' balance. Retry the purchase via create_order with the api_key above.',
            },
            null,
            2
          ),
        },
      ],
    };
  }
}
