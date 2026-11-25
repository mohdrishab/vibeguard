import { describe, expect, it } from 'vitest';

import {
  createFrameRenderer,
  formatClock,
  formatDuration,
  progressBar,
  type TerminalSurface,
} from './ansi.js';

function surface(isTTY: boolean): { view: TerminalSurface; writes: string[] } {
  const writes: string[] = [];
  return {
    view: { isTTY, columns: 80, write: (text: string) => writes.push(text) },
    writes,
  };
}

describe('terminal helpers', () => {
  it('rewrites frames in place on a TTY', () => {
    const { view, writes } = surface(true);
    const frame = createFrameRenderer(view);
    frame.render(['one', 'two', 'three']);
    frame.render(['ONE', 'TWO', 'THREE']);
    expect(writes[0]).not.toContain('\x1b[3A');
    expect(writes[1]).toContain('\x1b[3A');
    expect(writes[1]).toContain('ONE');
    frame.clear();
    expect(writes[2]).toContain('\x1b[3A');
  });

  it('stays silent for frames outside a TTY', () => {
    const { view, writes } = surface(false);
    const frame = createFrameRenderer(view);
    frame.render(['hidden']);
    frame.clear();
    expect(writes).toEqual([]);
  });

  it('renders progress width and completion state', () => {
    expect([...progressBar(50, 10)]).toHaveLength(10);
    expect(progressBar(100, 10)).toContain('█'.repeat(10));
    expect(progressBar(0, 10)).toContain('░'.repeat(10));
  });

  it('formats timestamps and durations deterministically', () => {
    expect(formatClock('not-a-date')).toBe('--:--:--');
    expect(formatDuration(950)).toBe('950 ms');
    expect(formatDuration(3_200)).toBe('3.2s');
    expect(formatDuration(Number.NaN)).toBe('—');
  });
});
