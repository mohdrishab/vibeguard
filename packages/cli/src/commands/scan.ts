import chalk from 'chalk';
import { createDefaultRegistry, sortIssues } from '@vibeguard/analyzers';
import { analyzeProjectDetailed, defaultConfig, loadConfig } from '@vibeguard/core';
import type { Issue } from '@vibeguard/core';

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
}

/**
 * Per-engine analysis summary for a scan: which engines actually ran and
 * how many findings each produced. Inapplicable engines surface the
 * concrete skip reason instead of a misleading zero.
 */
export interface AnalyzerRunSummary {
  readonly id: string;
  readonly name: string;
  readonly applicable: boolean;
  readonly inapplicableReason?: string;
  readonly issues: number;
}

export interface ScanResult {
  readonly project: Awaited<ReturnType<typeof analyzeProjectDetailed>>['project'];
  readonly excludedSensitiveFiles: readonly string[];
  /** User-configured excludes that were applied (empty by default). */
  readonly userExcludes: readonly string[];
  readonly analyzersRun: readonly AnalyzerRunSummary[];
  readonly findings: readonly Issue[];
}

/** Human output lists at most this many findings; the rest live in reports. */
const MAX_LISTED_FINDINGS = 10;

/**
 * `vibeguard scan`: project intelligence, file indexing, and the bundled
 * deterministic engines (ESLint recommended set + the TypeScript compiler).
 *
 * Findings are exactly what the engines report — scan never fabricates or
 * suppresses results. A `.vibeguardrc.json` (if present) is validated on
 * the way in, so an invalid config fails the scan with `INVALID_CONFIG`
 * instead of being silently ignored.
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

    const registry = createDefaultRegistry();
    const runs = await registry.runAllDetailed(project);
    const findings = sortIssues(runs.flatMap((run) => [...run.issues]));
    const analyzersRun: readonly AnalyzerRunSummary[] = runs.map((run) => ({
      id: run.id,
      name: run.name,
      applicable: run.applicable,
      ...(run.inapplicableReason === '' ? {} : { inapplicableReason: run.inapplicableReason }),
      issues: run.issues.length,
    }));

    spinner.succeed(
      `Project scanned — ${findings.length} finding${findings.length === 1 ? '' : 's'}`,
    );

    if (args.json) {
      io.log(
        JSON.stringify(
          {
            ok: true,
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
      return { project, excludedSensitiveFiles, userExcludes, analyzersRun, findings };
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
      if (run.applicable) {
        io.log(
          `  ${Glyphs.success} ${run.name} — ${run.issues} finding${run.issues === 1 ? '' : 's'}`,
        );
      } else {
        io.log(`  ${chalk.dim(`— ${run.name} — not applicable: ${run.inapplicableReason ?? ''}`)}`);
      }
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

    return { project, excludedSensitiveFiles, userExcludes, analyzersRun, findings };
  } catch (error: unknown) {
    spinner.fail('Scan failed');
    throw error;
  }
}
