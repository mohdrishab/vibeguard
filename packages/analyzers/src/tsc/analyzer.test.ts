import { analyzeProjectDetailed } from '@closed-door/core';
import type { ProjectInfo } from '@closed-door/core';
import { createTestProject } from '@closed-door/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { TsCompilerAnalyzer } from './analyzer.js';

const disposables: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(disposables.splice(0).map((dispose) => dispose()));
});

/**
 * Same real-ProjectInfo harness as the ESLint analyzer tests: analyzers
 * receive exactly what the CLI produces from a fresh scan.
 */
async function projectFixture(files: Readonly<Record<string, string>>): Promise<ProjectInfo> {
  const created = await createTestProject({
    'package.json': JSON.stringify({ name: 'ts-fixture', version: '1.0.0' }),
    ...files,
  });
  disposables.push(created.dispose);
  const { project } = await analyzeProjectDetailed(created.root, {});
  return project;
}

describe('TsCompilerAnalyzer', () => {
  it('reports a type error with compiler-verified evidence', async () => {
    const project = await projectFixture({
      'src/age.ts': 'export const age: number = "not-a-number";\n',
    });
    const analyzer = new TsCompilerAnalyzer();

    const issues = await analyzer.analyze(project);

    expect(issues).toHaveLength(1);
    const issue = issues[0];
    expect(issue?.source).toBe('tsc');
    expect(issue?.severity).toBe('high');
    expect(issue?.category).toBe('bug');
    expect(issue?.fixability).toBe('manual-only');
    expect(issue?.evidence[0]?.ruleId).toBe('TS2322');
    expect(issue?.evidence[0]?.snippet).toContain('export const age');
    expect(issue?.location.file).toBe('src/age.ts');
    expect(issue?.location.startLine).toBe(1);
    expect(issue?.description).toContain('compiler-verified');
  });

  it('reports nothing for clean TypeScript', async () => {
    const project = await projectFixture({
      'src/greet.ts': 'export function greet(name: string): string { return "Hi " + name; }\n',
    });

    expect(await new TsCompilerAnalyzer().analyze(project)).toEqual([]);
  });

  it('respects the project tsconfig strictness', async () => {
    const strictProject = await projectFixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { strict: true, target: 'ES2020' },
      }),
      'src/total.ts': 'export function total(a?: number, b?: number): number { return a + b; }\n',
    });

    const strictIssues = await new TsCompilerAnalyzer().analyze(strictProject);

    expect(strictIssues.length).toBe(2);
    expect(strictIssues.every((issue) => issue.severity === 'high')).toBe(true);
    expect(strictIssues.every((issue) => issue.evidence[0]?.ruleId === 'TS18048')).toBe(true);
    // Ambient diagnostics resolved from ancestor node_modules (@types
    // leakage) are out of scan scope and must never appear.
    expect(strictIssues.every((issue) => !issue.location.file.startsWith('..'))).toBe(true);

    const looseProject = await projectFixture({
      'src/total.ts': 'export function total(a?: number, b?: number): number { return a + b; }\n',
    });
    expect(await new TsCompilerAnalyzer().analyze(looseProject)).toEqual([]);
  });

  it('surfaces broken tsconfig as a configuration-level issue', async () => {
    const project = await projectFixture({
      'tsconfig.json': '{"compilerOptions":{"thisOptionDoesNotExist":true}}',
      'src/index.ts': 'export const one = 1;\n',
    });

    const issues = await new TsCompilerAnalyzer().analyze(project);
    const configIssue = issues.find((issue) => issue.location.file === 'tsconfig.json');

    expect(configIssue).toBeDefined();
    expect(configIssue?.description).toContain('Configuration-level');
  });

  it('maps applicability to TypeScript presence', async () => {
    const tsProject = await projectFixture({
      'src/index.ts': 'export const one = 1;\n',
    });
    const jsProject = await projectFixture({
      'src/index.js': 'export const one = 1;\n',
    });
    const analyzer = new TsCompilerAnalyzer();

    expect(analyzer.applicability(tsProject)).toEqual({ kind: 'applicable' });
    expect(analyzer.applicability(jsProject)).toEqual({
      kind: 'not-applicable',
      reason: 'No TypeScript sources to type-check.',
    });
    expect(await analyzer.analyze(jsProject)).toEqual([]);
  });

  it('never emits build output to disk', async () => {
    const project = await projectFixture({
      'src/age.ts': 'export const age: number = "not-a-number";\n',
    });

    await new TsCompilerAnalyzer().analyze(project);

    // The analyzer itself re-reads only what Phase-1 already indexed; the
    // program must not leave artifacts behind.
    const { readdir } = await import('node:fs/promises');
    const diskEntries = await readdir(project.root, { recursive: true });
    const artifacts = diskEntries.filter(
      (entry) =>
        entry.endsWith('.tsbuildinfo') ||
        (entry.endsWith('.js') && !entry.includes('src')) ||
        (entry.endsWith('.d.ts') && !entry.includes('src')),
    );
    expect(artifacts).toEqual([]);
  });
});
