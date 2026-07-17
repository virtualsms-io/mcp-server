/**
 * Version drift test: the same shape as docs-tool-names.test.ts, for versions.
 *
 * A version is a fact about the build. Every place it is TYPED rather than
 * DERIVED is a place it can go stale, and this repo has already proved that:
 * package.json said 1.3.0 while four hardcoded literals in src/ still said
 * '1.2.3', two of them served to clients on every `initialize` and on the
 * Smithery server card. Nothing failed, because nothing checked. Same defect
 * class as the hardcoded tool count, same fix: derive it, then enforce it.
 *
 * src/ is no longer checked here for literals because it no longer has any:
 * every wire surface imports VERSION from src/version.ts, which reads
 * package.json. That is structural, not conventional, so it cannot drift.
 *
 * The JSON publish manifests CAN still drift: they are hand-typed and no build
 * step generates them. They are what this test exists for.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { VERSION } from '../version.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');

function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(repoRoot, rel), 'utf8'));
}

describe('version consistency: every published version field agrees with package.json', () => {
  const pkg = readJson('package.json') as { version: string };

  it('VERSION is derived from package.json, not retyped', () => {
    expect(VERSION).toBe(pkg.version);
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('server.json agrees (both fields: top-level and the package entry)', () => {
    const serverJson = readJson('server.json') as {
      version: string;
      packages: { version: string }[];
    };
    expect(serverJson.version).toBe(pkg.version);
    // packages[].version is set independently of the top-level field, so it is
    // its own drift surface and is asserted separately rather than assumed.
    expect(serverJson.packages.length).toBeGreaterThan(0);
    for (const p of serverJson.packages) {
      expect(p.version).toBe(pkg.version);
    }
  });

  it('.plugin/plugin.json agrees', () => {
    const plugin = readJson('.plugin/plugin.json') as { version: string };
    expect(plugin.version).toBe(pkg.version);
  });

  it('no source file hardcodes a semver literal in a version position', () => {
    // Catches a reintroduced `version: '1.2.3'`. Deliberately narrow: it matches
    // a version KEY assigned a bare semver string, so prose and comments that
    // mention a version (e.g. client.ts "added v1.2.3") do not trip it.
    const offenders: string[] = [];
    for (const rel of ['src/index.ts', 'src/http-server.ts']) {
      const src = readFileSync(path.join(repoRoot, rel), 'utf8');
      src.split(/\r?\n/).forEach((line, i) => {
        if (/\bversion\s*:\s*['"`]\d+\.\d+\.\d+['"`]/.test(line)) {
          offenders.push(`${rel}:${i + 1} ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
