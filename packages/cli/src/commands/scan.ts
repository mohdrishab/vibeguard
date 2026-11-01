import chalk from 'chalk';
import { analyzeProjectDetailed, defaultConfig, loadConfig } from '@vibeguard/core';

import type { Io } from '../io.js';
import { formatProjectSummary, Glyphs } from '../ui/format.js';
import { createSpinner } from '../ui/spinner.js';

export interface ScanArgs {
  /** Absolute project root (already resolved by the CLI wiring). */
  readonly root: string;
  /** Machine-readable output instead of the human summary. */
  readonly json: boolean;
}

export interface ScanResult {
  readonly project: Awaited<ReturnType<typeof analyzeProjectDetailed>>['project'];
  readonly excludedSensitiveFiles: readonly string[];
  /** User-configured excludes that were applied (empty by default). */
  readonly userExcludes: readonly string[];
}

/**
 * `vibeguard scan`: project intelligence plus file indexing today.
 *
 * Findings are always an empty array in this phase — the static-analysis
 * engines are introduced in Phase 2 of the roadmap. Scan never fabricates
 * results: no analyzer has produced an issue yet, and this is reported
 * verbatim rather than hidden.
 *
 * A `.vibeguardrc.json` (if present) is validated on the way in, so an
 * invalid config fails the scan with `INVALID_CONFIG` instead of being
 * silently ignored.
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
    spinner.succeed('Project scanned');

    if (args.json) {
      io.log(
        JSON.stringify(
          {
            ok: true,
            command: 'scan',
            project,
            userExcludes,
            excludedSensitiveFiles,
            findings: [],
            analyzersRun: [],
          },
          null,
          2,
        ),
      );
      return { project, excludedSensitiveFiles, userExcludes };
    }

    io.log(`${Glyphs.success} Scanned ${chalk.cyan(project.name)}`);
    io.log(formatProjectSummary(project, excludedSensitiveFiles.length));
    if (userExcludes.length > 0) {
      io.log('');
      io.log(`${Glyphs.notice} User excludes applied: ${userExcludes.join(', ')}`);
    }
    io.log('');
    io.log(
      `${Glyphs.notice} findings: 0 — static analyzers arrive in Phase 2 of ` +
        'the roadmap; scan currently reports project intelligence only.',
    );
    return { project, excludedSensitiveFiles, userExcludes };
  } catch (error: unknown) {
    spinner.fail('Scan failed');
    throw error;
  }
}
