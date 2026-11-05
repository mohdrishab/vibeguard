import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { analyzeProjectDetailed } from '@vibeguard/core';
import type { ProjectInfo } from '@vibeguard/core';
import { createTestProject } from '@vibeguard/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { EslintAnalyzer } from './analyzer.js';

const disposables: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(disposables.splice(0).map((dispose) => dispose()));
});

/**
 * Creates a package-based fixture project and runs the real Phase-1
 * project analysis over it, so analyzers see the exact ProjectInfo the
 * CLI hands them. `package.json` is always present because Phase-1
 * detection requires it.
 */
async function projectFixture(files: Readonly<Record<string, string>>): Promise<ProjectInfo> {
  const created = await createTestProject({
    'package.json': JSON.stringify({ name: 'analyzer-fixture', version: '1.0.0' }),
    ...files,
  });
  disposables.push(created.dispose);
  const { project } = await analyzeProjectDetailed(created.root, {});
  return project;
}

describe('EslintAnalyzer', () => {
  it('reports an undefined identifier as a high-severity bug', async () => {
    const project = await projectFixture({
      'src/tax.js': 'export function total(price) { return price * unknownTaxRate; }\n',
    });
    const analyzer = new EslintAnalyzer();

    const issues = await analyzer.analyze(project);

    expect(issues).toHaveLength(1);
    const issue = issues[0];
    expect(issue?.source).toBe('eslint');
    expect(issue?.severity).toBe('high');
    expect(issue?.category).toBe('bug');
    expect(issue?.confidence).toBe('confirmed');
    expect(issue?.fixability).toBe('manual-only');
    expect(issue?.evidence[0]?.ruleId).toBe('no-undef');
    expect(issue?.evidence[0]?.snippet).toContain('unknownTaxRate');
    expect(issue?.location).toEqual(
      expect.objectContaining({ file: 'src/tax.js', startLine: 1, endLine: 1 }),
    );
    expect(issue?.recommendation).toContain('Declare, import, or correct');
    expect(issue?.id).toMatch(/^vg-[0-9a-f]{16}$/u);
  });

  it('produces stable ids across repeated runs of the same code', async () => {
    const project = await projectFixture({
      'src/tax.js': 'export function total(price) { return price * unknownTaxRate; }\n',
    });
    const analyzer = new EslintAnalyzer();

    const first = await analyzer.analyze(project);
    const second = await analyzer.analyze(project);

    expect(second.map((issue) => issue.id)).toEqual(first.map((issue) => issue.id));
  });

  it('reports nothing for clean standard code', async () => {
    const project = await projectFixture({
      'src/math.js':
        'export const add = (a, b) => a + b;\nexport const sum = add(1, 2);\nconsole.log(sum);\n',
    });

    expect(await new EslintAnalyzer().analyze(project)).toEqual([]);
  });

  it('labels fixable rules as auto-safe', async () => {
    const project = await projectFixture({
      'tools/build.js': 'export const pattern = /find   me/;\n',
    });

    const issues = await new EslintAnalyzer().analyze(project);

    expect(issues).toHaveLength(1);
    const issue = issues[0];
    expect(issue?.evidence[0]?.ruleId).toBe('no-regex-spaces');
    expect(issue?.fixability).toBe('auto-safe');
  });

  it('surfaces parse errors explicitly instead of hiding the file', async () => {
    const project = await projectFixture({
      'broken.js': 'const = ;\n',
    });

    const issues = await new EslintAnalyzer().analyze(project);
    const parseIssue = issues.find((issue) => issue.evidence[0]?.ruleId === 'parse-error');

    expect(parseIssue).toBeDefined();
    expect(parseIssue?.severity).toBe('high');
    expect(parseIssue?.category).toBe('bug');
    expect(parseIssue?.fixability).toBe('manual-only');
  });

  it('maps applicability to lintable file presence', async () => {
    const withSources = await projectFixture({
      'src/index.js': 'export const one = 1;\n',
    });
    const withoutSources = await projectFixture({});
    const analyzer = new EslintAnalyzer();

    expect(analyzer.applicability(withSources)).toEqual({ kind: 'applicable' });
    expect(analyzer.applicability(withoutSources)).toEqual({
      kind: 'not-applicable',
      reason: 'No JavaScript or TypeScript source files are in scope.',
    });
    expect(await analyzer.analyze(withoutSources)).toEqual([]);
  });

  it('never emits anything outside the scanned project', async () => {
    const project = await projectFixture({
      'src/bug.js': 'export const broken = missingVariable;\n',
    });

    const issues = await new EslintAnalyzer().analyze(project);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    for (const issue of issues) {
      expect(issue.location.file).not.toMatch(/node_modules/u);
      expect(path.isAbsolute(issue.location.file)).toBe(false);
    }

    // Program side-effect guarantee: exhaustive noEmit means no build
    // residue next to the sources.
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
