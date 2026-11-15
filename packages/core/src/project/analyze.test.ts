import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createTestProject, minimalPackageJson, packageJsonText } from '@closed-door/testing';
import { analyzeProject, analyzeProjectDetailed } from './analyze.js';

const disposables: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(disposables.splice(0).map((dispose) => dispose()));
});

async function fixtureProject(files: Record<string, string>): Promise<string> {
  const project = await createTestProject(files);
  disposables.push(project.dispose);
  return project.root;
}

describe('analyzeProjectDetailed', () => {
  it('produces full project intelligence', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(
        minimalPackageJson({
          name: 'app',
          version: '2.0.0',
          main: 'src/main.js',
          packageManager: 'yarn@4.0.0',
          dependencies: { react: '^19.0.0' },
        }),
      ),
      'src/main.js': 'console.log(1);\n',
      'src/index.ts': 'export {};\n',
      'tsconfig.json': '{}\n',
      'vite.config.ts': 'export default {};\n',
      'pnpm-lock.yaml': 'lockfileVersion: 9\n',
      '.env': 'SECRET=1\n',
    });

    const { project, excludedSensitiveFiles } = await analyzeProjectDetailed(root);

    expect(project.root).toBe(root);
    expect(project.name).toBe('app');
    expect(project.packageManager).toBe('yarn'); // field wins over lockfile
    expect(project.languages).toEqual(['typescript', 'javascript']);
    expect(project.frameworks).toEqual(['React']);
    expect(project.dependencies).toEqual(['react']);
    expect(project.scripts).toEqual({});
    expect(project.files).toEqual([
      'package.json',
      'pnpm-lock.yaml',
      'src/index.ts',
      'src/main.js',
      'tsconfig.json',
      'vite.config.ts',
    ]);
    // Manifest `main` first, then conventional candidates that exist.
    expect(project.entryPoints).toEqual(['src/main.js', 'src/index.ts']);
    expect(project.configFiles).toEqual(['tsconfig.json', 'vite.config.ts', 'pnpm-lock.yaml']);
    expect(excludedSensitiveFiles).toEqual(['.env']);
  });

  it('falls back to the directory name for an unnamed project', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson({ name: undefined })),
    });
    const { project } = await analyzeProjectDetailed(root);
    expect(project.name).toBe(path.basename(root));
  });

  it('returns frozen structures', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
      'src/index.ts': 'export {};\n',
    });
    const { project, excludedSensitiveFiles } = await analyzeProjectDetailed(root);
    for (const field of [
      'languages',
      'frameworks',
      'dependencies',
      'files',
      'entryPoints',
      'configFiles',
    ] as const) {
      expect(Object.isFrozen(project[field])).toBe(true);
    }
    expect(Object.isFrozen(project.scripts)).toBe(true);
    expect(Object.isFrozen(project)).toBe(true);
    expect(Object.isFrozen(excludedSensitiveFiles)).toBe(true);
  });

  it('applies user excludes through to the file index', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
      'src/index.ts': 'export {};\n',
      'src/generated/noised.ts': 'export {};\n',
    });
    const { project } = await analyzeProjectDetailed(root, {
      exclude: ['src/generated/**'],
    });
    expect(project.files).toEqual(['package.json', 'src/index.ts']);
  });

  it('throws NO_PROJECT for a missing manifest', async () => {
    const root = await fixtureProject({ 'notes.txt': 'hi' });
    await expect(analyzeProjectDetailed(root)).rejects.toMatchObject({
      code: 'NO_PROJECT',
    });
  });

  it('throws INVALID_PACKAGE_JSON for a broken manifest', async () => {
    const root = await fixtureProject({ 'package.json': '{ not json' });
    await expect(analyzeProjectDetailed(root)).rejects.toMatchObject({
      code: 'INVALID_PACKAGE_JSON',
    });
  });
});

describe('analyzeProject', () => {
  it('returns only the project structure', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson({ name: 'only-info' })),
      'src/index.ts': 'export {};\n',
    });
    const project = await analyzeProject(root);
    expect([project.name, project.files.length]).toEqual(['only-info', 2]);
  });
});
