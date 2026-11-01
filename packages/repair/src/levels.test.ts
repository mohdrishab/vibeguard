import { describe, expect, it } from 'vitest';

import { defaultFixabilityFor, defaultSafetyLevelFor } from './levels.js';

describe('defaultSafetyLevelFor', () => {
  it('classifies security issues as dangerous', () => {
    expect(defaultSafetyLevelFor('security')).toBe('dangerous');
  });

  it('classifies code-quality issues as safe', () => {
    expect(defaultSafetyLevelFor('code-quality')).toBe('safe');
  });

  it('classifies bug, performance, and architecture as moderate', () => {
    for (const category of ['bug', 'performance', 'architecture'] as const) {
      expect(defaultSafetyLevelFor(category)).toBe('moderate');
    }
  });

  it('throws on unknown categories', () => {
    expect(() => defaultSafetyLevelFor('mystery' as never)).toThrow(RangeError);
  });
});

describe('defaultFixabilityFor', () => {
  it('maps safe to auto-safe', () => {
    expect(defaultFixabilityFor('safe')).toBe('auto-safe');
  });

  it('maps moderate to ai-suggested', () => {
    expect(defaultFixabilityFor('moderate')).toBe('ai-suggested');
  });

  it('maps dangerous to manual-only', () => {
    expect(defaultFixabilityFor('dangerous')).toBe('manual-only');
  });
});
