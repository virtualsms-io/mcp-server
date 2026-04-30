/**
 * virtualsms_manage_webhooks — list/delete/test/deliveries combined.
 *
 * STATUS: v1.3.0 STUB — signatures only, no implementation logic.
 * See docs/v1.3.0-design.md §4.6b and docs/v1.3.0-plan.md Task 9.
 *
 * Backend support: GET / DELETE / POST /test / GET /deliveries
 *   on /api/v1/customer/webhooks/:id (already shipped).
 */

import { z } from 'zod';
import type { VirtualSMSClient } from '../../client.js';

export const ManageWebhooksInput = z
  .object({
    action: z
      .enum(['list', 'delete', 'test', 'deliveries'])
      .describe('Which CRUD-ish action to perform'),
    webhook_id: z
      .string()
      .optional()
      .describe('Required for delete, test, deliveries; ignored for list'),
  })
  .refine((data) => data.action === 'list' || !!data.webhook_id, {
    message: 'webhook_id is required for delete, test, deliveries',
    path: ['webhook_id'],
  });

export const MANAGE_WEBHOOKS_TOOL_DEF = {
  name: 'virtualsms_manage_webhooks',
  title: 'Manage Webhooks (list/delete/test/deliveries)',
  description:
    'Manage existing webhook subscriptions. Actions: ' +
    '"list" returns all subscriptions; ' +
    '"delete" removes one by webhook_id; ' +
    '"test" fires a synthetic event for one webhook; ' +
    '"deliveries" returns the last 100 deliveries for one webhook (audit/debug).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['list', 'delete', 'test', 'deliveries'] },
      webhook_id: { type: 'string' },
    },
    required: ['action'],
  },
  annotations: {
    title: 'Manage Webhooks',
    readOnlyHint: false,
    destructiveHint: true, // delete is destructive — annotate worst-case
    idempotentHint: true,
    openWorldHint: true,
  },
};

function out(payload: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

export async function handleManageWebhooks(
  client: VirtualSMSClient,
  args: z.infer<typeof ManageWebhooksInput>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  switch (args.action) {
    case 'list': {
      const webhooks = await client.listWebhooks();
      return out({
        count: webhooks.length,
        webhooks: webhooks.map((w) => ({
          id: w.id,
          url: w.url,
          events: w.events,
          threshold_usd: w.threshold_usd,
          description: w.description,
          active: w.active ?? true,
          created_at: w.created_at,
        })),
        tip:
          webhooks.length === 0
            ? 'No webhooks. Use subscribe_webhook to create one.'
            : 'Use action:"delete"|"test"|"deliveries" with one of these webhook_ids.',
      });
    }
    case 'delete': {
      // Zod refine guarantees webhook_id is set, but TS narrowing requires guard.
      const id = args.webhook_id as string;
      const r = await client.deleteWebhook(id);
      return out({
        deleted: Boolean(r.deleted),
        webhook_id: id,
        tip: r.deleted ? 'Webhook removed. No more deliveries will fire.' : 'Delete failed; check webhook_id.',
      });
    }
    case 'test': {
      const id = args.webhook_id as string;
      const r = await client.testWebhook(id);
      return out({
        webhook_id: id,
        delivered: r.delivered,
        response_code: r.response_code,
        error: r.error,
        tip: r.delivered
          ? 'Synthetic event fired. Check your endpoint logs.'
          : 'Test failed. Common causes: endpoint down, non-2xx response, TLS error. Inspect deliveries for details.',
      });
    }
    case 'deliveries': {
      const id = args.webhook_id as string;
      const list = await client.getDeliveries(id);
      return out({
        webhook_id: id,
        count: list.length,
        deliveries: list,
        tip:
          list.length === 0
            ? 'No deliveries yet. Use action:"test" to fire a synthetic event.'
            : 'Most recent deliveries first. Check status + response_code for failures.',
      });
    }
  }
}
