import { afterEach, describe, expect, it } from 'vitest';

import { createTestProject, minimalPackageJson, packageJsonText } from '@vibeguard/testing';
import { ReactPerformanceAnalyzer } from './react-performance-analyzer.js';

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
    languages: ['typescript'],
    frameworks: ['React'],
    packageManager: 'npm' as const,
    dependencies: [],
    scripts: {},
    files: [],
    entryPoints: [],
    configFiles: [],
    ...overrides,
  };
}

describe('ReactPerformanceAnalyzer', () => {
  it('flags missing key in .map() list rendering', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(
        minimalPackageJson({ dependencies: { react: '^19.0.0' } }),
      ),
      'src/List.tsx': 'items.map(item => <div>{item}</div>)\n',
    });
    const analyzer = new ReactPerformanceAnalyzer();
    const issues = await analyzer.analyze(projectInfo(root, {
      dependencies: ['react'],
      files: ['package.json', 'src/List.tsx'],
    }) as never);

    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe('performance');
    expect(issues[0].severity).toBe('high');
    expect(issues[0].title).toBe('Missing key in rendered list');
    expect(issues[0].source).toBe('react-performance');
    expect(issues[0].location.file).toBe('src/List.tsx');
  });

  it('flags inline function prop in JSX', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(
        minimalPackageJson({ dependencies: { react: '^19.0.0' } }),
      ),
      'src/App.tsx': '<Button onClick={() => doSomething()} />\n',
    });
    const analyzer = new ReactPerformanceAnalyzer();
    const issues = await analyzer.analyze(projectInfo(root, {
      dependencies: ['react'],
      files: ['package.json', 'src/App.tsx'],
    }) as never);

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('medium');
    expect(issues[0].title).toBe('Inline function prop in JSX');
  });

  it('flags useEffect with empty dependency array', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(
        minimalPackageJson({ dependencies: { react: '^19.0.0' } }),
      ),
      'src/App.tsx': 'useEffect(() => { foo(); }, [])\n',
    });
    const analyzer = new ReactPerformanceAnalyzer();
    const issues = await analyzer.analyze(projectInfo(root, {
      dependencies: ['react'],
      files: ['package.json', 'src/App.tsx'],
    }) as never);

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('medium');
    expect(issues[0].title).toBe('useEffect with empty dependency array');
  });

  it('flags direct state mutation', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(
        minimalPackageJson({ dependencies: { react: '^19.0.0' } }),
      ),
      'src/App.tsx': 'state.count = 5;\n',
    });
    const analyzer = new ReactPerformanceAnalyzer();
    const issues = await analyzer.analyze(projectInfo(root, {
      dependencies: ['react'],
      files: ['package.json', 'src/App.tsx'],
    }) as never);

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('high');
    expect(issues[0].title).toBe('Direct state mutation');
  });

  it('returns no issues for clean React code', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(
        minimalPackageJson({ dependencies: { react: '^19.0.0' } }),
      ),
      'src/App.tsx': 'export const App = () => <div>hello</div>;\n',
    });
    const analyzer = new ReactPerformanceAnalyzer();
    const issues = await analyzer.analyze(projectInfo(root, {
      dependencies: ['react'],
      files: ['package.json', 'src/App.tsx'],
    }) as never);

    expect(issues).toHaveLength(0);
  });

  it('is not applicable when project does not use React', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
      'src/index.ts': 'export const x = 1;\n',
    });
    const analyzer = new ReactPerformanceAnalyzer();
    const applicability = analyzer.applicability(projectInfo(root, {
      frameworks: [],
      files: ['package.json', 'src/index.ts'],
    }) as never);

    expect(applicability).toMatchObject({
      kind: 'not-applicable',
      reason: 'Project does not use React.',
    });
  });
});
