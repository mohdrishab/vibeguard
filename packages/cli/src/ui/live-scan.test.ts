import { AnalyzerRegistry, type Analyzer } from '@closed-door/analyzers';
import type { Issue, Severity } from '@closed-door/core';
import { createTestProject, minimalPackageJson, packageJsonText } from '@closed-door/testing';
import { describe, expect, it } from 'vitest';

import { runLiveScan, type ScanEventPayload } from './live-scan.js';

function makeIssue(id: string, severity: Severity): Issue {
  return {
    id,
    category: 'code-quality',
    severity,
    confidence: 'confirmed',
    title: `Finding ${id}`,
    description: 'Reported by the injected analyzer',
    location: { file: 'src/app.ts', startLine: 3, endLine: 3 },
    evidence: [{ ruleId: 'fake-rule', snippet: 'const value = 1;' }],
    recommendation: 'Apply the documented fix',
    fixability: 'manual-only',
    status: 'open',
    source: 'fake-analyzer',
  };
}

describe('runLiveScan', () => {
  it('emits only real completions and deduplicates engine findings', async () => {
    const project = await createTestProject({
      'package.json': packageJsonText(minimalPackageJson()),
      'src/app.ts': 'export const value = 1;\n',
    });
    try {
      const passing: Analyzer = {
        id: 'eslint',
        name: 'Fake ESLint',
        analyze: async () => [makeIssue('real-1', 'high')],
      };
      const duplicate: Analyzer = {
        id: 'tsc',
        name: 'Fake TypeScript',
        analyze: async () => [makeIssue('real-1', 'high')],
      };
      const skipped: Analyzer = {
        id: 'secret-scanner',
        name: 'Fake Secrets',
        applicability: () => ({ kind: 'not-applicable', reason: 'not configured' }),
        analyze: async () => {
          throw new Error('inapplicable analyzer must not run');
        },
      };
      const registry = new AnalyzerRegistry();
      registry.register(passing);
      registry.register(duplicate);
      registry.register(skipped);

      const events: ScanEventPayload[] = [];
      const report = await runLiveScan({
        command: 'scan .',
        root: project.root,
        jsonOutput: false,
        registry,
        emit: (event) => events.push(event),
      });

      expect(report.status).toBe('completed');
      expect(report.ok).toBe(true);
      expect(report.findings).toHaveLength(1);
      expect(report.bySeverity.high).toBe(1);
      expect(report.engines.map((engine) => engine.status)).toEqual([
        'passed',
        'passed',
        'skipped',
      ]);
      // The second engine reports the same finding; deduplication replaces
      // the live entry rather than adding a second finding to the report.
      expect(events.filter((event) => event.type === 'issue')).toHaveLength(2);
      expect(events.map((event) => event.type)).toEqual(
        expect.arrayContaining(['stage', 'plan', 'file', 'log', 'analyzer', 'issue', 'result']),
      );

      const progresses = events
        .map((event) => ('progress' in event ? event.progress : 0))
        .filter((value) => value > 0);
      expect(progresses).toEqual([...progresses].sort((a, b) => a - b));
      expect(events.at(-1)).toMatchObject({ type: 'status', status: 'completed', progress: 100 });
    } finally {
      await project.dispose();
    }
  });

  it('reports engine failures without claiming a clean scan', async () => {
    const project = await createTestProject({
      'package.json': packageJsonText(minimalPackageJson()),
    });
    try {
      const registry = new AnalyzerRegistry();
      registry.register({
        id: 'eslint',
        name: 'Failing engine',
        analyze: async () => {
          throw new Error('engine unavailable');
        },
      });
      const report = await runLiveScan({
        command: 'scan',
        root: project.root,
        jsonOutput: false,
        registry,
        emit: () => undefined,
      });

      expect(report.ok).toBe(false);
      expect(report.engines[0]?.status).toBe('failed');
      expect(report.error?.code).toBe('ANALYZER_FAILED');
      expect(report.findings).toHaveLength(0);
    } finally {
      await project.dispose();
    }
  });

  it('keeps cancellation honest', async () => {
    const project = await createTestProject({
      'package.json': packageJsonText(minimalPackageJson()),
    });
    try {
      const controller = new AbortController();
      const registry = new AnalyzerRegistry();
      registry.register({
        id: 'eslint',
        name: 'Never started',
        analyze: async () => [makeIssue('never', 'critical')],
      });
      const report = await runLiveScan({
        command: 'scan',
        root: project.root,
        jsonOutput: false,
        registry,
        signal: controller.signal,
        emit: (event) => {
          if (event.type === 'plan') {
            controller.abort();
          }
        },
      });

      expect(report.status).toBe('cancelled');
      expect(report.ok).toBe(false);
      expect(report.findings).toHaveLength(0);
      expect(report.engines[0]?.status).toBe('cancelled');
    } finally {
      await project.dispose();
    }
  });
});
