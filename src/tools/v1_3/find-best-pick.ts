/**
 * virtualsms_find_best_pick — single-shot decision with country pool/exclude + reasoning.
 *
 * STATUS: v1.3.0 STUB — signatures only, no implementation logic.
 * See docs/v1.3.0-design.md §4.3 and docs/v1.3.0-plan.md Task 5.
 */

import { z } from 'zod';
import type { VirtualSMSClient } from '../../client.js';

export const FindBestPickInput = z.object({
  service: z.string().describe('Service code (e.g. "telegram")'),
  country_pool: z
    .array(z.string())
    .optional()
    .describe('Optional ISO whitelist (e.g. ["GB","DE","NL"]) — only consider these countries'),
  country_exclude: z
    .array(z.string())
    .optional()
    .describe('Optional ISO blacklist (e.g. ["US"]) — never pick these countries'),
  prefer: z
    .enum(['cheapest', 'most_stock', 'balanced'])
    .default('balanced')
    .describe('Optimization mode (default balanced = 0.7×price + 0.3×stock)'),
});

export const FIND_BEST_PICK_TOOL_DEF = {
  name: 'virtualsms_find_best_pick',
  title: 'Find Best Country (One Decision)',
  description:
    'Pick one best country for a service in a single call, optionally filtered to a country pool ' +
    'or excluding a blacklist. Returns pick + runner_ups + plain-English reasoning. ' +
    'Use this instead of find_cheapest when you want THE answer, not a ranked list.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      service: { type: 'string' },
      country_pool: { type: 'array', items: { type: 'string' } },
      country_exclude: { type: 'array', items: { type: 'string' } },
      prefer: { type: 'string', enum: ['cheapest', 'most_stock', 'balanced'], default: 'balanced' },
    },
    required: ['service'],
  },
  annotations: {
    title: 'Find Best Country (One Decision)',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

export async function handleFindBestPick(
  _client: VirtualSMSClient,
  _args: z.infer<typeof FindBestPickInput>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // STUB — design only. Implementation in v1.3.0 Task 5.
  throw new Error('virtualsms_find_best_pick is a v1.3.0 stub — not implemented');
}
