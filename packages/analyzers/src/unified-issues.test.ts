import { describe, expect, it } from 'vitest';

import { deduplicateIssues } from './unified-issues';

describe('deduplicateIssues', () => {
  it('keeps single issues unchanged', () => {
    const issues = [
      {
        id: 'vg-abc123',
        category: 'performance' as const,
        severity: 'high' as const,
        confidence: 'confirmed' as const,
        title: 'Test issue',
        description: 'A test issue description',
        location: {
          file: 'src/app.ts',
          startLine: 1,
          endLine: 1,
        },
        evidence: [{ ruleId: 'test-rule', snippet: 'some code', metadata: {} }],
        recommendation: 'Fix it',
        fixability: 'manual-only' as const,
        status: 'open' as const,
        source: 'test-analyzer',
      } as const,
    ];

    const result = deduplicateIssues(issues);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('vg-abc123');
  });

  it('merges two issues at the same location', () => {
    const issues = [
      {
        id: 'vg-abc123',
        category: 'performance' as const,
        severity: 'high' as const,
        confidence: 'confirmed' as const,
        title: 'Missing key in rendered list',
        description: 'A .map() renders JSX elements without a stable key prop.',
        location: {
          file: 'src/List.tsx',
          startLine: 5,
          endLine: 5,
        },
        evidence: [
          {
            ruleId: 'react-performance',
            snippet: 'items.map(item => <div>{item}</div>',
            metadata: { kind: 'missing-key-in-list' },
          },
        ],
        recommendation: 'Add a unique, stable key prop to each element',
        fixability: 'manual-only' as const,
        status: 'open' as const,
        source: 'react-performance',
      } as const,
      {
        id: 'vg-def456',
        category: 'performance' as const,
        severity: 'medium' as const,
        confidence: 'confirmed' as const,
        title: 'Missing key in rendered list',
        description: 'A .map() renders JSX elements without a stable key prop.',
        location: {
          file: 'src/List.tsx',
          startLine: 5,
          endLine: 5,
        },
        evidence: [
          {
            ruleId: 'react-performance',
            snippet: 'items.map(item => <div>{item}</div>',
            metadata: { kind: 'missing-key-in-list' },
          },
        ],
        recommendation: 'Add a unique, stable key prop to each element',
        fixability: 'manual-only' as const,
        status: 'open' as const,
        source: 'react-performance',
      } as const,
    ];

    const result = deduplicateIssues(issues);
    // Exact duplicate rule findings collapse to one stable issue.
    expect(result).toHaveLength(1);
    expect(result[0]?.severity).toBe('high');
    expect(result[0]?.title).toBe('Missing key in rendered list');
    expect(result[0]?.evidence).toHaveLength(1);
  });

  it('handles issues from different analyzers at same location with different titles', () => {
    const issues = [
      {
        id: 'vg-abc123',
        category: 'performance' as const,
        severity: 'high' as const,
        confidence: 'confirmed' as const,
        title: 'Blocking synchronous file read',
        description: 'fs.readFileSync blocks the event loop.',
        location: {
          file: 'src/server.ts',
          startLine: 10,
          endLine: 10,
        },
        evidence: [
          {
            ruleId: 'blocking-operations',
            snippet: 'fs.readFileSync(...)',
            metadata: { kind: 'blocking-sync-fs-read' },
          },
        ],
        recommendation: 'Use fs.readFile or fs.promises.readFile',
        fixability: 'manual-only' as const,
        status: 'open' as const,
        source: 'blocking-operations',
      } as const,
      {
        id: 'vg-def456',
        category: 'performance' as const,
        severity: 'medium' as const,
        confidence: 'confirmed' as const,
        title: 'Expensive loop in request handler',
        description: 'A loop iterates over data inside a request handler.',
        location: {
          file: 'src/server.ts',
          startLine: 10,
          endLine: 10,
        },
        evidence: [
          {
            ruleId: 'blocking-operations',
            snippet: 'for (...) { res.json(...) }',
            metadata: { kind: 'expensive-loop-in-request-handler' },
          },
        ],
        recommendation: 'Bound the loop or move heavy computation out',
        fixability: 'manual-only' as const,
        status: 'open' as const,
        source: 'blocking-operations',
      } as const,
    ];

    const result = deduplicateIssues(issues);
    // Different rules at the same location are distinct findings.
    expect(result).toHaveLength(2);
    expect(result.map((issue) => issue.title)).toEqual([
      'Blocking synchronous file read',
      'Expensive loop in request handler',
    ]);
  });

  it('deduplicates only findings with the same rule and location', () => {
    const issues = [
      {
        id: 'vg-first',
        category: 'performance' as const,
        severity: 'medium' as const,
        confidence: 'suspected' as const,
        title: 'Potential issue',
        description: 'First analyzer description',
        location: { file: 'src/app.ts', startLine: 5, endLine: 5 },
        evidence: [{ ruleId: 'same-rule', snippet: 'same code' }],
        recommendation: 'Review it',
        fixability: 'manual-only' as const,
        status: 'open' as const,
        source: 'first-analyzer',
      },
      {
        id: 'vg-second',
        category: 'performance' as const,
        severity: 'high' as const,
        confidence: 'confirmed' as const,
        title: 'Potential issue',
        description: 'Duplicate finding',
        location: { file: 'src/app.ts', startLine: 5, endLine: 5 },
        evidence: [{ ruleId: 'same-rule', snippet: 'same code' }],
        recommendation: 'Review it',
        fixability: 'manual-only' as const,
        status: 'open' as const,
        source: 'second-analyzer',
      },
    ];

    const result = deduplicateIssues(issues);

    expect(result).toHaveLength(1);
    expect(result[0]?.severity).toBe('high');
    expect(result[0]?.confidence).toBe('suspected');
    expect(result[0]?.evidence).toHaveLength(1);
    expect(result[0]?.source).toContain('first-analyzer');
    expect(result[0]?.source).toContain('second-analyzer');
  });

  it('handles issues at different locations kept separate', () => {
    const issues = [
      {
        id: 'vg-abc123',
        category: 'performance' as const,
        severity: 'high' as const,
        confidence: 'confirmed' as const,
        title: 'Issue at line 5',
        description: 'First issue',
        location: {
          file: 'src/app.ts',
          startLine: 5,
          endLine: 5,
        },
        evidence: [{ ruleId: 'test', snippet: 'code', metadata: {} }],
        recommendation: 'Fix',
        fixability: 'manual-only' as const,
        status: 'open' as const,
        source: 'analyzer1',
      } as const,
      {
        id: 'vg-def456',
        category: 'performance' as const,
        severity: 'medium' as const,
        confidence: 'confirmed' as const,
        title: 'Issue at line 10',
        description: 'Second issue',
        location: {
          file: 'src/app.ts',
          startLine: 10,
          endLine: 10,
        },
        evidence: [{ ruleId: 'test', snippet: 'code', metadata: {} }],
        recommendation: 'Fix',
        fixability: 'manual-only' as const,
        status: 'open' as const,
        source: 'analyzer2',
      } as const,
    ];

    const result = deduplicateIssues(issues);
    // Findings at different locations remain separate.
    expect(result).toHaveLength(2);
  });
});
