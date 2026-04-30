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
  client: VirtualSMSClient,
  args: z.infer<typeof SubscribeWebhookInput>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // Pre-flight: balance.low requires threshold_usd. Same pattern as the
  // cooldown pre-check in v1.2.3 — fail fast client-side, save a 4xx.
  if (args.events.includes('balance.low') && (typeof args.threshold_usd !== 'number' || args.threshold_usd <= 0)) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              error: 'threshold_required',
              message:
                'balance.low webhook requires a positive threshold_usd. The webhook fires when account balance drops below this value.',
              tip: 'Pass e.g. threshold_usd: 5 to be alerted when balance < $5.',
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const wh = await client.createWebhook({
    url: args.url,
    events: args.events,
    threshold_usd: args.threshold_usd,
    description: args.description,
  });

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            webhook_id: wh.id,
            url: wh.url,
            events: wh.events,
            secret: wh.secret,
            active: wh.active ?? true,
            created_at: wh.created_at,
            tip:
              'Verify deliveries with HMAC-SHA256 of the request body using `secret`. ' +
              'See https://docs.virtualsms.io/webhooks. ' +
              'Use manage_webhooks(action:"test", webhook_id:"' +
              wh.id +
              '") to fire a test event right now.',
          },
          null,
          2
        ),
      },
    ],
  };
}
