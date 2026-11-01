import { describe, expect, it } from 'vitest';

import { SEVERITY_RANK, compareSeverity } from './severity.js';

describe('compareSeverity', () => {
  it('ranks critical above high, medium, and low', () => {
    expect(compareSeverity('critical', 'high')).toBeLessThan(0);
    expect(compareSeverity('critical', 'medium')).toBeLessThan(0);
    expect(compareSeverity('critical', 'low')).toBeLessThan(0);
  });

  it('ranks high above medium and low', () => {
    expect(compareSeverity('high', 'medium')).toBeLessThan(0);
    expect(compareSeverity('high', 'low')).toBeLessThan(0);
  });

  it('ranks medium above low', () => {
    expect(compareSeverity('medium', 'low')).toBeLessThan(0);
  });

  it('returns zero for equal severities', () => {
    expect(compareSeverity('high', 'high')).toBe(0);
  });

  it('is antisymmetric across every pair', () => {
    const levels = ['critical', 'high', 'medium', 'low'] as const;
    for (const a of levels) {
      for (const b of levels) {
        // Avoid negating the result: compareSeverity returns +0 for equals
        // and `toBe`'s Object.is comparison distinguishes +0 from -0.
        expect(compareSeverity(a, b) === 0).toBe(compareSeverity(b, a) === 0);
        expect(compareSeverity(a, b) > 0).toBe(compareSeverity(b, a) < 0);
      }
    }
  });

  it('throws on invalid severity values', () => {
    expect(() => compareSeverity('fatal' as never, 'low')).toThrow(RangeError);
  });
});

describe('SEVERITY_RANK', () => {
  it('assigns strict ascending ranks from critical to low', () => {
    expect(SEVERITY_RANK.critical).toBe(0);
    expect(SEVERITY_RANK.high).toBe(1);
    expect(SEVERITY_RANK.medium).toBe(2);
    expect(SEVERITY_RANK.low).toBe(3);
  });

  it('is frozen against mutation', () => {
    expect(Object.isFrozen(SEVERITY_RANK)).toBe(true);
  });
});
