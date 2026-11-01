import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createProgram } from './program.js';
import { VIBEGUARD_VERSION } from './version.js';

describe('createProgram', () => {
  it('names itself vibeguard and declares the current version', () => {
    const program = createProgram();
    expect(program.name()).toBe('vibeguard');
    expect(program.version()).toBe(VIBEGUARD_VERSION);
  });

  it('exposes a SemVer formatted version', () => {
    expect(VIBEGUARD_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('vibeguard --help (end-to-end)', () => {
  it('prints usage information', () => {
    const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist');
    const output = execFileSync('node', [path.join(dist, 'index.js'), '--help']).toString();
    expect(output).toContain('Usage: vibeguard');
    expect(output).toContain('auditing and repair');
  });
});
