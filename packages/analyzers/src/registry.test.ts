import type { Issue, ProjectInfo } from '@closed-door/core';
import { describe, expect, it } from 'vitest';

import type { Analyzer } from './analyzer.js';
import { AnalyzerRegistry } from './registry.js';

const stubProject = {
  root: '/',
  name: 'stub',
  files: [],
  languages: [],
  frameworks: [],
} as unknown as ProjectInfo;

function makeAnalyzer(id: string, issues: readonly Issue[] = []): Analyzer {
  return {
    id,
    name: `Analyzer ${id}`,
    analyze: async () => issues,
  };
}

describe('AnalyzerRegistry', () => {
  it('registers and retrieves analyzers by id', () => {
    const registry = new AnalyzerRegistry();
    const analyzer = makeAnalyzer('eslint');
    registry.register(analyzer);
    expect(registry.get('eslint')).toBe(analyzer);
    expect(registry.size).toBe(1);
  });

  it('returns undefined for unknown ids', () => {
    expect(new AnalyzerRegistry().get('nope')).toBeUndefined();
  });

  it('rejects duplicate analyzer ids', () => {
    const registry = new AnalyzerRegistry();
    registry.register(makeAnalyzer('eslint'));
    expect(() => registry.register(makeAnalyzer('eslint'))).toThrow(/already registered/u);
  });

  it('rejects analyzers with empty ids', () => {
    const registry = new AnalyzerRegistry();
    expect(() => registry.register(makeAnalyzer('   '))).toThrow(/non-empty/u);
  });

  it('preserves registration order when listing', () => {
    const registry = new AnalyzerRegistry();
    registry.register(makeAnalyzer('second'));
    registry.register(makeAnalyzer('first'));
    expect(registry.list().map((analyzer) => analyzer.id)).toEqual(['second', 'first']);
  });

  describe('runAllDetailed', () => {
    it('treats analyzers without an applicability hook as applicable', async () => {
      const registry = new AnalyzerRegistry();
      const issueList = [1, 2, 3].map(() => ({}) as Issue);
      registry.register(makeAnalyzer('plain', issueList));

      const details = await registry.runAllDetailed(stubProject);

      expect(details).toEqual([
        {
          id: 'plain',
          name: 'Analyzer plain',
          applicable: true,
          status: 'passed',
          inapplicableReason: '',
          issues: issueList,
        },
      ]);
    });

    it('skips not-applicable analyzers without invoking analyze', async () => {
      let analyzeCalls = 0;
      const registry = new AnalyzerRegistry();
      registry.register({
        id: 'tsc',
        name: 'TypeScript Compiler',
        analyze: async () => {
          analyzeCalls += 1;
          return [];
        },
        applicability: () => ({
          kind: 'not-applicable',
          reason: 'No TypeScript sources to type-check.',
        }),
      });

      const details = await registry.runAllDetailed(stubProject);

      expect(analyzeCalls).toBe(0);
      expect(details).toEqual([
        {
          id: 'tsc',
          name: 'TypeScript Compiler',
          applicable: false,
          status: 'skipped',
          inapplicableReason: 'No TypeScript sources to type-check.',
          issues: [],
        },
      ]);
    });

    it('reports analyzer failures without disguising them as zero findings', async () => {
      const registry = new AnalyzerRegistry();
      registry.register({
        id: 'audit',
        name: 'Dependency Audit',
        analyze: async () => {
          throw new Error('registry unavailable');
        },
      });

      await expect(registry.runAllDetailed(stubProject)).resolves.toEqual([
        {
          id: 'audit',
          name: 'Dependency Audit',
          applicable: true,
          status: 'failed',
          inapplicableReason: '',
          error: 'registry unavailable',
          issues: [],
        },
      ]);
    });

    it('preserves registration order for applicable engines', async () => {
      const registry = new AnalyzerRegistry();
      registry.register(makeAnalyzer('eslint'));
      registry.register(makeAnalyzer('tsc'));

      const details = await registry.runAllDetailed(stubProject);

      expect(details.map((detail) => detail.id)).toEqual(['eslint', 'tsc']);
      expect(details.every((detail) => detail.applicable)).toBe(true);
    });
  });
});
