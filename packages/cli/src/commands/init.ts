import chalk from 'chalk';
import { analyzeProjectDetailed, defaultConfig, writeConfig } from '@vibeguard/core';

import type { Io } from '../io.js';
import { formatProjectSummary, Glyphs } from '../ui/format.js';
import { createSpinner } from '../ui/spinner.js';

export interface InitArgs {
  /** Absolute project root (already resolved by the CLI wiring). */
  readonly root: string;
  /** Overwrite an existing `.vibeguardrc.json`. */
  readonly force: boolean;
  /** Machine-readable output instead of the human summary. */
  readonly json: boolean;
}

export interface InitResult {
  readonly writtenPath: string;
  readonly overwritten: boolean;
  readonly project: Awaited<ReturnType<typeof analyzeProjectDetailed>>['project'];
  readonly excludedSensitiveFiles: readonly string[];
}

/**
 * `vibeguard init`: analyze the project, then write `.vibeguardrc.json`.
 * - Analysis happens first — a failed analysis never leaves a config behind.
 * - The write is protected by `writeConfig`: an existing config is never
 *   overwritten without {@link InitArgs.force} (`CONFIG_EXISTS` otherwise).
 */
export async function runInit(io: Io, args: InitArgs): Promise<InitResult> {
  const spinner = createSpinner('Analyzing project…');
  try {
    const { project, excludedSensitiveFiles } = await analyzeProjectDetailed(args.root);
    const writtenPath = await writeConfig({
      root: args.root,
      config: defaultConfig(),
      force: args.force,
    });
    spinner.succeed('Analyzed project');

    if (args.json) {
      io.log(
        JSON.stringify(
          {
            ok: true,
            command: 'init',
            project,
            excludedSensitiveFiles,
            config: {
              path: writtenPath,
              overwritten: args.force,
            },
          },
          null,
          2,
        ),
      );
      return { writtenPath, overwritten: args.force, project, excludedSensitiveFiles };
    }

    io.log(`${Glyphs.success} VibeGuard initialized at ${chalk.cyan(args.root)}`);
    io.log(formatProjectSummary(project, excludedSensitiveFiles.length));
    io.log('');
    io.log(
      `${Glyphs.notice} Config written: ${writtenPath}` +
        (args.force ? ' (overwritten with --force)' : ''),
    );
    return { writtenPath, overwritten: args.force, project, excludedSensitiveFiles };
  } catch (error: unknown) {
    spinner.fail('Analyze failed');
    throw error;
  }
}
