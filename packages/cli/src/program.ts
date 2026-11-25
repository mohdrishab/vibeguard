import { Command } from 'commander';
import type { AnalyzerRegistry } from '@closed-door/analyzers';

import { runConfig } from './commands/config.js';
import { runInit } from './commands/init.js';
import { runScan } from './commands/scan.js';
import { resolveCommandRoot, runAction } from './commands/util.js';
import { consoleIo } from './io.js';
import { runRepl } from './repl.js';
import type { Io } from './io.js';
import { VIBEGUARD_VERSION } from './version.js';

export interface ProgramOptions {
  /** Output channel; defaults to the real console (injectable in tests). */
  readonly io?: Io;
  /** Optional analyzer registry for embedding and deterministic tests. */
  readonly registry?: AnalyzerRegistry;
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
    .description('Local-first JavaScript and TypeScript project scanner')
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
      'Scan the project with bundled lint, type, security, and heuristic performance analyzers',
    )
    .option('--json', 'machine-readable JSON output', false)
    .action((dir: string | undefined, cmdOptions: DirectoryOptions) =>
      runAction(io, async () => {
        const root = await resolveCommandRoot(dir);
        const result = await runScan(io, {
          root,
          json: cmdOptions.json,
          ...(options.registry === undefined ? {} : { registry: options.registry }),
        });
        if (!result.ok) {
          process.exitCode = 1;
        }
      }),
    );

  program
    .command('repl')
    .description('Interactive in-terminal scan console with live progress and a diagnostic report')
    .action(() =>
      runAction(io, async () => {
        await runRepl({
          io,
          ...(options.registry === undefined ? {} : { registry: options.registry }),
        });
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

  // With no subcommand, enter the console on a TTY; keep CI/pipe output stable.
  program.action(() =>
    runAction(io, async () => {
      if (process.stdin.isTTY === true) {
        await runRepl({
          io,
          ...(options.registry === undefined ? {} : { registry: options.registry }),
        });
      } else {
        program.outputHelp();
      }
    }),
  );

  return program;
}
