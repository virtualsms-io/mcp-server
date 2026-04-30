/**
 * Backward-compat snapshot test for the v1.2.x tool surface.
 *
 * Locks the name + inputSchema + annotations of every tool that shipped in
 * v1.2.x. ANY change to one of these fields will break this test, which means
 * the change broke a 1.2.x client contract. If a snapshot diff appears:
 *
 *   1. STOP. Do not regenerate the snapshot.
 *   2. Diagnose the change — was it intentional or a regression?
 *   3. If the field was intentionally removed/renamed/changed, the v1.3.x
 *      change is no longer "additive" — it's a breaking change. Either
 *      rebuild it as additive, or coordinate a major version bump.
 *
 * v1.3.x adds new tools but never modifies existing ones. The snapshot below
 * pins the 18 tools shipped in v1.2.3.
 */

import { describe, expect, test } from 'vitest';
import { TOOL_DEFINITIONS } from '../src/tools.js';

// The 18 tools that shipped in v1.2.x. Sorted alphabetically for stability.
const V1_2_X_TOOL_NAMES = [
  'virtualsms_cancel_all_orders',
  'virtualsms_cancel_order',
  'virtualsms_create_order',
  'virtualsms_find_cheapest',
  'virtualsms_get_balance',
  'virtualsms_get_order',
  'virtualsms_get_price',
  'virtualsms_get_profile',
  'virtualsms_get_sms',
  'virtualsms_get_stats',
  'virtualsms_get_transactions',
  'virtualsms_list_countries',
  'virtualsms_list_orders',
  'virtualsms_list_services',
  'virtualsms_order_history',
  'virtualsms_search_services',
  'virtualsms_swap_number',
  'virtualsms_wait_for_sms',
] as const;

function toolByName(name: string) {
  const t = TOOL_DEFINITIONS.find((d) => d.name === name);
  if (!t) throw new Error(`Tool ${name} missing from TOOL_DEFINITIONS`);
  return t;
}

describe('v1.2.x backward-compat schema snapshot', () => {
  test('all 18 v1.2.x tools are still registered', () => {
    const registeredNames = TOOL_DEFINITIONS.map((t) => t.name).sort();
    for (const name of V1_2_X_TOOL_NAMES) {
      expect(registeredNames).toContain(name);
    }
  });

  test('inputSchema for every v1.2.x tool matches the locked snapshot', () => {
    const snapshot = V1_2_X_TOOL_NAMES.map((name) => {
      const t = toolByName(name);
      return {
        name: t.name,
        inputSchema: t.inputSchema,
      };
    });
    expect(snapshot).toMatchSnapshot();
  });

  test('annotations for every v1.2.x tool match the locked snapshot', () => {
    const snapshot = V1_2_X_TOOL_NAMES.map((name) => {
      const t = toolByName(name);
      return {
        name: t.name,
        annotations: t.annotations,
      };
    });
    expect(snapshot).toMatchSnapshot();
  });

  test('description prefix is stable for every v1.2.x tool (catches accidental rewrites)', () => {
    // Pin the first 60 chars of each description. Full description allowed to
    // grow with new tip lines, but the leading sentence must not change — that
    // is what AI agents key on for tool selection.
    const snapshot = V1_2_X_TOOL_NAMES.map((name) => {
      const t = toolByName(name);
      return {
        name: t.name,
        description_head: t.description.slice(0, 60),
      };
    });
    expect(snapshot).toMatchSnapshot();
  });
});
