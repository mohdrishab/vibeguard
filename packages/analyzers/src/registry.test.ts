import type { Issue, ProjectInfo } from '@vibeguard/core';
import { describe, expect, it } from 'vitest';

import type { Analyzer } from './analyzer.js';
import { AnalyzerRegistry } from './registry.js';

const stubProject = { root: '/', name: 'stub' } as unknown as ProjectInfo;

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
    expect(() => registry.register(makeAnalyzer('eslint'))).toThrow('already registered');
  });

  it('rejects empty analyzer ids', () => {
    expect(() => new AnalyzerRegistry().register(makeAnalyzer('  '))).toThrow('non-empty string');
  });

  it('lists registered analyzers in registration order', () => {
    const registry = new AnalyzerRegistry();
    registry.register(makeAnalyzer('a'));
    registry.register(makeAnalyzer('b'));
    expect(registry.list().map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('runs all analyzers and collects their issues', async () => {
    const issue = { id: 'ISSUE-1' } as Issue;
    const registry = new AnalyzerRegistry();
    registry.register(makeAnalyzer('a', [issue]));
    registry.register(makeAnalyzer('b', []));
    await expect(registry.runAll(stubProject)).resolves.toEqual([issue]);
  });
});
