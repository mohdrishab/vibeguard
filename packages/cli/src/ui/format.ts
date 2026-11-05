import chalk from 'chalk';
import type { Issue, ProjectInfo, Severity } from '@vibeguard/core';

/** Fixed label width keeps summary columns aligned. */
const LABEL_WIDTH = 14;

function projectLine(label: string, value: string): string {
  return `${chalk.dim(label.padEnd(LABEL_WIDTH))}${value}`;
}

function joinList(values: readonly string[]): string {
  return values.length === 0 ? chalk.dim('(none detected)') : values.join(', ');
}

/**
 * Shared project summary block for `init` and `scan` human output.
 * `sensitiveExcluded` is a count only — names are never printed here.
 */
export function formatProjectSummary(project: ProjectInfo, sensitiveExcluded: number): string {
  const filesValue =
    project.files.length === 0
      ? chalk.dim('(no files in scope)')
      : String(project.files.length) +
        (sensitiveExcluded > 0
          ? ` ${chalk.dim(`(+${sensitiveExcluded} sensitive excluded)`)}`
          : '');

  return [
    projectLine('project', chalk.bold(project.name)),
    projectLine('root', project.root),
    projectLine('languages', joinList(project.languages)),
    projectLine('frameworks', joinList(project.frameworks)),
    projectLine('package mgr', project.packageManager),
    projectLine('files', filesValue),
    projectLine('entry', joinList(project.entryPoints)),
    projectLine('config', joinList(project.configFiles)),
    projectLine('dependencies', String(project.dependencies.length)),
  ].join('\n');
}

/** The check/err glyphs used across command output. */
export const Glyphs = {
  success: chalk.green('✔'),
  failure: chalk.red('✖'),
  notice: chalk.blue('ℹ'),
} as const;

const SEVERITY_DECORATORS: Readonly<Record<Severity, (text: string) => string>> = Object.freeze({
  critical: chalk.red.bold,
  high: chalk.red,
  medium: chalk.yellow,
  low: chalk.dim,
});

/**
 * Severity totals for the human findings summary, red for critical/high,
 * yellow for medium, dimmed for low.
 */
export function countFindingsBySeverity(
  findings: readonly Issue[],
): Readonly<Record<Severity, number>> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const finding of findings) {
    counts[finding.severity] += 1;
  }
  return counts;
}

/** The breakdown line printed before individually listed findings. */
export function formatFindingsSummary(findings: readonly Issue[]): string {
  if (findings.length === 0) {
    return `findings: 0 — no issues found in the scanned files`;
  }
  const counts = countFindingsBySeverity(findings);
  const parts = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(
      ([severity, count]) =>
        `${(SEVERITY_DECORATORS[severity as Severity] ?? chalk.white)(severity)} ${count}`,
    );
  return `findings: ${chalk.bold(String(findings.length))} (${parts.join(', ')})`;
}

/** One finding line in the human output: severity, location, title, rule. */
export function formatFindingLine(finding: Issue): string {
  const decorate = SEVERITY_DECORATORS[finding.severity] ?? chalk.white;
  const ruleId = finding.evidence[0]?.ruleId;
  return [
    decorate(finding.severity),
    `${finding.location.file}:${finding.location.startLine}`,
    finding.title,
    chalk.dim(`(${ruleId ?? finding.source})`),
  ].join('  ');
}
