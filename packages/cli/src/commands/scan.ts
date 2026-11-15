import chalk from 'chalk';
import { createDefaultRegistry, deduplicateIssues, sortIssues } from '@closed-door/analyzers';
import type { AnalyzerRegistry } from '@closed-door/analyzers';
import { analyzeProjectDetailed, defaultConfig, loadConfig } from '@closed-door/core';
import type { Issue } from '@closed-door/core';

import type { Io } from '../io.js';
import {
  formatFindingLine,
  formatFindingsSummary,
  formatProjectSummary,
  Glyphs,
} from '../ui/format.js';
import { createSpinner } from '../ui/spinner.js';

export interface ScanArgs {
  /** Absolute project root (already resolved by the CLI wiring). */
  readonly root: string;
  /** Machine-readable output instead of the human summary. */
  readonly json: boolean;
  /** Optional registry injection for embedding and deterministic tests. */
  readonly registry?: AnalyzerRegistry;
}

/** Per-engine summary including failed and intentionally skipped checks. */
export interface AnalyzerRunSummary {
  readonly id: string;
  readonly name: string;
  readonly applicable: boolean;
  readonly status: 'passed' | 'failed' | 'skipped';
  readonly inapplicableReason?: string;
  readonly error?: string;
  readonly issues: number;
}

export interface ScanResult {
  readonly project: Awaited<ReturnType<typeof analyzeProjectDetailed>>['project'];
  readonly excludedSensitiveFiles: readonly string[];
  /** User-configured excludes that were applied (empty by default). */
  readonly userExcludes: readonly string[];
  readonly analyzersRun: readonly AnalyzerRunSummary[];
  readonly findings: readonly Issue[];
  /** False when one or more applicable analyzers could not complete. */
  readonly ok: boolean;
}

/** Human output lists at most this many findings; the rest live in reports. */
const MAX_LISTED_FINDINGS = 10;

/**
 * Runs project intelligence and bundled deterministic and heuristic analyzers.
 * Exact duplicate findings are deduplicated; analyzer failures remain visible
 * and make `ok` false rather than being presented as an empty result.
 */
export async function runScan(io: Io, args: ScanArgs): Promise<ScanResult> {
  const resolved = await loadConfig(args.root);
  // No config file → defaults; user excludes stay empty.
  const userExcludes = resolved?.config.scan.exclude ?? defaultConfig().scan.exclude;

  const spinner = createSpinner('Scanning project…');
  try {
    const { project, excludedSensitiveFiles } = await analyzeProjectDetailed(args.root, {
      exclude: userExcludes,
    });

    const registry = args.registry ?? createDefaultRegistry();
    const runs = await registry.runAllDetailed(project);
    const findings = deduplicateIssues(sortIssues(runs.flatMap((run) => [...run.issues])));
    const analyzersRun: readonly AnalyzerRunSummary[] = runs.map((run) => ({
      id: run.id,
      name: run.name,
      applicable: run.applicable,
      status: run.status,
      ...(run.inapplicableReason === '' ? {} : { inapplicableReason: run.inapplicableReason }),
      ...(run.error === undefined ? {} : { error: run.error }),
      issues: run.issues.length,
    }));
    const ok = analyzersRun.every((run) => run.status !== 'failed');

    if (ok) {
      spinner.succeed(
        `Project scanned — ${findings.length} finding${findings.length === 1 ? '' : 's'}`,
      );
    } else {
      spinner.fail('Scan incomplete — one or more analyzers failed');
    }

    if (args.json) {
      io.log(
        JSON.stringify(
          {
            ok,
            command: 'scan',
            project,
            userExcludes,
            excludedSensitiveFiles,
            findings,
            analyzersRun,
          },
          null,
          2,
        ),
      );
      return { project, excludedSensitiveFiles, userExcludes, analyzersRun, findings, ok };
    }

    io.log(`${Glyphs.success} Scanned ${chalk.cyan(project.name)}`);
    io.log(formatProjectSummary(project, excludedSensitiveFiles.length));
    if (userExcludes.length > 0) {
      io.log('');
      io.log(`${Glyphs.notice} User excludes applied: ${userExcludes.join(', ')}`);
    }

    io.log('');
    io.log(formatFindingsSummary(findings));
    for (const run of analyzersRun) {
      if (run.status === 'failed') {
        io.error(`  ${Glyphs.failure} ${run.name} — failed: ${run.error ?? 'unknown error'}`);
      } else if (run.status === 'skipped') {
        io.log(`  ${chalk.dim(`— ${run.name} — not applicable: ${run.inapplicableReason ?? ''}`)}`);
      } else {
        io.log(
          `  ${Glyphs.success} ${run.name} — ${run.issues} finding${run.issues === 1 ? '' : 's'}`,
        );
      }
    }
    if (!ok) {
      io.error(`${Glyphs.failure} Scan incomplete: one or more analyzers failed.`);
    }

    if (findings.length > 0) {
      io.log('');
      for (const finding of findings.slice(0, MAX_LISTED_FINDINGS)) {
        io.log(`  ${formatFindingLine(finding)}`);
      }
      if (findings.length > MAX_LISTED_FINDINGS) {
        io.log(
          `  ${chalk.dim(`… ${findings.length - MAX_LISTED_FINDINGS} more — see the report phase output`)}`,
        );
      }
    }

    return { project, excludedSensitiveFiles, userExcludes, analyzersRun, findings, ok };
  } catch (error: unknown) {
    spinner.fail('Scan failed');
    throw error;
  }
}
