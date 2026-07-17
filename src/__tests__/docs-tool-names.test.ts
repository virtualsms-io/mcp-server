/**
 * Docs/wire drift test — the test that would have caught the 2026-03-15 rename.
 *
 * On 2026-03-15 (commit b5aac6c) six tools were renamed on the wire:
 *   buy_number -> create_order, check_sms -> get_sms, check_price -> get_price,
 *   list_active_orders -> list_orders, wait_for_code -> wait_for_sms,
 *   search_service -> search_services
 * The code changed; the docs did not. For months the README, the shipped
 * sub-agent definition and the shipped skill told agents to call six tools
 * that do not exist. Nothing failed, because nothing checked.
 *
 * This test parses every hand-authored doc, extracts each token used in
 * tool-call position (`` `foo` `` or `foo(`), and asserts it resolves to a
 * real entry in TOOL_DEFINITIONS. Rename a tool without sweeping the docs and
 * this goes red.
 *
 * Docs write tool names without the `virtualsms_` prefix for readability, so
 * both the bare and prefixed spellings resolve.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOOL_DEFINITIONS } from '../tools.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');

/**
 * Hand-authored docs only.
 *
 * Deliberately NOT scanned:
 * - CHANGELOG.md — a historical record. Entries for v1.0.0/v1.1.0 correctly
 *   use the pre-rename names that shipped at that time. Rewriting them would
 *   falsify history.
 * - .smithery/shttp/manifest.json — a generated bundle artifact, currently
 *   stale (it still advertises a pre-b5aac6c generation of names). Regenerate
 *   or delete it rather than hand-editing.
 */
const DOC_FILES = [
  'README.md',
  'SECURITY.md',
  'agents/virtualsms.md',
  'skills/virtualsms-sms-verification/SKILL.md',
  '.cursor/rules/virtualsms.mdc',
  'rules/virtualsms.mdc',
  'examples/README.md',
  'examples/01-quick-balance-check/README.md',
  'examples/02-buy-sms-and-wait-for-code/README.md',
  'examples/03-claude-desktop-config/README.md',
  'examples/02-buy-sms-and-wait-for-code/run.mjs',
  'examples/01-quick-balance-check/run.mjs',
];

/**
 * A token is treated as a tool reference when it starts with one of the verb
 * prefixes the tool vocabulary actually uses. Anything matching this shape in
 * tool-call position must resolve, or the docs are lying to an agent.
 */
const TOOL_SHAPED =
  /^(?:virtualsms_)?(?:get|list|create|buy|check|cancel|wait|find|search|swap|order|rentals|extend|release|retry|rotate|set|test|generate|start|stop|navigate|session)_[a-z0-9_]+$/;

/**
 * Response fields and params that are tool-shaped but are not tools. Keep this
 * list short and justified — every entry is a chance for a real break to hide.
 */
const NOT_TOOLS = new Set([
  'order_id', // param on most order tools
  'cancel_available_at', // response field on an order
  'swap_available_at', // response field on an order
  'get_started', // prose
  'test_proxy_connectivity', // annotation title prose, not a wire name
]);

const validNames = new Set<string>();
for (const t of TOOL_DEFINITIONS) {
  validNames.add(t.name); // virtualsms_get_sms
  validNames.add(t.name.replace(/^virtualsms_/, '')); // get_sms
}

/** Extract tokens used in tool-call position from one doc. */
function extractToolRefs(src: string): Map<string, number[]> {
  const found = new Map<string, number[]>();
  const lines = src.split(/\r?\n/);

  lines.forEach((line, i) => {
    const lineNo = i + 1;
    const candidates: string[] = [];

    // 1. inline code spans: `foo` or `foo(args)`
    for (const m of line.matchAll(/`([a-z][a-zA-Z0-9_]*)\s*(?:\([^`]*\))?`/g)) {
      candidates.push(m[1]);
    }
    // 2. call syntax anywhere (covers fenced code blocks and prose): foo(
    for (const m of line.matchAll(/\b([a-z][a-zA-Z0-9_]*)\s*\(/g)) {
      candidates.push(m[1]);
    }
    // 3. arrow-chained flows in prose/tables: `find_cheapest` -> `wait_for_sms`
    for (const m of line.matchAll(/\b((?:virtualsms_)?[a-z][a-z0-9_]*)\b/g)) {
      const tok = m[1];
      // only consider bare tokens that are tool-shaped AND already known-valid
      // or known-dead; avoids sweeping every english word with an underscore.
      if (TOOL_SHAPED.test(tok)) candidates.push(tok);
    }

    for (const tok of candidates) {
      if (!TOOL_SHAPED.test(tok)) continue;
      if (NOT_TOOLS.has(tok)) continue;
      const arr = found.get(tok) ?? [];
      if (!arr.includes(lineNo)) arr.push(lineNo);
      found.set(tok, arr);
    }
  });

  return found;
}

describe('docs vs wire — every tool name in the docs must exist in tools/list', () => {
  it('sanity: the tool vocabulary loaded (regex did not silently match zero)', () => {
    expect(TOOL_DEFINITIONS.length).toBeGreaterThan(30);
    expect(validNames.has('create_order')).toBe(true);
    expect(validNames.has('virtualsms_create_order')).toBe(true);
    // the six dead names must NOT resolve, or this test proves nothing
    for (const dead of [
      'buy_number',
      'check_sms',
      'check_price',
      'list_active_orders',
      'wait_for_code',
      'search_service',
    ]) {
      expect(validNames.has(dead)).toBe(false);
    }
  });

  it('sanity: the doc scanner actually finds tool references', () => {
    const refs = extractToolRefs(readFileSync(path.join(repoRoot, 'README.md'), 'utf8'));
    expect(refs.size).toBeGreaterThan(10);
  });

  for (const rel of DOC_FILES) {
    it(`${rel} references only real tools`, () => {
      const abs = path.join(repoRoot, rel);
      const src = readFileSync(abs, 'utf8');
      const refs = extractToolRefs(src);

      const broken: string[] = [];
      for (const [tok, lineNos] of refs) {
        if (!validNames.has(tok)) {
          broken.push(`${tok} (${rel}:${lineNos.join(',')})`);
        }
      }

      expect(broken.sort()).toEqual([]);
    });
  }
});
