import type { Issue } from '@closed-door/core';
import { describe, expect, it } from 'vitest';

import type { LiveReport } from './live-scan.js';
import {
  categoriesIn,
  DEFAULT_FILTER,
  filterFindings,
  formatIssueDetail,
  formatSplitView,
  formatSummary,
  wrapText,
} from './report.js';

function issue(
  id: string,
  severity: Issue['severity'],
  file: string,
  category: Issue['category'],
): Issue {
  return {
    id,
    category,
    severity,
    confidence: 'confirmed',
    title: `Issue ${id}`,
    description: 'Description with enough words to wrap across several terminal lines when narrow.',
    location: { file, startLine: 4, endLine: 4 },
    evidence: [{ ruleId: 'rule-1', snippet: 'const value = 1;' }],
    recommendation: 'Use the documented fix to resolve this finding.',
    fixability: 'manual-only',
    status: 'open',
    source: 'eslint',
  };
}

const findings = [
  issue('low', 'low', 'src/z.ts', 'code-quality'),
  issue('crit', 'critical', 'src/a.ts', 'security'),
  issue('high', 'high', 'src/b.ts', 'bug'),
];

function report(): LiveReport {
  return {
    command: 'scan .',
    root: '/project',
    projectName: 'fixture',
    status: 'completed',
    ok: true,
    jsonOutput: false,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 3200,
    filesAnalyzed: 12,
    excludedSensitiveFiles: [],
    userExcludes: [],
    findings,
    bySeverity: { critical: 1, high: 1, medium: 0, low: 1 },
    engines: [],
  };
}

describe('diagnostic report formatting', () => {
  it('sorts by severity by default and filters by severity, category and query', () => {
    expect(filterFindings(findings, DEFAULT_FILTER).map((entry) => entry.id)).toEqual([
      'crit',
      'high',
      'low',
    ]);
    expect(
      filterFindings(findings, { ...DEFAULT_FILTER, severity: 'high' }).map((entry) => entry.id),
    ).toEqual(['high']);
    expect(
      filterFindings(findings, { ...DEFAULT_FILTER, category: 'security' }).map(
        (entry) => entry.id,
      ),
    ).toEqual(['crit']);
    expect(
      filterFindings(findings, { ...DEFAULT_FILTER, query: 'src/b.ts' }).map((entry) => entry.id),
    ).toEqual(['high']);
    expect(
      filterFindings(findings, { ...DEFAULT_FILTER, sort: 'location' }).map((entry) => entry.id),
    ).toEqual(['crit', 'high', 'low']);
  });

  it('exposes all categories present in the report', () => {
    expect(categoriesIn(findings)).toEqual(['bug', 'code-quality', 'security']);
  });

  it('prints an honest summary with severity counts and engine health', () => {
    const summary = formatSummary(report()).join('\n');
    expect(summary).toContain('fixture');
    expect(summary).toContain('3 total');
    expect(summary).toContain('critical 1');
    expect(summary).toContain('12 files analysed');
  });

  it('renders a two-pane view with the selected finding on the right', () => {
    const visible = filterFindings(findings, DEFAULT_FILTER);
    const rows = formatSplitView(visible, visible[0], DEFAULT_FILTER, 100, 12);
    expect(rows).toHaveLength(12);
    expect(rows[0]).toContain('Issue crit');
    expect(rows.join('\n')).toContain('Problem');
  });

  it('wraps long text without losing words', () => {
    const lines = wrapText('one two three four five', 9);
    expect(lines.join(' ')).toBe('one two three four five');
    expect(lines.every((line) => line.length <= 9)).toBe(true);
  });

  it('includes evidence, rule and recommendation in the detail pane', () => {
    const detail = formatIssueDetail(findings[0] as Issue, 80).join('\n');
    expect(detail).toContain('rule-1');
    expect(detail).toContain('const value = 1;');
    expect(detail).toContain('manual-only');
  });
});
