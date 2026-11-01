import { Command } from 'commander';

import { runConfig } from './commands/config.js';
import { runInit } from './commands/init.js';
import { runScan } from './commands/scan.js';
import { resolveCommandRoot, runAction } from './commands/util.js';
import { consoleIo } from './io.js';
import type { Io } from './io.js';
import { VIBEGUARD_VERSION } from './version.js';

export interface ProgramOptions {
  /** Output channel; defaults to the real console (injectable in tests). */
  readonly io?: Io;
}

interface DirectoryOptions {
  readonly json: boolean;
}

interface InitOptions extends DirectoryOptions {
  readonly force: boolean;
}

/**
 * Builds the root Commander program. Pure and side-effect free so it is
 * testable with an injected {@link Io}; `index.ts` performs the actual
 * `parseAsync` only when the CLI runs.
 */
export function createProgram(options: ProgramOptions = {}): Command {
  const io = options.io ?? consoleIo;

  const program = new Command();

  program
    .name('vibeguard')
    .description(
      'AI-powered autonomous codebase auditing and repair CLI for JavaScript and TypeScript projects',
    )
    .version(VIBEGUARD_VERSION, '-V, --version', 'output the version number');

  program
    .command('init [dir]')
    .description(
      'Detect the project stack, index files, and write .vibeguardrc.json (existing configs are never overwritten without --force)',
    )
    .option('--force', 'overwrite an existing .vibeguardrc.json', false)
    .option('--json', 'machine-readable JSON output', false)
    .action((dir: string | undefined, cmdOptions: InitOptions) =>
      runAction(io, async () => {
        const root = await resolveCommandRoot(dir);
        await runInit(io, {
          root,
          force: cmdOptions.force,
          json: cmdOptions.json,
        });
      }),
    );

  program
    .command('scan [dir]')
    .description(
      'Scan the project: detect stack, index files, and report current findings (static analyzers arrive in Phase 2)',
    )
    .option('--json', 'machine-readable JSON output', false)
    .action((dir: string | undefined, cmdOptions: DirectoryOptions) =>
      runAction(io, async () => {
        const root = await resolveCommandRoot(dir);
        await runScan(io, { root, json: cmdOptions.json });
      }),
    );

  program
    .command('config [dir]')
    .description('Show the resolved .vibeguardrc.json (or the applied defaults when none exists)')
    .option('--json', 'machine-readable JSON output', false)
    .action((dir: string | undefined, cmdOptions: DirectoryOptions) =>
      runAction(io, async () => {
        const root = await resolveCommandRoot(dir);
        await runConfig(io, { root, json: cmdOptions.json });
      }),
    );

  return program;
}
