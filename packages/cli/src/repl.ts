import { stdin as defaultInput, stdout as defaultOutput } from 'node:process';
import readline from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import type { AnalyzerRegistry } from '@closed-door/analyzers';
import chalk from 'chalk';

import { resolveCommandRoot } from './commands/util.js';
import { describeError } from './commands/util.js';
import type { Io } from './io.js';
import { consoleIo } from './io.js';
import { processTerminal, type TerminalSurface } from './ui/ansi.js';
import { runLiveScan, type LiveReport } from './ui/live-scan.js';
import { showReport } from './ui/report-view.js';
import { formatSummary } from './ui/report.js';
import { createScanView } from './ui/scan-view.js';
import { REPL_HELP, parseReplCommand } from './repl/command.js';

export interface ReplOptions {
  readonly io?: Io;
  readonly surface?: TerminalSurface;
  readonly registry?: AnalyzerRegistry;
  readonly input?: Readable;
  readonly output?: Writable;
}

/**
 * Interactive console: command input, live scan, then a keyboard-driven
 * report — all inside the user's terminal. No server or browser is involved.
 */
export async function runRepl(options: ReplOptions = {}): Promise<void> {
  const io = options.io ?? consoleIo;
  const surface = options.surface ?? processTerminal();
  const rl = readline.createInterface({
    input: options.input ?? defaultInput,
    output: options.output ?? defaultOutput,
    terminal: surface.isTTY,
    historySize: 100,
  });

  let lastReport: LiveReport | undefined;
  let running = false;
  const history: string[] = [];

  io.log('');
  io.log(chalk.bold('VibeGuard') + chalk.dim(' · interactive diagnostics'));
  io.log(chalk.dim('Local · read-only · evidence-backed. Type help for commands.'));
  io.log('');

  const prompt = `${chalk.cyan('vibeguard')} ${chalk.dim('❯')} `;
  surface.write(prompt);

  try {
    // Async iteration handles both an interactive TTY and piped input lines.
    for await (const line of rl) {
      const command = parseReplCommand(line);
      if (command.kind === 'empty') {
        surface.write(prompt);
        continue;
      }
      history.push(command.raw);

      switch (command.kind) {
        case 'exit':
          return;
        case 'help':
          for (const helpLine of REPL_HELP) {
            io.log(`  ${helpLine}`);
          }
          break;
        case 'clear':
          surface.write('\x1b[2J\x1b[H');
          break;
        case 'history':
          for (const [index, entry] of history.entries()) {
            io.log(`  ${String(index + 1).padStart(3)}  ${entry}`);
          }
          break;
        case 'status':
          if (lastReport === undefined) {
            io.log(chalk.dim('  No scan has run in this session yet.'));
          } else {
            for (const summaryLine of formatSummary(lastReport)) {
              io.log(`  ${summaryLine}`);
            }
          }
          break;
        case 'error':
          io.error(`[COMMAND] ${command.message}`);
          break;
        case 'scan': {
          if (running) {
            io.error('[BUSY] A scan is already running. Wait or press Ctrl+C to cancel it.');
            break;
          }
          running = true;
          let progress = 0;
          const view = createScanView(surface);
          view.setCommand(command.raw);
          const controller = new AbortController();
          const onInterrupt = (): void => {
            controller.abort();
            view.onEvent({ type: 'status', status: 'cancelling', progress });
          };
          process.on('SIGINT', onInterrupt);
          try {
            const root = await resolveCommandRoot(command.dir);
            const report = await runLiveScan({
              command: command.raw,
              root,
              jsonOutput: command.json,
              registry: options.registry,
              signal: controller.signal,
              emit: (event) => {
                if ('progress' in event) {
                  progress = event.progress;
                }
                view.onEvent(event);
              },
            });
            lastReport = report;
            await showReport(report, surface, io, {
              suspendInput: () => rl.pause(),
              resumeInput: () => rl.resume(),
            });
          } catch (error: unknown) {
            io.error(describeError(error));
          } finally {
            process.off('SIGINT', onInterrupt);
            view.finish();
            running = false;
          }
          break;
        }
        default:
          break;
      }
      surface.write(prompt);
    }
  } finally {
    rl.close();
  }
}
