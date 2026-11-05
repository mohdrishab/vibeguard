import { afterEach, describe, expect, it } from 'vitest';

import { createTestProject, minimalPackageJson, packageJsonText } from '@vibeguard/testing';
import { BundleAnalyzer } from './bundle-analyzer.js';

const disposables: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(disposables.splice(0).map((dispose) => dispose()));
});

async function fixtureProject(files: Record<string, string>): Promise<string> {
  const project = await createTestProject(files);
  disposables.push(project.dispose);
  return project.root;
}

function projectInfo(root: string, overrides: Record<string, unknown> = {}): unknown {
  return {
    root,
    name: 'test-project',
    languages: ['javascript'],
    frameworks: [],
    packageManager: 'npm' as const,
    dependencies: [],
    scripts: {},
    files: [],
    entryPoints: [],
    configFiles: [],
    ...overrides,
  };
}

describe('BundleAnalyzer', () => {
  it('flags lodash as a heavy dependency', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(
        minimalPackageJson({ dependencies: { lodash: '^4.17.0' } }),
      ),
      'src/index.js': 'import _ from "lodash";\n',
    });
    const analyzer = new BundleAnalyzer();
    const issues = await analyzer.analyze(projectInfo(root, {
      dependencies: ['lodash'],
      files: ['package.json', 'src/index.js'],
    }) as never);

    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe('performance');
    expect(issues[0].severity).toBe('medium');
    expect(issues[0].title).toBe('Heavy dependency: lodash');
    expect(issues[0].source).toBe('bundle-analyzer');
    expect(issues[0].status).toBe('open');
  });

  it('flags moment as a heavy dependency', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(
        minimalPackageJson({ dependencies: { moment: '^2.29.0' } }),
      ),
    });
    const analyzer = new BundleAnalyzer();
    const issues = await analyzer.analyze(projectInfo(root, {
      dependencies: ['moment'],
      files: ['package.json'],
    }) as never);

    expect(issues).toHaveLength(1);
    expect(issues[0].title).toBe('Heavy dependency: moment');
    expect(issues[0].severity).toBe('medium');
  });

  it('flags large binary asset imports', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
      'src/app.js': "import logo from './assets/logo.png';\n",
    });
    const analyzer = new BundleAnalyzer();
    const issues = await analyzer.analyze(projectInfo(root, {
      dependencies: [],
      files: ['package.json', 'src/app.js'],
    }) as never);

    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe('performance');
    expect(issues[0].severity).toBe('low');
    expect(issues[0].title).toContain('Large asset import');
    expect(issues[0].location.file).toBe('src/app.js');
  });

  it('returns no issues for a project without heavy dependencies or assets', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(
        minimalPackageJson({ dependencies: { react: '^19.0.0' } }),
      ),
      'src/index.js': 'export const x = 1;\n',
    });
    const analyzer = new BundleAnalyzer();
    const issues = await analyzer.analyze(projectInfo(root, {
      dependencies: ['react'],
      files: ['package.json', 'src/index.js'],
    }) as never);

    expect(issues).toHaveLength(0);
  });

  it('is not applicable when there are no dependencies', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
    });
    const analyzer = new BundleAnalyzer();
    const applicability = analyzer.applicability(projectInfo(root, {
      dependencies: [],
      files: ['package.json'],
    }) as never);

    expect(applicability).toMatchObject({
      kind: 'not-applicable',
      reason: 'No dependencies declared in package.json.',
    });
  });
});
