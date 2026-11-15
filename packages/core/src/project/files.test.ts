import { afterEach, describe, expect, it } from 'vitest';

import { createTestProject, packageJsonText } from '@closed-door/testing';
import { DEFAULT_EXCLUDES, indexFiles } from './files.js';

const disposables: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(disposables.splice(0).map((dispose) => dispose()));
});

async function fixtureProject(files: Record<string, string>): Promise<string> {
  const project = await createTestProject(files);
  disposables.push(project.dispose);
  return project.root;
}

describe('indexFiles', () => {
  it('indexes scoped files and applies default excludes', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText({}),
      'src/index.ts': 'export {};\n',
      'src/a/b/util.ts': 'export {};\n',
      'lib/dep.js': 'export {};\n',
      'README.md': '# hi\n',
      'dist/bundle.js': 'built\n',
      'node_modules/pkg/index.js': 'dep\n',
      '.git/objects/ab': 'git\n',
      'coverage/lcov.info': 'cov\n',
      '.next/pages/index.js': 'next\n',
      '.vibeguard/cache.json': '{}\n',
    });

    const { files, excludedSensitiveFiles } = await indexFiles({ root });

    expect(files).toEqual([
      'README.md',
      'lib/dep.js',
      'package.json',
      'src/a/b/util.ts',
      'src/index.ts',
    ]);
    expect(excludedSensitiveFiles).toEqual([]);
  });

  it('uses POSIX separators everywhere', async () => {
    const root = await fixtureProject({ 'src/deep/nested/file.ts': 'export {};\n' });
    const { files } = await indexFiles({ root });
    expect(files).toEqual(['src/deep/nested/file.ts']);
    expect(files.every((entry) => !entry.includes('\\'))).toBe(true);
  });

  it('excludes sensitive files by basename policy', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText({}),
      '.env': 'SECRET=1\n',
      '.env.production': 'SECRET=2\n',
      'keys/server.pem': '-----BEGIN-----\n',
      'src/index.ts': 'export {};\n',
    });

    const { files, excludedSensitiveFiles } = await indexFiles({ root });

    // Sensitive files are skipped, never indexed; they are reported by
    // name only and their contents are never read.
    expect(files).toEqual(['package.json', 'src/index.ts']);
    expect(excludedSensitiveFiles).toEqual(['.env', '.env.production', 'keys/server.pem']);
  });

  it('applies user excludes from config on top of defaults', async () => {
    const root = await fixtureProject({
      'src/index.ts': 'export {};\n',
      'src/generated/handwritten.ts': 'export {};\n',
      'keep.ts': 'export {};\n',
    });

    const { files } = await indexFiles({
      root,
      extraExcludes: ['src/generated/**'],
    });

    expect(files).toEqual(['keep.ts', 'src/index.ts']);
  });

  it('rejects empty exclude patterns', async () => {
    const root = await fixtureProject({ 'a.ts': 'export {};\n' });
    await expect(indexFiles({ root, extraExcludes: ['ok/**', ' '] })).rejects.toThrow(RangeError);
  });

  it('exposes the frozen default exclude list', () => {
    expect(DEFAULT_EXCLUDES).toContain('**/node_modules/**');
    expect(Object.isFrozen(DEFAULT_EXCLUDES)).toBe(true);
  });
});
