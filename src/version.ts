/**
 * Single source of truth for the server version.
 *
 * package.json is the only place a version may be typed; every wire surface
 * reads it from here. Four call sites used to hardcode '1.2.3' and had already
 * drifted behind package.json's 1.3.0 (two in this file's callers alone were
 * served to clients on every `initialize`). A hardcoded version is the same
 * defect as a hardcoded tool count: it is a fact about the build, retyped by
 * hand into a place nothing re-derives it from.
 *
 * Why createRequire rather than `import pkg from '../package.json' with { type: 'json' }`:
 * tsconfig sets `rootDir: ./src` and package.json sits outside it. A static JSON
 * import pulls the file into the TS program, which forces the common root up to
 * the repo, and every emitted path shifts from `dist/index.js` to
 * `dist/src/index.js`. That silently breaks `main` and `bin`, both of which
 * point at `dist/index.js`. Enabling resolveJsonModule does not avoid this; only
 * keeping package.json out of the program does. createRequire resolves at
 * runtime, so the file never enters the program and the dist layout is untouched.
 *
 * The relative path resolves correctly from both trees because src/ and dist/
 * are each exactly one level below the package root:
 *   src/version.ts   -> ../package.json  (vitest, tsx)
 *   dist/version.js  -> ../package.json  (published package)
 * npm always ships package.json regardless of the "files" allowlist, so this
 * holds for `npx virtualsms-mcp` too.
 */
import { createRequire } from 'node:module';

const requireFromHere = createRequire(import.meta.url);
const pkg = requireFromHere('../package.json') as { version: string };

export const VERSION: string = pkg.version;
