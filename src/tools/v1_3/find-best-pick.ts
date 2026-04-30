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

interface CandidateRow {
  country: string;
  country_name: string;
  price_usd: number;
  stock: boolean;
}

function score(prefer: 'cheapest' | 'most_stock' | 'balanced', row: CandidateRow, minPrice: number, maxPrice: number): number {
  // Normalize price into [0,1] where lower price = higher score.
  const priceRange = Math.max(maxPrice - minPrice, 0.000001);
  const priceInverse = 1 - (row.price_usd - minPrice) / priceRange;
  // Stock = binary signal (the API only exposes available/not).
  const stockSignal = row.stock ? 1 : 0;
  if (prefer === 'cheapest') return priceInverse;
  if (prefer === 'most_stock') return stockSignal;
  // balanced
  return 0.7 * priceInverse + 0.3 * stockSignal;
}

export async function handleFindBestPick(
  client: VirtualSMSClient,
  args: z.infer<typeof FindBestPickInput>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const allCountries = await client.listCountries();

  // Apply pool/exclude filters early to avoid pricing irrelevant countries.
  const poolSet = args.country_pool ? new Set(args.country_pool.map((c) => c.toUpperCase())) : null;
  const excludeSet = args.country_exclude ? new Set(args.country_exclude.map((c) => c.toUpperCase())) : new Set<string>();
  const filtered = allCountries.filter((c) => {
    const iso = c.iso.toUpperCase();
    if (excludeSet.has(iso)) return false;
    if (poolSet && !poolSet.has(iso)) return false;
    return true;
  });

  // Price each in batches to avoid 10s of concurrent requests.
  const batchSize = 10;
  const candidates: CandidateRow[] = [];
  for (let i = 0; i < filtered.length; i += batchSize) {
    const batch = filtered.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (c) => {
        const price = await client.checkPrice(args.service, c.iso);
        return {
          country: c.iso,
          country_name: c.name,
          price_usd: price.price_usd,
          stock: price.available,
        } satisfies CandidateRow;
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.stock) {
        candidates.push(r.value);
      }
    }
  }

  if (candidates.length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              error: 'no_pick',
              service: args.service,
              message:
                'No country has stock for this service within your filter. Drop country_pool/exclude or try a different service.',
              tip: 'Use list_services to verify the service code, find_cheapest to browse availability across all countries.',
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const minPrice = Math.min(...candidates.map((c) => c.price_usd));
  const maxPrice = Math.max(...candidates.map((c) => c.price_usd));
  const scored = candidates
    .map((c) => ({ ...c, score: score(args.prefer, c, minPrice, maxPrice) }))
    .sort((a, b) => b.score - a.score);

  const pick = scored[0];
  const runnerUps = scored.slice(1, 4); // top 3 alternatives

  const reasoning = (() => {
    const lead = `${pick.country_name} (${pick.country}) picked: `;
    if (args.prefer === 'cheapest') {
      return `${lead}lowest price ($${pick.price_usd.toFixed(3)}) among ${candidates.length} available countr${candidates.length === 1 ? 'y' : 'ies'}.`;
    }
    if (args.prefer === 'most_stock') {
      return `${lead}has stock; ranked by stock-availability among ${candidates.length} candidates.`;
    }
    // balanced
    const cheapestRow = candidates.reduce((a, b) => (a.price_usd <= b.price_usd ? a : b));
    if (pick.country === cheapestRow.country) {
      return `${lead}both cheapest at $${pick.price_usd.toFixed(3)} AND in stock among ${candidates.length} candidates.`;
    }
    const diffPct = Math.round(((pick.price_usd - cheapestRow.price_usd) / cheapestRow.price_usd) * 100);
    return `${lead}balanced score wins ($${pick.price_usd.toFixed(3)}, ${diffPct}% above cheapest ${cheapestRow.country_name} but better stock signal). Across ${candidates.length} candidates.`;
  })();

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            pick: {
              country: pick.country,
              country_name: pick.country_name,
              price_usd: pick.price_usd,
              stock: pick.stock,
              score: Math.round(pick.score * 1000) / 1000,
            },
            runner_ups: runnerUps.map((r) => ({
              country: r.country,
              country_name: r.country_name,
              price_usd: r.price_usd,
              score: Math.round(r.score * 1000) / 1000,
            })),
            reasoning,
            considered_count: candidates.length,
            tip: `Pass country=${pick.country} + service=${args.service} to create_order to buy.`,
          },
          null,
          2
        ),
      },
    ],
  };
}
