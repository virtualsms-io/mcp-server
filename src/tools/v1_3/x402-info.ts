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

// Networks that are intentionally NOT exposed via x402_info even if the
// backend somehow returns them. BNB / BSC don't support EIP-3009, our
// settler doesn't ship Permit2 yet — the upstream Vault memory
// `project_x402_wallet_setup` says: "Don't re-enable BNB without shipping
// Permit2 first."
const DISABLED_NETWORKS = new Set(['bsc', 'binance', 'bnb']);

export async function handleX402Info(
  client: VirtualSMSClient,
  _args: z.infer<typeof X402InfoInput>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  let info;
  try {
    info = await client.getX402Info();
  } catch (err) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              error: 'unsupported_on_this_backend',
              enabled: false,
              message: `This server doesn't expose /api/v1/x402/info: ${(err as Error).message}`,
              tip: 'Self-hosted older API servers may not have x402 enabled. Contact the operator.',
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // Map raw networks → agent-friendly accepts[], filtering disabled networks.
  const accepts = info.networks
    .filter((n) => !DISABLED_NETWORKS.has(n.network.toLowerCase()))
    .map((n) => ({
      network: n.network,
      asset: n.token,
      min_usd: info.min_topup_usd,
      max_usd: info.max_topup_usd,
      pay_to: n.network.toLowerCase() === 'solana' ? info.solana_relayer : info.evm_relayer,
    }));

  // patterns: derived from what the backend exposes.
  const patterns: string[] = [];
  if (info.topup_endpoint) patterns.push('topup');
  // Pattern A is currently 410-deprecated server-side, but if a self-hosted
  // server still surfaces `resource`, advertise it.
  if (info.resource) patterns.push('sms-verify');

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            enabled: Boolean(info.enabled),
            x402_version: info.x402_version,
            patterns,
            accepts,
            min_topup_usd: info.min_topup_usd,
            max_topup_usd: info.max_topup_usd,
            default_topup_usd: info.default_topup_usd,
            tip:
              info.enabled && accepts.length > 0
                ? 'Use pay_and_buy to deposit (and optionally buy a number) in one shot.'
                : 'x402 not enabled on this server. Use the dashboard topup at virtualsms.io/dashboard.',
          },
          null,
          2
        ),
      },
    ],
  };
}
