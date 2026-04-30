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

export async function handleManageWebhooks(
  _client: VirtualSMSClient,
  _args: z.infer<typeof ManageWebhooksInput>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // STUB — design only. Implementation in v1.3.0 Task 9.
  throw new Error('virtualsms_manage_webhooks is a v1.3.0 stub — not implemented');
}
