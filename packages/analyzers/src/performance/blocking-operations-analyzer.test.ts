import { afterEach, describe, expect, it } from 'vitest';

import { createTestProject, minimalPackageJson, packageJsonText } from '@closed-door/testing';
import { BlockingOperationsAnalyzer } from './blocking-operations-analyzer.js';

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
    frameworks: ['Node.js'],
    packageManager: 'npm' as const,
    dependencies: [],
    scripts: { start: 'node server.js' },
    files: [],
    entryPoints: [],
    configFiles: [],
    ...overrides,
  };
}

describe('BlockingOperationsAnalyzer', () => {
  it('flags blocking fs.readFileSync', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
      'src/server.ts': "const data = fs.readFileSync('file.txt');\n",
    });
    const analyzer = new BlockingOperationsAnalyzer();
    const issues = await analyzer.analyze(
      projectInfo(root, {
        dependencies: [],
        files: ['package.json', 'src/server.ts'],
      }) as never,
    );

    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe('performance');
    expect(issues[0].severity).toBe('high');
    expect(issues[0].title).toBe('Blocking synchronous file read');
    expect(issues[0].source).toBe('blocking-operations');
    expect(issues[0].location.file).toBe('src/server.ts');
  });

  it('flags blocking fs.writeFileSync', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
      'src/server.ts': "fs.writeFileSync('file.txt', data);\n",
    });
    const analyzer = new BlockingOperationsAnalyzer();
    const issues = await analyzer.analyze(
      projectInfo(root, {
        dependencies: [],
        files: ['package.json', 'src/server.ts'],
      }) as never,
    );

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('high');
    expect(issues[0].title).toBe('Blocking synchronous file write');
  });

  it('flags blocking fs.existsSync', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
      'src/server.ts': "if (fs.existsSync('file.txt')) {}\n",
    });
    const analyzer = new BlockingOperationsAnalyzer();
    const issues = await analyzer.analyze(
      projectInfo(root, {
        dependencies: [],
        files: ['package.json', 'src/server.ts'],
      }) as never,
    );

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('medium');
    expect(issues[0].title).toBe('Blocking synchronous file existence check');
  });

  it('flags blocking fs.readdirSync', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
      'src/server.ts': "const files = fs.readdirSync('dir');\n",
    });
    const analyzer = new BlockingOperationsAnalyzer();
    const issues = await analyzer.analyze(
      projectInfo(root, {
        dependencies: [],
        files: ['package.json', 'src/server.ts'],
      }) as never,
    );

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('medium');
    expect(issues[0].title).toBe('Blocking synchronous directory read');
  });

  it('returns no issues for async-only code', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
      'src/server.ts': "await fs.promises.readFile('file.txt');\n",
    });
    const analyzer = new BlockingOperationsAnalyzer();
    const issues = await analyzer.analyze(
      projectInfo(root, {
        dependencies: [],
        files: ['package.json', 'src/server.ts'],
      }) as never,
    );

    expect(issues).toHaveLength(0);
  });

  it('is not applicable when project is not a Node.js backend', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson({ dependencies: { react: '^19.0.0' } })),
      'src/App.tsx': 'export const App = () => <div />;\n',
    });
    const analyzer = new BlockingOperationsAnalyzer();
    const applicability = analyzer.applicability(
      projectInfo(root, {
        frameworks: ['React'],
        scripts: {},
        files: ['package.json', 'src/App.tsx'],
      }) as never,
    );

    expect(applicability).toMatchObject({
      kind: 'not-applicable',
      reason: 'Project does not appear to be a Node.js backend.',
    });
  });
});
