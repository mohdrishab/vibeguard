import { afterEach, describe, expect, it } from 'vitest';

import { parsePackageJson } from '../packagejson.js';
import { createTestProject, minimalPackageJson, packageJsonText } from '@closed-door/testing';
import {
  detectFrameworks,
  detectLanguages,
  detectPackageManager,
  findProjectRoot,
  parsePackageManagerField,
  requireProjectJsonDir,
} from './detect.js';

const disposables: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(disposables.splice(0).map((dispose) => dispose()));
});

async function fixtureProject(files: Record<string, string>): Promise<string> {
  const project = await createTestProject(files);
  disposables.push(project.dispose);
  return project.root;
}

describe('parsePackageManagerField', () => {
  it('maps known manager names', () => {
    expect(parsePackageManagerField('npm@10.0.0')).toBe('npm');
    expect(parsePackageManagerField('pnpm@12.16.1')).toBe('pnpm');
    expect(parsePackageManagerField('yarn@4.0.0')).toBe('yarn');
    expect(parsePackageManagerField('bun@1.2.0')).toBe('bun');
  });

  it('accepts hashes and suffixes', () => {
    expect(parsePackageManagerField('yarn@3.2.1+sha224.abc123')).toBe('yarn');
  });

  it('returns undefined for unknown or malformed values', () => {
    expect(parsePackageManagerField(undefined)).toBeUndefined();
    expect(parsePackageManagerField('')).toBeUndefined();
    expect(parsePackageManagerField('corepack@1.0.0')).toBeUndefined();
    expect(parsePackageManagerField('12.16.1')).toBeUndefined();
  });
});

describe('findProjectRoot', () => {
  it('walks up to the nearest package.json', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
      'app/src/index.ts': 'export {};\n',
    });
    expect(await findProjectRoot(`${root}\\app\\src`)).toBe(root);
  });

  it('skips directories without package.json instead of adopting them', async () => {
    const tempRoot = await fixtureProject({ 'readme.txt': 'no manifest here' });
    // Hermetic on dev machines where an ancestor of the tmpdir may itself
    // contain a package.json: the invariant under test is that a
    // manifest-less directory is never returned as a project root.
    const found = await findProjectRoot(tempRoot);
    expect(found).not.toBe(tempRoot);
  });
});

describe('requireProjectJsonDir', () => {
  it('accepts the exact directory', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
    });
    expect(await requireProjectJsonDir(root)).toBe(root);
  });

  it('does not walk ancestors for explicit directories', async () => {
    // Design rule: an explicit [dir] argument requires package.json in
    // that exact directory — silently adopting an ancestor manifest is
    // exactly the "vibeguard ran against my home directory" foot-gun.
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
      'sub/keep.txt': 'no manifest in sub',
    });
    await expect(requireProjectJsonDir(`${root}\\sub`)).rejects.toMatchObject({
      code: 'NO_PROJECT',
    });
  });
});

describe('detectPackageManager', () => {
  it('gives the packageManager field top priority', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson({ packageManager: 'pnpm@12.16.1' })),
      'yarn.lock': 'lockfile\n',
    });
    const pkg = await parsePackageJson(root);
    expect(await detectPackageManager(root, pkg)).toBe('pnpm');
  });

  it('detects pnpm from its lockfile', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
      'pnpm-lock.yaml': 'lockfileVersion: 9\n',
    });
    expect(await detectPackageManager(root, await parsePackageJson(root))).toBe('pnpm');
  });

  it('detects yarn and bun from their lockfiles', async () => {
    const yarnRoot = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
      'yarn.lock': 'lockfile\n',
    });
    expect(await detectPackageManager(yarnRoot, await parsePackageJson(yarnRoot))).toBe('yarn');

    const bunRoot = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
      'bun.lockb': 'lockfile\n',
    });
    expect(await detectPackageManager(bunRoot, await parsePackageJson(bunRoot))).toBe('bun');
  });

  it('defaults to npm', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
    });
    expect(await detectPackageManager(root, await parsePackageJson(root))).toBe('npm');
  });
});

describe('detectLanguages', () => {
  it('ranks the dominant family first', () => {
    expect(detectLanguages(['a.ts', 'b.tsx', 'c.js'])).toEqual(['typescript', 'javascript']);
    expect(detectLanguages(['a.js', 'b.mjs', 'c.ts'])).toEqual(['javascript', 'typescript']);
  });

  it('breaks ties alphabetically', () => {
    expect(detectLanguages(['a.ts', 'b.js'])).toEqual(['javascript', 'typescript']);
  });

  it('returns empty for non-JS projects', () => {
    expect(detectLanguages(['readme.md', 'style.css'])).toEqual([]);
  });
});

describe('detectFrameworks', () => {
  async function frameworksFor(manifest: Record<string, unknown>): Promise<readonly string[]> {
    const root = await fixtureProject({
      'package.json': packageJsonText(manifest),
    });
    const normalized = await parsePackageJson(root);
    return detectFrameworks(normalized);
  }

  it('detects React and Vite from dependencies', async () => {
    expect(
      await frameworksFor(
        minimalPackageJson({ dependencies: { react: '^19.0.0', vite: '^7.0.0' } }),
      ),
    ).toEqual(['React', 'Vite']);
  });

  it('detects React and Next.js together', async () => {
    expect(
      await frameworksFor(
        minimalPackageJson({ dependencies: { next: '^15.0.0', react: '^19.0.0' } }),
      ),
    ).toEqual(['React', 'Next.js']);
  });

  it('classifies backend dependencies as Node.js', async () => {
    expect(
      await frameworksFor(
        minimalPackageJson({ dependencies: { express: '^5.0.0', react: '^19.0.0' } }),
      ),
    ).toEqual(['Node.js']);
  });

  it('classifies direct node usage in scripts as Node.js', async () => {
    expect(
      await frameworksFor(minimalPackageJson({ scripts: { start: 'node server.js' } })),
    ).toEqual(['Node.js']);
  });

  it('returns empty for unrecognized stacks', async () => {
    expect(await frameworksFor(minimalPackageJson())).toEqual([]);
  });
});
