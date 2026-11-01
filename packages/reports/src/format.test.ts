import { describe, expect, it } from 'vitest';

import { reportFileName, reportMimeType } from './format.js';

describe('reportFileName', () => {
  it('returns canonical names per format', () => {
    expect(reportFileName('html')).toBe('vibeguard-report.html');
    expect(reportFileName('json')).toBe('vibeguard-report.json');
    expect(reportFileName('markdown')).toBe('vibeguard-report.md');
  });

  it('throws on unknown formats', () => {
    expect(() => reportFileName('pdf' as never)).toThrow(RangeError);
  });
});

describe('reportMimeType', () => {
  it('returns correct MIME types per format', () => {
    expect(reportMimeType('html')).toBe('text/html');
    expect(reportMimeType('json')).toBe('application/json');
    expect(reportMimeType('markdown')).toBe('text/markdown');
  });

  it('throws on unknown formats', () => {
    expect(() => reportMimeType('pdf' as never)).toThrow(RangeError);
  });
});
