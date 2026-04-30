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
  _client: VirtualSMSClient,
  _args: z.infer<typeof BuyBatchInput>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // STUB — design only. Implementation in v1.3.0 Task 3.
  throw new Error('virtualsms_buy_batch is a v1.3.0 stub — not implemented');
}
