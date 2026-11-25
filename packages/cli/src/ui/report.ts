import chalk from 'chalk';
import type { Issue, IssueCategory, Severity } from '@closed-door/core';

import { formatDuration } from './ansi.js';
import type { LiveReport } from './live-scan.js';

export type SortKey = 'severity' | 'location' | 'title';

export interface ReportFilter {
  readonly severity: Severity | 'all';
  readonly category: IssueCategory | 'all';
  readonly query: string;
  readonly sort: SortKey;
}

export const DEFAULT_FILTER: ReportFilter = Object.freeze({
  severity: 'all',
  category: 'all',
  query: '',
  sort: 'severity',
});

const SEVERITY_RANK: Readonly<Record<Severity, number>> = Object.freeze({
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
});

const SEVERITY_DECORATORS = Object.freeze({
  critical: chalk.red.bold,
  high: chalk.red,
  medium: chalk.yellow,
  low: chalk.dim,
});

export function filterFindings(findings: readonly Issue[], filter: ReportFilter): readonly Issue[] {
  const query = filter.query.trim().toLowerCase();
  const matching = findings.filter((issue) => {
    if (filter.severity !== 'all' && issue.severity !== filter.severity) {
      return false;
    }
    if (filter.category !== 'all' && issue.category !== filter.category) {
      return false;
    }
    if (query === '') {
      return true;
    }
    return [issue.title, issue.location.file, issue.description]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });

  return [...matching].sort((a, b) => {
    if (filter.sort === 'location') {
      return (
        a.location.file.localeCompare(b.location.file) ||
        a.location.startLine - b.location.startLine
      );
    }
    if (filter.sort === 'title') {
      return a.title.localeCompare(b.title);
    }
    return (
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.location.file.localeCompare(b.location.file) ||
      a.location.startLine - b.location.startLine
    );
  });
}

export function categoriesIn(findings: readonly Issue[]): readonly IssueCategory[] {
  return [...new Set(findings.map((issue) => issue.category))].sort();
}

export function formatSummary(report: LiveReport): string[] {
  const counts = report.bySeverity;
  const status = report.ok ? chalk.green('OK') : chalk.red('INCOMPLETE');
  return [
    `${chalk.bold('report')}  ${chalk.cyan(report.projectName)}  ${formatDuration(report.durationMs)}  ${status}`,
    `${chalk.bold('scope')}   ${report.filesAnalyzed} files analysed · ${report.excludedSensitiveFiles.length} sensitive files skipped`,
    `${chalk.bold('issues')} ${report.findings.length} total · critical ${counts.critical} · high ${counts.high} · medium ${counts.medium} · low ${counts.low}`,
    `${chalk.bold('engines')} ${report.engines.filter((engine) => engine.status === 'passed').length} passed · ${report.engines.filter((engine) => engine.status === 'skipped').length} skipped · ${report.engines.filter((engine) => engine.status === 'failed').length} failed`,
  ];
}

export function wrapText(text: string, width: number): string[] {
  if (width <= 0) {
    return [];
  }
  const words = text.trim().split(/\s+/u);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current === '') {
      current = word.slice(0, width);
    } else if (`${current} ${word}`.length <= width) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word.slice(0, width);
    }
  }
  if (current !== '') {
    lines.push(current);
  }
  return lines;
}

function truncate(value: string, width: number): string {
  if (width <= 1) {
    return '';
  }
  return value.length <= width ? value : `${value.slice(0, width - 1)}…`;
}

export function formatIssueRow(issue: Issue, width: number, selected: boolean): string {
  const decorate = SEVERITY_DECORATORS[issue.severity] ?? chalk.white;
  const marker = selected ? chalk.cyan('▸') : ' ';
  const severity = decorate(issue.severity.slice(0, 4).toUpperCase().padEnd(4));
  const location = `${issue.location.file}:${issue.location.startLine}`;
  return `${marker}${severity} ${truncate(issue.title, Math.max(8, width - 18))} ${chalk.dim(truncate(location, 9))}`;
}

export function formatIssueDetail(issue: Issue, width: number): string[] {
  const decorate = SEVERITY_DECORATORS[issue.severity] ?? chalk.white;
  const evidence = issue.evidence[0];
  const lines: string[] = [
    decorate(issue.title),
    `${chalk.dim('severity')}   ${decorate(issue.severity)}  ${chalk.dim('confidence')} ${issue.confidence}`,
    `${chalk.dim('location')}  ${issue.location.file}:${issue.location.startLine}${issue.location.endLine !== issue.location.startLine ? `–${issue.location.endLine}` : ''}`,
    `${chalk.dim('category')}  ${issue.category}  ${chalk.dim('engine')} ${issue.source}`,
    `${chalk.dim('rule')}     ${evidence?.ruleId ?? '—'}  ${chalk.dim('fix')} ${issue.fixability}`,
    '',
    chalk.bold('Problem'),
    ...wrapText(issue.description, width).map((line) => `  ${line}`),
    '',
    chalk.bold('Evidence'),
    ...(evidence?.snippet === undefined
      ? [`  ${chalk.dim('No source snippet captured')}`]
      : wrapText(evidence.snippet, width - 2).map((line) => `  ${chalk.cyan(line)}`)),
    '',
    chalk.bold('Recommended fix'),
    ...wrapText(issue.recommendation, width).map((line) => `  ${chalk.green(line)}`),
    '',
    `${chalk.dim('note')} VibeGuard classifies fixability but does not apply patches in this build.`,
  ];
  return lines;
}

/** Two-pane diagnostic layout: findings on the left, selected detail on right. */
export function formatSplitView(
  findings: readonly Issue[],
  selected: Issue | undefined,
  filter: ReportFilter,
  width: number,
  listHeight: number,
): string[] {
  const leftWidth = Math.max(24, Math.min(42, Math.floor(width * 0.4)));
  const rightWidth = Math.max(24, width - leftWidth - 3);
  const left: string[] = [];
  for (let index = 0; index < listHeight; index += 1) {
    const issue = findings[index];
    left.push(
      issue === undefined ? '' : formatIssueRow(issue, leftWidth - 1, issue.id === selected?.id),
    );
  }

  const right =
    selected === undefined
      ? [chalk.dim('No finding selected'), chalk.dim('Use ↑/↓ to move, / to search.')]
      : formatIssueDetail(selected, rightWidth - 1).slice(0, listHeight);

  const rows: string[] = [];
  for (let index = 0; index < listHeight; index += 1) {
    rows.push(`${left[index]?.padEnd(leftWidth) ?? ' '.repeat(leftWidth)} ${right[index] ?? ''}`);
  }
  return rows;
}

export function formatFilterLine(filter: ReportFilter, shown: number, total: number): string {
  const parts = [
    `severity=${filter.severity}`,
    `category=${filter.category}`,
    `sort=${filter.sort}`,
    filter.query === '' ? null : `query="${filter.query}"`,
  ].filter((part): part is string => part !== null);
  return chalk.dim(`${shown}/${total} findings · ${parts.join(' · ')}`);
}
