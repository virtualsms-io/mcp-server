/**
 * virtualsms_wait_for_sms_batch — wait for SMS on N orders in parallel.
 *
 * STATUS: v1.3.0 STUB — signatures only, no implementation logic.
 * See docs/v1.3.0-design.md §4.2 and docs/v1.3.0-plan.md Task 4.
 */

import { z } from 'zod';
import type { VirtualSMSClient } from '../../client.js';

export const WaitForSmsBatchInput = z.object({
  order_ids: z
    .array(z.string())
    .min(1)
    .max(20)
    .describe('Array of 1-20 order IDs returned from buy_batch or create_order'),
  timeout_seconds: z
    .number()
    .int()
    .min(5)
    .max(600)
    .default(120)
    .describe('Per-order timeout in seconds (default 120)'),
  return_partial: z
    .boolean()
    .default(true)
    .describe('Return what arrived even if some timed out (default true)'),
});

export const WAIT_FOR_SMS_BATCH_TOOL_DEF = {
  name: 'virtualsms_wait_for_sms_batch',
  title: 'Wait for SMS on Batch',
  description:
    'Wait for SMS verification codes to arrive on N orders in parallel. ' +
    'Uses WebSocket for each order with polling fallback. ' +
    'Returns received[], timed_out[], and errors[] arrays. ' +
    'Pair with buy_batch for the canonical batch agentic pattern.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      order_ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 20 },
      timeout_seconds: { type: 'number', minimum: 5, maximum: 600, default: 120 },
      return_partial: { type: 'boolean', default: true },
    },
    required: ['order_ids'],
  },
  annotations: {
    title: 'Wait for SMS on Batch',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

export async function handleWaitForSmsBatch(
  _client: VirtualSMSClient,
  _args: z.infer<typeof WaitForSmsBatchInput>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // STUB — design only. Implementation in v1.3.0 Task 4.
  throw new Error('virtualsms_wait_for_sms_batch is a v1.3.0 stub — not implemented');
}
