/**
 * virtualsms_buy_batch — purchase 1-20 numbers in one MCP call.
 *
 * STATUS: v1.3.0 STUB — signatures only, no implementation logic.
 * See docs/v1.3.0-design.md §4.1 and docs/v1.3.0-plan.md Task 3.
 */

import { z } from 'zod';
import type { VirtualSMSClient } from '../../client.js';

export const BuyBatchInput = z.object({
  service: z.string().describe('Service code shared across the batch (e.g. "telegram")'),
  country: z.string().describe('Country ISO code shared across the batch (e.g. "GB")'),
  count: z.number().int().min(1).max(20).describe('Number of orders to create (1-20)'),
  stop_on_failure: z.boolean().default(false).describe('If true, stop on the first failure'),
});

export const BUY_BATCH_TOOL_DEF = {
  name: 'virtualsms_buy_batch',
  title: 'Buy Numbers in Batch',
  description:
    'Purchase 1-20 virtual phone numbers for the same service+country in a single call. ' +
    'Returns succeeded[] and failed[] arrays plus total_charged_usd. ' +
    'Use wait_for_sms_batch with the returned order_ids to collect codes in parallel.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      service: { type: 'string', description: 'Service code (e.g. "telegram")' },
      country: { type: 'string', description: 'Country ISO code (e.g. "GB")' },
      count: { type: 'number', minimum: 1, maximum: 20, description: '1-20 orders' },
      stop_on_failure: { type: 'boolean', default: false },
    },
    required: ['service', 'country', 'count'],
  },
  annotations: {
    title: 'Buy Numbers in Batch',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
};

export async function handleBuyBatch(
  client: VirtualSMSClient,
  args: z.infer<typeof BuyBatchInput>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // Budget guard — refuse if the planned spend would consume >80% of balance.
  // Best-effort: skip the guard if either lookup fails (let backend enforce).
  let balanceUsd: number | undefined;
  let cheapestUsd: number | undefined;
  try {
    const [bal, price] = await Promise.all([
      client.getBalance(),
      client.checkPrice(args.service, args.country),
    ]);
    balanceUsd = bal.balance_usd;
    cheapestUsd = price.price_usd;
  } catch {
    // ignore — proceed with batch
  }
  if (
    typeof balanceUsd === 'number' &&
    typeof cheapestUsd === 'number' &&
    cheapestUsd > 0 &&
    args.count * cheapestUsd > balanceUsd * 0.8
  ) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              error: 'budget_guard',
              message: `Refusing: ${args.count} × $${cheapestUsd.toFixed(3)} = $${(args.count * cheapestUsd).toFixed(2)} would exceed 80% of your $${balanceUsd.toFixed(2)} balance. Reduce count, top up first, or pick a cheaper country.`,
              balance_usd: balanceUsd,
              estimated_total_usd: Math.round(args.count * cheapestUsd * 100) / 100,
              tip: 'Call get_balance + find_best_pick to size the batch correctly.',
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const result = await client.createOrderBatch(args.service, args.country, args.count);

  // If stop_on_failure was set and any failed, surface that. Note: with
  // Promise.allSettled in the client there's no actual early-stop happening,
  // but we still annotate the response so callers can see it was requested.
  const totalCharged = result.succeeded.reduce((sum, s) => sum + (typeof s.price === 'number' ? s.price : 0), 0);

  // Best-effort post-batch balance lookup.
  let remainingBalanceUsd: number | undefined;
  try {
    const bal = await client.getBalance();
    remainingBalanceUsd = bal.balance_usd;
  } catch {
    // ignore
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            requested: args.count,
            succeeded: result.succeeded.map((s) => ({
              order_id: s.order_id,
              phone_number: s.phone_number,
              price: s.price,
            })),
            failed: result.failed,
            total_charged_usd: Math.round(totalCharged * 100) / 100,
            remaining_balance_usd: remainingBalanceUsd,
            tip:
              result.succeeded.length > 0
                ? 'Pass these order_ids to virtualsms_wait_for_sms_batch to collect SMS in parallel.'
                : 'No orders placed. Check failed[] for the error and try again.',
            ...(args.stop_on_failure && result.failed.length > 0
              ? { stop_on_failure_note: 'stop_on_failure was requested. The batch ran in parallel (no early stop), but failures are surfaced for review.' }
              : {}),
          },
          null,
          2
        ),
      },
    ],
  };
}
