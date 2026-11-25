import chalk from 'chalk';

/**
 * Minimal terminal surface abstraction. The real implementation writes to
 * stdout; tests inject a fake so frames can be asserted without a TTY.
 */
export interface TerminalSurface {
  readonly isTTY: boolean;
  readonly columns: number;
  readonly write: (text: string) => void;
}

export function processTerminal(output: NodeJS.WriteStream = process.stdout): TerminalSurface {
  return {
    isTTY: output.isTTY === true,
    columns: output.columns > 0 ? output.columns : 100,
    write: (text: string): void => {
      output.write(text);
    },
  };
}

/** Animated output can be disabled explicitly or by CI/NO_COLOR conventions. */
export function reducedMotion(): boolean {
  return (
    process.env['VIBEGUARD_REDUCED_MOTION'] === '1' ||
    process.env['PREFERS_REDUCED_MOTION'] === 'reduce' ||
    process.env['CI'] === 'true'
  );
}

export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '--:--:--';
  }
  return date.toLocaleTimeString([], { hour12: false });
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return '—';
  }
  if (ms < 1_000) {
    return `${ms} ms`;
  }
  const seconds = ms / 1_000;
  return seconds < 60
    ? `${seconds.toFixed(1)}s`
    : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export function progressBar(percent: number, width = 24): string {
  const bounded = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.round((bounded / 100) * width);
  const done = '█'.repeat(filled);
  const pending = '░'.repeat(width - filled);
  return bounded === 100 ? chalk.green(done) : `${chalk.cyan(done)}${chalk.dim(pending)}`;
}

/**
 * Rewrites a block of lines in place. Frame height is tracked so each update
 * returns to the first line before overwriting, avoiding a scrolling feed.
 */
export function createFrameRenderer(surface: TerminalSurface): {
  render: (lines: readonly string[]) => void;
  clear: () => void;
} {
  let height = 0;

  return {
    render(lines: readonly string[]): void {
      if (!surface.isTTY || lines.length === 0) {
        return;
      }
      const width = Math.max(24, surface.columns - 1);
      const rows = lines.map((line) => [...line].slice(0, width).join(''));
      let output = '';
      if (height > 0) {
        output += `\x1b[${height}A`;
      }
      for (const row of rows) {
        output += `\x1b[2K${row}\n`;
      }
      surface.write(output);
      height = rows.length;
    },
    clear(): void {
      if (!surface.isTTY || height === 0) {
        height = 0;
        return;
      }
      let output = `\x1b[${height}A`;
      for (let index = 0; index < height; index += 1) {
        output += '\x1b[2K\n';
      }
      output += `\x1b[${height}A`;
      surface.write(output);
      height = 0;
    },
  };
}

export function rule(title: string, width: number, character = '─'): string {
  const prefix = ` ${title} `;
  const rest = Math.max(0, Math.min(width, 100) - [...prefix].length);
  return `${chalk.bold(prefix)}${chalk.dim(character.repeat(rest))}`;
}
