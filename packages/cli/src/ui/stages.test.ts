import { describe, expect, it } from 'vitest';

import {
  analyzerProgress,
  discoveryProgress,
  finalizingProgress,
  recommendationsProgress,
  SCAN_STAGES,
  stageForEngine,
} from './stages.js';

describe('scan stages and truthful progress', () => {
  it('lists only stages backed by real operations', () => {
    expect(SCAN_STAGES.map((stage) => stage.id)).toEqual([
      'init',
      'discovery',
      'analysis',
      'security',
      'quality',
      'recommendations',
      'finalizing',
    ]);
  });

  it('claims progress only as operations complete', () => {
    expect(discoveryProgress(0, 4)).toBe(5);
    expect(discoveryProgress(2, 4)).toBe(13);
    expect(discoveryProgress(4, 4)).toBe(20);
    expect(analyzerProgress(0, 4)).toBe(20);
    expect(analyzerProgress(2, 4)).toBe(54);
    expect(analyzerProgress(4, 4)).toBe(88);
    expect(recommendationsProgress()).toBe(94);
    expect(finalizingProgress()).toBe(100);
  });

  it('maps each bundled engine to a real stage', () => {
    expect(stageForEngine('eslint')).toBe('analysis');
    expect(stageForEngine('tsc')).toBe('analysis');
    expect(stageForEngine('secret-scanner')).toBe('security');
    expect(stageForEngine('dependency-audit')).toBe('security');
    expect(stageForEngine('bundle-analyzer')).toBe('quality');
    expect(stageForEngine('react-performance')).toBe('quality');
    expect(stageForEngine('blocking-operations')).toBe('quality');
  });
});
