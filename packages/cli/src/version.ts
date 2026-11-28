import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * CLI root version, read from the package manifest so `vibeguard --version`,
 * the published manifest, and release tooling can never drift apart.
 *
 * `package.json` sits one level above both `src/version.ts` in the source
 * tree and `dist/version.js` in the published package, so this resolves
 * correctly during development and after `npm i @closed-door/cli`.
 */
const manifestPath = fileURLToPath(new URL('../package.json', import.meta.url));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version: string };

export const VIBEGUARD_VERSION: string = manifest.version;
