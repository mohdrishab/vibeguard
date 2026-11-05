import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG_FILE_NAME, defaultConfig, loadConfig, serializeConfig } from '@vibeguard/core';
import type { VibeGuardError } from '@vibeguard/core';
import { createTestProject } from '@vibeguard/testing';

import { runConfig } from './config.js';
import { runInit } from './init.js';
import { runScan } from './scan.js';

const disposables: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(disposables.splice(0).map((dispose) => dispose()));
});

interface TextIo {
  readonly logs: string[];
  readonly errors: string[];
  readonly io: {
    log: (message: string) => void;
    error: (message: string) => void;
  };
}

function fakeIo(): TextIo {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    logs,
    errors,
    io: {
      log: (message) => logs.push(message),
      error: (message) => errors.push(message),
    },
  };
}

async function fixtureProject(files: Record<string, string>): Promise<string> {
  const project = await createTestProject(files);
  disposables.push(project.dispose);
  return project.root;
}

describe('runScan', () => {
  it('emits deterministic JSON including per-engine analyzer summaries', async () => {
    const root = await fixtureProject({
      'package.json': JSON.stringify({ name: 'json-project', dependencies: { react: '^19' } }),
      'src/App.tsx': 'export default () => null;\n',
      '.env.local': 'SECRET=1\n',
    });
    const { io, logs } = fakeIo();

    const result = await runScan(io, { root, json: true });

    expect(logs.length).toBe(1);
    expect(JSON.parse(logs[0] ?? '')).toEqual({
      ok: true,
      command: 'scan',
      project: expect.objectContaining({
        root,
        name: 'json-project',
        frameworks: ['React'],
      }),
      userExcludes: [],
      excludedSensitiveFiles: ['.env.local'],
      findings: [],
      analyzersRun: [
        { id: 'eslint', name: 'ESLint (bundled recommended)', applicable: true, issues: 0 },
        { id: 'tsc', name: 'TypeScript Compiler', applicable: true, issues: 0 },
        { id: 'secret-scanner', name: 'Secret Scanner', applicable: true, issues: 0 },
        { id: 'dependency-audit', name: 'Dependency Audit', applicable: true, issues: 0 },
        { id: 'bundle-analyzer', name: 'Bundle Analyzer', applicable: true, issues: 0 },
        { id: 'react-performance', name: 'React Performance Analyzer', applicable: true, issues: 0 },
        { id: 'blocking-operations', name: 'Blocking Operations Analyzer', applicable: false, inapplicableReason: 'Project does not appear to be a Node.js backend.', issues: 0 },
      ],
    });
    expect(result.project.name).toBe('json-project');
  });

  it('reports engine-level findings in human output', async () => {
    const root = await fixtureProject({
      'package.json': JSON.stringify({ name: 'buggy-project' }),
      'src/index.ts': 'export {};\n',
      'src/bug.js': 'export function total(price) { return price * unknownTaxRate; }\n',
    });
    const { io, logs } = fakeIo();

    await runScan(io, { root, json: false });

    const output = logs.join('\n');
    expect(output).toContain('Scanned buggy-project');
    expect(output).toContain('findings: 1');
    expect(output).toContain('bug.js:1');
    expect(output).toContain('no-undef');
  });

  it('marks engines not applicable when nothing matches their scope', async () => {
    const root = await fixtureProject({
      'package.json': JSON.stringify({ name: 'no-source-project' }),
      'notes/readme.txt': 'text only\n',
    });
    const { io, logs } = fakeIo();

    const result = await runScan(io, { root, json: true });

    expect(result.analyzersRun).toHaveLength(7);
    for (const summary of result.analyzersRun) {
      expect(summary.applicable).toBe(false);
      expect(summary.inapplicableReason).toBeTruthy();
      expect(summary.issues).toBe(0);
    }
    expect(JSON.parse(logs[0] ?? '')['findings']).toEqual([]);
  });

  it('fails loudly on an invalid config', async () => {
    const root = await fixtureProject({
      'package.json': '{}',
      [CONFIG_FILE_NAME]: '{"bogus":true}',
    });
    const { io } = fakeIo();

    await expect(runScan(io, { root, json: true })).rejects.toMatchObject({
      code: 'INVALID_CONFIG',
    });
  });
});

describe('runInit', () => {
  it('writes the default config as JSON output', async () => {
    const root = await fixtureProject({
      'package.json': JSON.stringify({ name: 'to-init' }),
    });
    const { io, logs } = fakeIo();

    const result = await runInit(io, { root, force: false, json: true });

    const onDisk = JSON.parse(await readFile(path.join(root, CONFIG_FILE_NAME), 'utf8'));
    expect(onDisk).toEqual(defaultConfig());
    const parsed = JSON.parse(logs[0] ?? '') as Record<string, unknown>;
    expect(parsed['ok']).toBe(true);
    expect((parsed['config'] as Record<string, unknown>)['path']).toBe(
      path.join(root, CONFIG_FILE_NAME),
    );
    expect(result.overwritten).toBe(false);
  });

  it('never overwrites an existing config without force', async () => {
    const original = serializeConfig({
      version: 1,
      scan: { exclude: ['precious/**'] },
    });
    const root = await fixtureProject({
      'package.json': '{}',
      [CONFIG_FILE_NAME]: original,
    });
    const { io } = fakeIo();

    await expect(runInit(io, { root, force: false, json: true })).rejects.toMatchObject({
      code: 'CONFIG_EXISTS',
    } satisfies Partial<Record<'code', VibeGuardError['code']>>);

    expect(await readFile(path.join(root, CONFIG_FILE_NAME), 'utf8')).toBe(original);
  });

  it('overwrites with force', async () => {
    const root = await fixtureProject({
      'package.json': '{}',
      [CONFIG_FILE_NAME]: JSON.stringify({ version: 1, scan: { exclude: ['old/**'] } }),
    });
    const { io } = fakeIo();

    await runInit(io, { root, force: true, json: true });

    expect(await loadConfig(root)).toMatchObject({
      config: defaultConfig(),
    });
  });
});

describe('runConfig', () => {
  it('reports defaults when no config exists', async () => {
    const root = await fixtureProject({ 'package.json': '{}' });
    const { io, logs } = fakeIo();

    const result = await runConfig(io, { root, json: true });

    expect(result).toEqual({
      found: false,
      path: null,
      config: defaultConfig(),
    });
    const parsed = JSON.parse(logs[0] ?? '') as Record<string, unknown>;
    expect(parsed['ok']).toBe(true);
    expect(parsed['found']).toBe(false);
  });

  it('round-trips an existing config', async () => {
    const root = await fixtureProject({
      [CONFIG_FILE_NAME]: JSON.stringify({
        version: 1,
        scan: { exclude: ['src/generated/**'] },
      }),
    });
    const { io } = fakeIo();

    const result = await runConfig(io, { root, json: true });

    expect(result.found).toBe(true);
    expect(result.config.scan.exclude).toEqual(['src/generated/**']);
  });

  it('propagates schema violations on existing files', async () => {
    const root = await fixtureProject({ [CONFIG_FILE_NAME]: '{"version":2}' });
    await expect(runConfig(fakeIo().io, { root, json: false })).rejects.toMatchObject({
      code: 'INVALID_CONFIG',
    });
  });
});
