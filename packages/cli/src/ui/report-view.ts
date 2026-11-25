import readline from 'node:readline';
import chalk from 'chalk';
import type { Severity } from '@closed-door/core';

import { createFrameRenderer, rule, type TerminalSurface } from './ansi.js';
import type { Io } from '../io.js';
import type { LiveReport } from './live-scan.js';
import {
  categoriesIn,
  DEFAULT_FILTER,
  filterFindings,
  formatFilterLine,
  formatIssueDetail,
  formatSplitView,
  formatSummary,
  type ReportFilter,
  type SortKey,
} from './report.js';

const SEVERITIES: readonly Severity[] = Object.freeze(['critical', 'high', 'medium', 'low']);
const SORTS: readonly SortKey[] = Object.freeze(['severity', 'location', 'title']);
const LIST_HEIGHT = 12;

function next<T>(items: readonly T[], current: T): T {
  const index = items.indexOf(current);
  return items[(index + 1) % items.length] as T;
}

export interface ReportViewHooks {
  /** Pause the surrounding readline interface while the report owns the keys. */
  readonly suspendInput?: () => void;
  readonly resumeInput?: () => void;
}

/** Static report for pipes/CI; keyboard-driven split pane on a TTY. */
export async function showReport(
  report: LiveReport,
  surface: TerminalSurface,
  io: Io,
  hooks: ReportViewHooks = {},
): Promise<void> {
  for (const line of formatSummary(report)) {
    io.log(`  ${line}`);
  }

  if (report.findings.length === 0) {
    io.log('');
    io.log(chalk.green('  No findings detected in the scanned files.'));
    return;
  }

  if (!surface.isTTY) {
    io.log('');
    for (const issue of report.findings) {
      io.log(formatIssueDetail(issue, 100).join('\n'));
      io.log('');
    }
    return;
  }

  const frame = createFrameRenderer(surface);
  const categories: readonly string[] = ['all', ...categoriesIn(report.findings)];
  let filter: ReportFilter = DEFAULT_FILTER;
  let visible = filterFindings(report.findings, filter);
  let selected = 0;
  let searching = false;
  let buffer = '';
  let finished = false;

  function render(): void {
    const lines = [
      rule(` DIAGNOSTIC REPORT · ${visible.length} of ${report.findings.length} `, surface.columns),
      ...formatSummary(report).map((line) => `  ${line}`),
      ...formatSplitView(visible, visible[selected], filter, surface.columns, LIST_HEIGHT),
      '',
      chalk.dim('  ↑/↓ select · 0-4 severity · c category · s sort · / search · q exit'),
      searching
        ? `  ${chalk.cyan('search')} ${buffer}▌`
        : `  ${formatFilterLine(filter, visible.length, report.findings.length)}`,
    ];
    frame.render(lines);
  }

  function refresh(): void {
    visible = filterFindings(report.findings, filter);
    selected = Math.max(0, Math.min(selected, visible.length - 1));
    render();
  }

  await new Promise<void>((resolve) => {
    const finish = (): void => {
      if (finished) {
        return;
      }
      finished = true;
      readline.emitKeypressEvents(process.stdin);
      process.stdin.removeListener('keypress', onKey);
      if (process.stdin.isRaw === true) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      frame.clear();
      hooks.resumeInput?.();
      resolve();
    };

    const onKey = (_value: string, key: readline.Key): void => {
      if (key.ctrl === true && key.name === 'c') {
        finish();
        return;
      }
      if (searching) {
        if (key.name === 'backspace') {
          buffer = buffer.slice(0, -1);
        } else if (key.name === 'escape') {
          searching = false;
          buffer = '';
        } else if (key.name === 'return') {
          filter = { ...filter, query: buffer };
          searching = false;
          buffer = '';
          selected = 0;
          refresh();
          return;
        } else if (_value.length === 1 && buffer.length < 40) {
          buffer += _value;
        }
        render();
        return;
      }

      switch (key.name) {
        case 'q':
        case 'escape':
          finish();
          return;
        case 'up':
        case 'k':
          selected = Math.max(0, selected - 1);
          break;
        case 'down':
        case 'j':
          selected = Math.min(visible.length - 1, selected + 1);
          break;
        case '0':
          filter = { ...filter, severity: 'all' };
          selected = 0;
          refresh();
          return;
        case '1':
        case '2':
        case '3':
        case '4': {
          const severity = SEVERITIES[Number(key.name) - 1];
          if (severity !== undefined) {
            filter = { ...filter, severity };
            selected = 0;
            refresh();
          }
          return;
        }
        case 'c': {
          const category = next(categories, filter.category);
          filter = { ...filter, category: category as ReportFilter['category'] };
          selected = 0;
          refresh();
          return;
        }
        case 's':
          filter = { ...filter, sort: next(SORTS, filter.sort) };
          refresh();
          return;
        case '/':
          searching = true;
          buffer = '';
          break;
        default:
          return;
      }
      render();
    };

    hooks.suspendInput?.();
    readline.emitKeypressEvents(process.stdin);
    process.stdin.on('keypress', onKey);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    render();
  });
}
