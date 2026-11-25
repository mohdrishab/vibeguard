import { readFile } from 'node:fs/promises';

import type { ProjectInfo } from '@closed-door/core';
import { createTestProject, minimalPackageJson, packageJsonText } from '@closed-door/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { AnalyzerRegistry } from './registry.js';
import { FileCache } from './file-cache.js';
import { captureSnippet } from './issues.js';
import { BundleAnalyzer } from './performance/bundle-analyzer.js';
import { BlockingOperationsAnalyzer } from './performance/blocking-operations-analyzer.js';
import { ReactPerformanceAnalyzer } from './performance/react-performance-analyzer.js';
import { SecretScanner } from './security/secret-scanner.js';

const disposables: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(disposables.splice(0).map((dispose) => dispose()));
});

async function fixtureProject(files: Record<string, string>): Promise<string> {
  const project = await createTestProject(files);
  disposables.push(project.dispose);
  return project.root;
}

describe('FileCache', () => {
  it('coalesces concurrent and repeated reads into one physical read', async () => {
    let reads = 0;
    const cache = new FileCache(async () => {
      reads += 1;
      return 'first\nsecond';
    });

    const [a, b] = await Promise.all([
      cache.readText('/virtual/file.ts'),
      cache.readText('/virtual/file.ts'),
    ]);
    const c = await cache.readText('/virtual/file.ts');

    expect(a).toBe('first\nsecond');
    expect(b).toBe('first\nsecond');
    expect(c).toBe('first\nsecond');
    expect(reads).toBe(1);
    expect(cache.stats).toEqual({ hits: 2, misses: 1, size: 1 });
  });

  it('remembers failed reads as undefined without retrying', async () => {
    let reads = 0;
    const cache = new FileCache(async () => {
      reads += 1;
      throw new Error('ENOENT');
    });

    expect(await cache.readText('/virtual/missing.ts')).toBeUndefined();
    expect(await cache.readText('/virtual/missing.ts')).toBeUndefined();
    expect(await cache.readLines('/virtual/missing.ts')).toBeUndefined();
    expect(reads).toBe(1);
  });

  it('splits lines once and shares the same physical read with readText', async () => {
    let reads = 0;
    const cache = new FileCache(async () => {
      reads += 1;
      return 'alpha\r\nbeta\ngamma';
    });

    expect(await cache.readLines('/virtual/lines.ts')).toEqual(['alpha', 'beta', 'gamma']);
    expect(await cache.readLines('/virtual/lines.ts')).toEqual(['alpha', 'beta', 'gamma']);
    expect(await cache.readText('/virtual/lines.ts')).toBe('alpha\r\nbeta\ngamma');
    expect(reads).toBe(1);
  });
});

describe('captureSnippet', () => {
  it('returns the requested line and reads the file once per scan', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
      'src/lines.ts': 'const one = 1;\nconst two = 2;\n\nconst four = 4;\n',
    });
    let reads = 0;
    const cache = new FileCache(async (file) => {
      reads += 1;
      return readFile(file, 'utf8');
    });

    expect(await captureSnippet(root, 'src/lines.ts', 2, cache)).toBe('const two = 2;');
    expect(await captureSnippet(root, 'src/lines.ts', 1, cache)).toBe('const one = 1;');
    expect(await captureSnippet(root, 'src/lines.ts', 4, cache)).toBe('const four = 4;');
    expect(await captureSnippet(root, 'src/lines.ts', 3, cache)).toBeUndefined();
    expect(await captureSnippet(root, 'src/lines.ts', 99, cache)).toBeUndefined();
    expect(reads).toBe(1);
  });

  it('handles missing and unreadable files safely', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
    });
    let reads = 0;
    const cache = new FileCache(async () => {
      reads += 1;
      throw new Error('EACCES');
    });

    expect(await captureSnippet(root, 'src/missing.ts', 1, cache)).toBeUndefined();
    expect(await captureSnippet(root, 'src/missing.ts', 1)).toBeUndefined();
    expect(reads).toBe(1);
  });

  it('still reads directly when no cache is supplied', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
      'src/direct.ts': 'export const direct = true;\n',
    });

    expect(await captureSnippet(root, 'src/direct.ts', 1)).toBe('export const direct = true;');
  });
});

describe('per-scan cache integration', () => {
  it('reads one source file once even when four analyzers report on it', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(
        minimalPackageJson({ dependencies: { react: '^19.0.0', lodash: '^4.17.0' } }),
      ),
      'src/App.tsx': [
        'items.map(item => <div>{item}</div>);',
        'const password = "hunter2hunter2";',
        'fs.readFileSync("data.json");',
        '',
      ].join('\n'),
    });
    const project: ProjectInfo = {
      root,
      name: 'cache-integration',
      languages: ['typescript'],
      frameworks: ['React', 'Node.js'],
      packageManager: 'npm',
      dependencies: ['react', 'lodash'],
      scripts: { start: 'node server.js' },
      files: ['package.json', 'src/App.tsx'],
      entryPoints: [],
      configFiles: [],
    };

    const reads: string[] = [];
    const cache = new FileCache(async (file) => {
      reads.push(file);
      return readFile(file, 'utf8');
    });
    const registry = new AnalyzerRegistry();
    registry.register(new SecretScanner());
    registry.register(new ReactPerformanceAnalyzer());
    registry.register(new BundleAnalyzer());
    registry.register(new BlockingOperationsAnalyzer());

    const runs = await registry.runAllDetailed(project, { files: cache });
    const findings = runs.flatMap((run) => run.issues);

    expect(reads).toHaveLength(1);
    expect(reads[0]?.endsWith('App.tsx')).toBe(true);
    expect(findings.length).toBeGreaterThanOrEqual(3);
    expect(
      findings.filter((issue) => issue.location.file === 'src/App.tsx').length,
    ).toBeGreaterThanOrEqual(3);
  });
});
