import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { VIBEGUARD_VERSION } from './version.js';

describe('VIBEGUARD_VERSION', () => {
  it('matches the version published in the CLI package manifest', () => {
    const manifestPath = fileURLToPath(new URL('../package.json', import.meta.url));
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version: string };

    expect(VIBEGUARD_VERSION).toBe(manifest.version);
  });
});
