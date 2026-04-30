/**
 * virtualsms_subscribe_webhook — outbound event delivery subscription.
 *
 * STATUS: v1.3.0 STUB — signatures only, no implementation logic.
 * See docs/v1.3.0-design.md §4.6 and docs/v1.3.0-plan.md Task 8.
 *
 * Backend support: POST /api/v1/customer/webhooks (already shipped).
 */

import { z } from 'zod';
import type { VirtualSMSClient } from '../../client.js';

export const ALLOWED_WEBHOOK_EVENTS = [
  'sms.received',
  'order.cancelled',
  'order.expired',
  'order.swapped',
  'balance.low',
] as const;

export const SubscribeWebhookInput = z.object({
  url: z
    .string()
    .url()
    .describe('HTTPS-only callback URL — backend rejects http://'),
  events: z
    .array(z.enum(ALLOWED_WEBHOOK_EVENTS))
    .min(1)
    .describe('1+ events from: sms.received, order.cancelled, order.expired, order.swapped, balance.low'),
  threshold_usd: z
    .number()
    .optional()
    .describe('Required if events includes "balance.low" — fire when balance drops below this'),
  description: z.string().optional().describe('Free-form label for the webhook'),
});

export const SUBSCRIBE_WEBHOOK_TOOL_DEF = {
  name: 'virtualsms_subscribe_webhook',
  title: 'Subscribe to Webhook Events',
  description:
    'Subscribe to outbound webhook deliveries for sms.received, order.cancelled, order.expired, ' +
    'order.swapped, or balance.low events. Returns webhook_id and signing secret. ' +
    'Use this for long-running agents instead of polling. ' +
    'For balance.low, threshold_usd is required.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      url: { type: 'string', format: 'uri' },
      events: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['sms.received', 'order.cancelled', 'order.expired', 'order.swapped', 'balance.low'],
        },
        minItems: 1,
      },
      threshold_usd: { type: 'number' },
      description: { type: 'string' },
    },
    required: ['url', 'events'],
  },
  annotations: {
    title: 'Subscribe to Webhook Events',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
};

export async function handleSubscribeWebhook(
  _client: VirtualSMSClient,
  _args: z.infer<typeof SubscribeWebhookInput>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // STUB — design only. Implementation in v1.3.0 Task 8.
  throw new Error('virtualsms_subscribe_webhook is a v1.3.0 stub — not implemented');
}
