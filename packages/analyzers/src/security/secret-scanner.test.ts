import { afterEach, describe, expect, it } from 'vitest';

import { createTestProject, minimalPackageJson, packageJsonText } from '@vibeguard/testing';
import { SecretScanner } from './secret-scanner.js';

const disposables: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(disposables.splice(0).map((dispose) => dispose()));
});

async function fixtureProject(files: Record<string, string>): Promise<string> {
  const project = await createTestProject(files);
  disposables.push(project.dispose);
  return project.root;
}

describe('SecretScanner', () => {
  it('reports hardcoded AWS access key as critical', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
      'src/config.ts': "export const AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';\n",
    });
    const scanner = new SecretScanner();
    const issues = await scanner.analyze({
      root,
      name: 'test',
      languages: ['typescript'],
      frameworks: [],
      packageManager: 'npm',
      dependencies: [],
      scripts: {},
      files: ['package.json', 'src/config.ts'],
      entryPoints: [],
      configFiles: [],
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe('security');
    expect(issues[0].severity).toBe('critical');
    expect(issues[0].title).toBe('Hardcoded aws-access-key-id');
    expect(issues[0].location.file).toBe('src/config.ts');
    expect(issues[0].source).toBe('secret-scanner');
    expect(issues[0].status).toBe('open');
    // Evidence must never leak the secret value.
    expect(issues[0].evidence[0]?.snippet).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(issues[0].evidence[0]?.snippet).toContain('[REDACTED]');
  });

  it('reports hardcoded GitHub token as critical', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
      'src/auth.ts': "const token = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';\n",
    });
    const scanner = new SecretScanner();
    const issues = await scanner.analyze({
      root,
      name: 'test',
      languages: ['typescript'],
      frameworks: [],
      packageManager: 'npm',
      dependencies: [],
      scripts: {},
      files: ['package.json', 'src/auth.ts'],
      entryPoints: [],
      configFiles: [],
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('critical');
    expect(issues[0].title).toBe('Hardcoded github-token');
    expect(issues[0].evidence[0]?.snippet).not.toContain('ghp_');
    expect(issues[0].evidence[0]?.snippet).toContain('[REDACTED]');
  });

  it('reports hardcoded OpenAI API key as critical', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
      'src/ai.ts': "const key = 'sk-abc123def456ghi789jkl012mno345pqr678stu';\n",
    });
    const scanner = new SecretScanner();
    const issues = await scanner.analyze({
      root,
      name: 'test',
      languages: ['typescript'],
      frameworks: [],
      packageManager: 'npm',
      dependencies: [],
      scripts: {},
      files: ['package.json', 'src/ai.ts'],
      entryPoints: [],
      configFiles: [],
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('critical');
    expect(issues[0].title).toBe('Hardcoded openai-api-key');
    expect(issues[0].evidence[0]?.snippet).not.toContain('sk-');
  });

  it('reports generic API key assignment as high', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
      'src/config.ts': "export const API_KEY = 'a1b2c3d4e5f6g7h8i9j0';\n",
    });
    const scanner = new SecretScanner();
    const issues = await scanner.analyze({
      root,
      name: 'test',
      languages: ['typescript'],
      frameworks: [],
      packageManager: 'npm',
      dependencies: [],
      scripts: {},
      files: ['package.json', 'src/config.ts'],
      entryPoints: [],
      configFiles: [],
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('high');
    expect(issues[0].title).toBe('Hardcoded generic-api-key');
  });

  it('reports connection string with embedded credentials as critical', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
      'src/db.ts': "export const url = 'mongodb://user:pass@cluster.example.com/db';\n",
    });
    const scanner = new SecretScanner();
    const issues = await scanner.analyze({
      root,
      name: 'test',
      languages: ['typescript'],
      frameworks: [],
      packageManager: 'npm',
      dependencies: [],
      scripts: {},
      files: ['package.json', 'src/db.ts'],
      entryPoints: [],
      configFiles: [],
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('critical');
    expect(issues[0].title).toBe('Hardcoded connection-string-with-credentials');
    expect(issues[0].evidence[0]?.snippet).not.toContain('user:pass');
    expect(issues[0].evidence[0]?.snippet).toContain('[REDACTED]');
  });

  it('returns no issues for clean code without secrets', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
      'src/index.ts': "export const name = 'hello';\nexport function add(a: number, b: number) { return a + b; }\n",
    });
    const scanner = new SecretScanner();
    const issues = await scanner.analyze({
      root,
      name: 'test',
      languages: ['typescript'],
      frameworks: [],
      packageManager: 'npm',
      dependencies: [],
      scripts: {},
      files: ['package.json', 'src/index.ts'],
      entryPoints: [],
      configFiles: [],
    });

    expect(issues).toHaveLength(0);
  });

  it('is not applicable when there are no source files', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
    });
    const scanner = new SecretScanner();
    const applicability = scanner.applicability({
      root,
      name: 'test',
      languages: [],
      frameworks: [],
      packageManager: 'npm',
      dependencies: [],
      scripts: {},
      files: ['package.json'],
      entryPoints: [],
      configFiles: [],
    });

    expect(applicability.kind).toBe('not-applicable');
  });
});
