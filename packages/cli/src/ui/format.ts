import chalk from 'chalk';
import type { ProjectInfo } from '@vibeguard/core';

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
