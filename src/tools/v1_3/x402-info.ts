/**
 * virtualsms_x402_info — discover money-path capabilities (no payment required).
 *
 * STATUS: v1.3.0 STUB — signatures only, no implementation logic.
 * See docs/v1.3.0-design.md §4.5 and docs/v1.3.0-plan.md Task 6.
 */

import { z } from 'zod';
import type { VirtualSMSClient } from '../../client.js';

export const X402InfoInput = z.object({});

export const X402_INFO_TOOL_DEF = {
  name: 'virtualsms_x402_info',
  title: 'x402 Capability Discovery',
  description:
    'Discover whether this server accepts x402 payments and on which networks/assets. ' +
    'No payment required. Returns enabled flag, accepted networks (Base/Solana), assets ' +
    '(USDC/USDT), and min/max amounts. Call before pay_and_buy.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
  annotations: {
    title: 'x402 Capability Discovery',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

export async function handleX402Info(
  _client: VirtualSMSClient,
  _args: z.infer<typeof X402InfoInput>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // STUB — design only. Implementation in v1.3.0 Task 6.
  throw new Error('virtualsms_x402_info is a v1.3.0 stub — not implemented');
}
