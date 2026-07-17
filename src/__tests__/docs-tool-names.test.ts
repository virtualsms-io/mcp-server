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
 *
 * PART 2 (the wire half) closes the gap that let this bug survive the docs
 * sweep. Dead names also lived INSIDE the strings the server itself serves:
 * tool descriptions, JSON-schema param descriptions, resource bodies, prompt
 * text, and a runtime `tip` handed to the model mid-task. Docs are read by
 * humans; these are read by the model at call time, so they are strictly worse.
 * Every wire surface is now swept by the same resolver.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOOL_DEFINITIONS, getToolDefinitions } from '../tools.js';
import { RESOURCE_DEFINITIONS, getResourceContent } from '../resources.js';
import { PROMPT_DEFINITIONS, getPromptMessages } from '../prompts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');

/**
 * Hand-authored docs only.
 *
 * Deliberately NOT scanned:
 * - CHANGELOG.md — a historical record. Entries for v1.0.0/v1.1.0 correctly
 *   use the pre-rename names that shipped at that time. Rewriting them would
 *   falsify history.
 *
 * (.smithery/ was a generated bundle from an abandoned Smithery CLI pipeline.
 * It advertised a third generation of names and a hardcoded count of 12 against
 * a real 41, could not be regenerated (no @smithery/cli dependency), and was
 * referenced by nothing. Deleted rather than hand-edited; smithery.yaml is
 * `type: http` and points at the hosted URL, so no bundle is needed.)
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

/**
 * The six names retired on 2026-03-15, plus later strays found on the wire:
 * `active_orders` (a prompt/resource invention that never existed) and the
 * third-generation names that only ever lived in the deleted .smithery bundle.
 * Checked as a literal substring blocklist: belt and braces alongside the
 * resolver below, and it documents the exact tokens for the next reader.
 */
const DEAD_NAMES = [
  'buy_number',
  'check_sms',
  'check_price',
  'list_active_orders',
  'wait_for_code',
  'active_orders',
  'create_number_order',
  'get_sms_code',
  'wait_for_sms_code',
  'find_cheapest_countries',
  'swap_phone_number',
];

/** `search_service` is dead but is a prefix of the live `search_services`. */
const DEAD_SEARCH_SERVICE = /search_service(?!s)/;

function findDeadNames(text: string): string[] {
  const hits = DEAD_NAMES.filter((d) => text.includes(d));
  if (DEAD_SEARCH_SERVICE.test(text)) hits.push('search_service');
  return hits;
}

/** Collect every human-readable string a wire payload exposes to the model. */
function collectStrings(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) for (const v of node) collectStrings(v, out);
  else if (node && typeof node === 'object') {
    for (const v of Object.values(node)) collectStrings(v, out);
  }
  return out;
}

describe('wire strings: nothing the server serves may name a dead tool', () => {
  // The default payload: session-drive tools are gated off behind
  // VIRTUALSMS_ENABLE_SESSIONS, so a default client sees 41 of the 44.
  const served = getToolDefinitions(false);

  it('tools/list serves the expected 41 tools by default', () => {
    expect(served.length).toBe(41);
    expect(TOOL_DEFINITIONS.length).toBe(44); // 41 + 3 session-gated
  });

  it('every tool NAME on the wire is unchanged (renaming a published tool breaks every user)', () => {
    // Frozen list. Descriptions may change freely; names may not. If you are
    // here because you renamed a tool: that is a breaking change for every
    // installed client, and the docs+wire sweep must go with it.
    expect(served.map((t) => t.name).sort()).toEqual(
      [
        'virtualsms_buy_proxy',
        'virtualsms_cancel_all_orders',
        'virtualsms_cancel_order',
        'virtualsms_cancel_rental',
        'virtualsms_check_number',
        'virtualsms_create_order',
        'virtualsms_create_rental',
        'virtualsms_extend_rental',
        'virtualsms_find_cheapest',
        'virtualsms_generate_proxy_endpoint',
        'virtualsms_get_balance',
        'virtualsms_get_order',
        'virtualsms_get_price',
        'virtualsms_get_profile',
        'virtualsms_get_proxy_usage',
        'virtualsms_get_proxy_usage_history',
        'virtualsms_get_rental',
        'virtualsms_get_sms',
        'virtualsms_get_stats',
        'virtualsms_get_transactions',
        'virtualsms_list_countries',
        'virtualsms_list_orders',
        'virtualsms_list_proxies',
        'virtualsms_list_proxy_catalog',
        'virtualsms_list_proxy_locations',
        'virtualsms_list_rentals',
        'virtualsms_list_services',
        'virtualsms_order_history',
        'virtualsms_release_rental',
        'virtualsms_rentals_available',
        'virtualsms_rentals_price',
        'virtualsms_rentals_pricing',
        'virtualsms_rentals_services',
        'virtualsms_retry_order',
        'virtualsms_rotate_proxy',
        'virtualsms_search_services',
        'virtualsms_set_proxy_targeting',
        'virtualsms_start_manual_registration_session',
        'virtualsms_swap_number',
        'virtualsms_test_proxy',
        'virtualsms_wait_for_sms',
      ].sort()
    );
  });

  it('the Smithery-scored ratios hold: 41/41 described, 41/41 all-params-described, 41/41 annotated', () => {
    const described = served.filter((t) => t.description?.trim()).length;
    const annotated = served.filter((t) => t.annotations).length;
    const allParams = served.filter((t) => {
      const props: Record<string, { description?: string }> =
        (t.inputSchema as { properties?: Record<string, { description?: string }> })?.properties ??
        {};
      return Object.values(props).every((p) => p?.description?.trim());
    }).length;

    expect(described).toBe(41);
    expect(allParams).toBe(41);
    expect(annotated).toBe(41);
  });

  it('no dead name appears anywhere in the tools/list payload', () => {
    const broken: string[] = [];
    for (const t of served) {
      for (const dead of findDeadNames(JSON.stringify(t))) {
        broken.push(`${t.name} -> ${dead}`);
      }
    }
    expect(broken.sort()).toEqual([]);
  });

  it('every tool-shaped token in a tools/list description resolves to a real tool', () => {
    const broken: string[] = [];
    for (const t of served) {
      for (const s of collectStrings(t)) {
        for (const [tok] of extractToolRefs(s)) {
          if (!validNames.has(tok)) broken.push(`${t.name} -> ${tok}`);
        }
      }
    }
    expect([...new Set(broken)].sort()).toEqual([]);
  });

  it('no dead name appears in any resource body (resources/read)', () => {
    const broken: string[] = [];
    for (const r of RESOURCE_DEFINITIONS) {
      const body = getResourceContent(r.uri);
      for (const dead of findDeadNames(body)) broken.push(`${r.uri} -> ${dead}`);
      for (const [tok] of extractToolRefs(body)) {
        if (!validNames.has(tok)) broken.push(`${r.uri} -> ${tok}`);
      }
    }
    expect([...new Set(broken)].sort()).toEqual([]);
  });

  it('no dead name appears in any prompt (prompts/get)', () => {
    const broken: string[] = [];
    for (const p of PROMPT_DEFINITIONS) {
      const text = collectStrings(getPromptMessages(p.name, {})).join('\n');
      const blob = `${text}\n${JSON.stringify(p)}`;
      for (const dead of findDeadNames(blob)) broken.push(`${p.name} -> ${dead}`);
      for (const [tok] of extractToolRefs(blob)) {
        if (!validNames.has(tok)) broken.push(`${p.name} -> ${tok}`);
      }
    }
    expect([...new Set(broken)].sort()).toEqual([]);
  });

  it('sanity: the dead-name detector actually fires (guards against a silently-passing sweep)', () => {
    expect(findDeadNames('use check_sms to poll')).toEqual(['check_sms']);
    expect(findDeadNames('call search_service now')).toEqual(['search_service']);
    // the live name must NOT trip the search_service matcher
    expect(findDeadNames('call search_services now')).toEqual([]);
    expect(findDeadNames('use get_sms to poll')).toEqual([]);
  });
});

/**
 * The tools/list sweep above cannot see runtime response bodies: a `tip` or
 * `message` built inside a handler is only born when the tool is called. Those
 * are the worst offenders. They are not documentation, but a string handed to
 * the model mid-task, exactly when it is deciding what to call next.
 * (src/tools.ts once returned `tip: 'Use check_sms...'` from the buy handler.)
 *
 * Enumerating every handler response would need a live client per tool, so this
 * scans the server source instead: no dead name may appear anywhere in the
 * files that build wire payloads, in any form, whether description, tip, error
 * string or comment. Coarse, but it has no blind spot, and a comment naming a
 * dead tool is itself drift bait for the next reader.
 */
const WIRE_SOURCE_FILES = [
  'src/tools.ts',
  'src/resources.ts',
  'src/prompts.ts',
  // Both entrypoints dispatch tool calls and expose a Smithery-facing
  // configSchema whose .describe() text is rendered to users. index.ts shipped
  // `wait_for_sms_code` (a name that only ever existed in the dead .smithery
  // bundle) until this list grew to cover it.
  'src/index.ts',
  'src/http-server.ts',
];

describe('wire source: no dead name may survive in the files that build wire payloads', () => {
  for (const rel of WIRE_SOURCE_FILES) {
    it(`${rel} contains no dead tool name (covers runtime tips and error strings)`, () => {
      const src = readFileSync(path.join(repoRoot, rel), 'utf8');
      const broken: string[] = [];

      src.split(/\r?\n/).forEach((line, i) => {
        for (const dead of findDeadNames(line)) broken.push(`${dead} (${rel}:${i + 1})`);
      });

      expect(broken.sort()).toEqual([]);
    });
  }

  it('sanity: the source scanner reads real files (guards against a silent empty read)', () => {
    for (const rel of WIRE_SOURCE_FILES) {
      const src = readFileSync(path.join(repoRoot, rel), 'utf8');
      expect(src.length).toBeGreaterThan(500);
      // every wire-source file must mention at least one real tool name
      expect(/create_order|get_sms|wait_for_sms|find_cheapest/.test(src)).toBe(true);
    }
  });
});
