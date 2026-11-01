import { Command } from 'commander';

import { VIBEGUARD_VERSION } from './version.js';

/**
 * Builds the root Commander program. Pure and side-effect free so it is
 * testable; `index.ts` performs the actual `parse` only when the CLI runs.
 *
 * Command wiring (init, scan, config, …) is implemented in later phases;
 * `--version` and `--help` are fully functional now.
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('vibeguard')
    .description(
      'AI-powered autonomous codebase auditing and repair CLI for JavaScript and TypeScript projects',
    )
    .version(VIBEGUARD_VERSION, '-V, --version', 'output the version number');

  return program;
}
