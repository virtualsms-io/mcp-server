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
import type { VirtualSMSClient } from '../../client.js';

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

export async function handlePayAndBuy(
  _client: VirtualSMSClient,
  _args: z.infer<typeof PayAndBuyInput>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // STUB — design only. Implementation in v1.3.0 Task 7.
  throw new Error('virtualsms_pay_and_buy is a v1.3.0 stub — not implemented');
}
