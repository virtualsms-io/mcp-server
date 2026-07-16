/**
 * Transport-parity test — the highest-value test in this suite.
 *
 * The stdio transport (index.ts) and the HTTP transport (http-server.ts)
 * each hand-maintain their own `switch (name)` dispatch table mapping tool
 * names to handlers. Nothing structurally enforces that both switches list
 * the same tools — a tool added to one and forgotten in the other silently
 * "disappears" for that transport's users. This test parses both files'
 * source, extracts the case labels, and fails loudly on any diff between:
 *   - index.ts dispatch vs http-server.ts dispatch (parity)
 *   - either dispatch vs TOOL_DEFINITIONS (no defined-but-undispatched tool,
 *     no dispatched-but-undefined/stale case)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOOL_DEFINITIONS } from '../tools.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function extractDispatchedToolNames(filePath: string): Set<string> {
  const src = readFileSync(filePath, 'utf8');
  const names = new Set<string>();
  const caseRe = /case\s+'(virtualsms_[a-zA-Z0-9_]+)'/g;
  let match: RegExpExecArray | null;
  while ((match = caseRe.exec(src)) !== null) {
    names.add(match[1]);
  }
  return names;
}

const indexPath = path.join(__dirname, '..', 'index.ts');
const httpServerPath = path.join(__dirname, '..', 'http-server.ts');

const indexNames = extractDispatchedToolNames(indexPath);
const httpNames = extractDispatchedToolNames(httpServerPath);
const definedNames = new Set(TOOL_DEFINITIONS.map((t) => t.name));

describe('transport parity — stdio (index.ts) vs HTTP (http-server.ts)', () => {
  it('sanity: both files actually contain dispatch cases (regex didn\'t silently match zero)', () => {
    expect(indexNames.size).toBeGreaterThan(30);
    expect(httpNames.size).toBeGreaterThan(30);
  });

  it('dispatches the IDENTICAL set of tool names in both directions', () => {
    const onlyInIndex = [...indexNames].filter((n) => !httpNames.has(n)).sort();
    const onlyInHttp = [...httpNames].filter((n) => !indexNames.has(n)).sort();
    expect({ onlyInIndex, onlyInHttp }).toEqual({ onlyInIndex: [], onlyInHttp: [] });
  });

  it('every TOOL_DEFINITIONS entry is dispatched by BOTH transports (nothing defined-but-missing)', () => {
    const missingFromIndex = [...definedNames].filter((n) => !indexNames.has(n)).sort();
    const missingFromHttp = [...definedNames].filter((n) => !httpNames.has(n)).sort();
    expect({ missingFromIndex, missingFromHttp }).toEqual({ missingFromIndex: [], missingFromHttp: [] });
  });

  it('every dispatched case name is a real tool definition (no stale/typo cases)', () => {
    const staleInIndex = [...indexNames].filter((n) => !definedNames.has(n)).sort();
    const staleInHttp = [...httpNames].filter((n) => !definedNames.has(n)).sort();
    expect({ staleInIndex, staleInHttp }).toEqual({ staleInIndex: [], staleInHttp: [] });
  });
});
