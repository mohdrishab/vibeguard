import chalk from 'chalk';
import type { Issue } from '@closed-door/core';

import {
  createFrameRenderer,
  formatClock,
  reducedMotion,
  formatDuration,
  progressBar,
  rule,
  type TerminalSurface,
} from './ansi.js';
import type { LiveLog, ScanEventPayload, ScanStatus } from './live-scan.js';
import { SCAN_STAGES, type ScanStageId } from './stages.js';

const VISIBLE_LOGS = 6;
const VISIBLE_ISSUES = 3;

const STATUS_LABELS: Readonly<Record<ScanStatus, string>> = Object.freeze({
  running: 'SCANNING',
  cancelling: 'CANCELLING',
  completed: 'COMPLETED',
  failed: 'FAILED',
  cancelled: 'CANCELLED',
});

const SEVERITY_DECORATORS = Object.freeze({
  critical: chalk.red.bold,
  high: chalk.red,
  medium: chalk.yellow,
  low: chalk.dim,
});

interface LiveState {
  command: string;
  status: ScanStatus;
  stage: ScanStageId;
  progress: number;
  projectName: string;
  filesIndexed: number;
  filesTotal: number;
  enginesDone: number;
  enginesTotal: number;
  logs: readonly LiveLog[];
  issues: readonly Issue[];
  startedAt: number;
}

function truncate(value: string, width: number): string {
  if (width <= 1) {
    return '';
  }
  return [...value].length <= width ? value : `${[...value].slice(0, width - 1).join('')}…`;
}

function stageTrack(current: ScanStageId, finished: boolean): string {
  const currentIndex = SCAN_STAGES.findIndex((stage) => stage.id === current);
  return SCAN_STAGES.map((stage, index) => {
    const state =
      finished || index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'todo';
    const marker =
      state === 'done' ? chalk.green('●') : state === 'active' ? chalk.cyan('◉') : chalk.dim('○');
    return `${marker}${truncate(stage.id, 9)}`;
  }).join(chalk.dim(' '));
}

/** Renders the live scan in place on a TTY, or as plain lines when piped. */
export function createScanView(surface: TerminalSurface) {
  const frame = createFrameRenderer(surface);
  const quiet = reducedMotion();
  const state: LiveState = {
    command: '',
    status: 'running',
    stage: 'init',
    progress: 0,
    projectName: '',
    filesIndexed: 0,
    filesTotal: 0,
    enginesDone: 0,
    enginesTotal: 0,
    logs: [],
    issues: [],
    startedAt: Date.now(),
  };
  let scheduled = false;

  function lines(): string[] {
    const width = surface.columns;
    const stage = SCAN_STAGES.find((entry) => entry.id === state.stage);
    const percent = Math.max(0, Math.min(100, Math.round(state.progress)));
    const output: string[] = [
      rule(` ${STATUS_LABELS[state.status]} · ${truncate(state.command, 32)} `, width),
      `  ${chalk.bold('stage')}  ${truncate(stage?.label ?? state.stage, 30).padEnd(30)}  ${chalk.cyan(`${percent}%`)}`,
      `  ${progressBar(percent, Math.max(12, Math.min(28, width - 44)))}  ${chalk.dim(`${state.filesIndexed}/${state.filesTotal} files · ${state.enginesDone}/${state.enginesTotal} engines · ${formatDuration(Date.now() - state.startedAt)}`)}`,
      `  ${stageTrack(state.stage, state.status === 'completed' || state.status === 'cancelled' || state.status === 'failed')}`,
      rule(' LIVE OUTPUT ', width),
    ];

    const logs = state.logs.slice(-VISIBLE_LOGS);
    for (let index = 0; index < VISIBLE_LOGS; index += 1) {
      const log = logs[index];
      if (log === undefined) {
        output.push(`  ${chalk.dim('·')}`);
        continue;
      }
      const color =
        log.level === 'ERROR'
          ? chalk.red
          : log.level === 'WARN'
            ? chalk.yellow
            : log.level === 'PASS' || log.level === 'DONE'
              ? chalk.green
              : chalk.cyan;
      const message = truncate(log.message, Math.max(20, width - 28));
      output.push(
        `  ${chalk.dim(formatClock(log.timestamp))} ${color(`[${log.level}]`)} ${message}`,
      );
    }

    output.push(rule(` LIVE FINDINGS · ${state.issues.length} `, width));
    const issues = state.issues.slice(-VISIBLE_ISSUES);
    for (let index = 0; index < VISIBLE_ISSUES; index += 1) {
      const issue = issues[index];
      if (issue === undefined) {
        output.push(`  ${chalk.dim('·')}`);
        continue;
      }
      const decorate = SEVERITY_DECORATORS[issue.severity] ?? chalk.white;
      const location = `${issue.location.file}:${issue.location.startLine}`;
      output.push(
        `  ${decorate(issue.severity.toUpperCase().padEnd(8))} ${truncate(issue.title, Math.max(20, width - 42))} ${chalk.dim(truncate(location, 20))}`,
      );
    }
    return output;
  }

  function renderNow(): void {
    scheduled = false;
    frame.render(lines());
  }

  function scheduleRender(): void {
    if (!surface.isTTY || scheduled) {
      return;
    }
    scheduled = true;
    setImmediate(renderNow);
  }

  function onEvent(event: ScanEventPayload): void {
    switch (event.type) {
      case 'status':
        state.status = event.status;
        state.progress = event.progress;
        break;
      case 'plan':
        state.enginesTotal = event.analyzers.length;
        break;
      case 'stage':
        state.stage = event.stage;
        state.progress = event.progress;
        break;
      case 'log':
        state.logs = [...state.logs, event.log].slice(-200);
        state.progress = event.progress;
        if (!surface.isTTY) {
          surface.write(
            `${formatClock(event.log.timestamp)} [${event.log.level}] ${event.log.message}\n`,
          );
        }
        break;
      case 'file':
        state.filesIndexed = event.index;
        state.filesTotal = event.total;
        state.progress = event.progress;
        break;
      case 'analyzer':
        state.enginesDone += 1;
        state.progress = event.progress;
        break;
      case 'issue': {
        const index = state.issues.findIndex((issue) => issue.id === event.issue.id);
        state.issues =
          index === -1
            ? [...state.issues, event.issue]
            : state.issues.map((issue, position) => (position === index ? event.issue : issue));
        state.progress = event.progress;
        if (!surface.isTTY) {
          surface.write(
            `  + ${event.issue.title} — ${event.issue.location.file}:${event.issue.location.startLine}\n`,
          );
        }
        break;
      }
      case 'result':
        state.progress = 100;
        break;
      case 'error':
        if (!surface.isTTY) {
          surface.write(`[${event.error.code}] ${event.error.message}\n`);
        }
        break;
      default:
        break;
    }
    // With reduced motion, redraw only on meaningful state changes instead
    // of on every file/log tick.
    if (
      !quiet ||
      event.type === 'status' ||
      event.type === 'stage' ||
      event.type === 'analyzer' ||
      event.type === 'issue' ||
      event.type === 'result'
    ) {
      scheduleRender();
    }
  }

  return {
    onEvent,
    setCommand(command: string): void {
      state.command = command;
      state.startedAt = Date.now();
    },
    finish(): void {
      if (scheduled) {
        renderNow();
      }
      frame.clear();
    },
  };
}
