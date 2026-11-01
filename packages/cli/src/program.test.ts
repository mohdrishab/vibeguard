import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createProgram } from './program.js';
import { VIBEGUARD_VERSION } from './version.js';

function distIndex(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist/index.js');
}

interface SpawnError extends Error {
  readonly status?: number;
  readonly stderr?: string | Buffer;
}

describe('createProgram', () => {
  it('names itself vibeguard and declares the current version', () => {
    const program = createProgram();
    expect(program.name()).toBe('vibeguard');
    expect(program.version()).toBe(VIBEGUARD_VERSION);
  });

  it('exposes a SemVer formatted version', () => {
    expect(VIBEGUARD_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('registers the init, scan, and config commands', () => {
    const program = createProgram();
    const names = program.commands.map((command) => command.name());
    expect(names).toEqual(expect.arrayContaining(['init', 'scan', 'config']));
  });
});

describe('vibeguard cli (end-to-end)', () => {
  it('prints usage information', () => {
    const output = execFileSync('node', [distIndex(), '--help']).toString();
    expect(output).toContain('Usage: vibeguard');
    expect(output).toContain('auditing and repair');
  });

  const disposables: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(disposables.splice(0).map((dispose) => dispose()));
  });

  async function fixtureProject(files: Record<string, string>): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), 'vibeguard-e2e-'));
    for (const [relative, content] of Object.entries(files)) {
      const target = path.join(root, ...relative.split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    }
    disposables.push(() => rm(root, { recursive: true, force: true }));
    return root;
  }

  it('init writes .vibeguardrc.json and reports the project via JSON', async () => {
    const root = await fixtureProject({
      'package.json': JSON.stringify({ name: 'e2e-app' }),
      'src/index.ts': 'export {};\n',
    });

    const output = execFileSync('node', [distIndex(), 'init', root, '--json']).toString();
    const parsed = JSON.parse(output) as { ok: boolean; project: { name: string } };
    expect(parsed.ok).toBe(true);
    expect(parsed.project.name).toBe('e2e-app');
  });

  it('config surfaces user config and preserves it', async () => {
    const root = await fixtureProject({
      'package.json': '{}',
      '.vibeguardrc.json': JSON.stringify({
        version: 1,
        scan: { exclude: ['vendor/**'] },
      }),
    });

    const output = execFileSync('node', [distIndex(), 'config', root, '--json']).toString();
    const parsed = JSON.parse(output) as {
      found: boolean;
      config: { scan: { exclude: string[] } };
    };
    expect(parsed.found).toBe(true);
    expect(parsed.config.scan.exclude).toEqual(['vendor/**']);
  });

  it('refuses to overwrite a config without --force', async () => {
    const root = await fixtureProject({
      'package.json': '{}',
      '.vibeguardrc.json': JSON.stringify({
        version: 1,
        scan: { exclude: [] },
      }),
    });

    let caught: unknown;
    try {
      execFileSync('node', [distIndex(), 'init', root], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeDefined();
    const spawnError = caught as SpawnError;
    expect(spawnError.status).toBe(1);
    expect(String(spawnError.stderr)).toContain('[CONFIG_EXISTS]');
  });

  it('rejects explicit directories without package.json', async () => {
    const emptyDir = await mkdtemp(path.join(tmpdir(), 'vibeguard-empty-'));
    disposables.push(() => rm(emptyDir, { recursive: true, force: true }));

    let caught: unknown;
    try {
      execFileSync('node', [distIndex(), 'scan', emptyDir, '--json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      caught = error;
    }
    const spawnError = caught as SpawnError;
    expect(String(spawnError.stderr)).toContain('[NO_PROJECT]');
  });
});
