import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { isTypeScriptFile } from '@vibeguard/core';
import type { Issue, ProjectInfo, Severity } from '@vibeguard/core';

import type { Analyzer } from '../analyzer.js';
import { buildIssue, lintableFiles, makeEvidence } from '../issues.js';

const REACT_PERF_ID = 'react-performance';
const REACT_PERF_NAME = 'React Performance Analyzer';

interface ReactPattern {
  readonly kind: string;
  readonly regex: RegExp;
  readonly severity: Severity;
  readonly title: string;
  readonly description: string;
  readonly recommendation: string;
  readonly fixability: Issue['fixability'];
}

const REACT_PATTERNS: readonly ReactPattern[] = Object.freeze([
  {
    kind: 'missing-key-in-list',
    regex: /\.(?:map|forEach)\s*\([^)]*<[A-Za-z]/g,
    severity: 'high',
    title: 'Missing key in rendered list',
    description:
      'A .map() or .forEach() renders JSX elements without a stable key prop. ' +
      'Missing keys cause unnecessary re-renders and can lead to subtle bugs in list updates.',
    recommendation:
      'Add a unique, stable key prop to each element rendered inside the .map() callback. ' +
      'Use a database ID or other stable identifier, never the array index unless the list is static and never reordered.',
    fixability: 'manual-only',
  },
  {
    kind: 'inline-function-prop',
    regex: /<[A-Z]\w*\s+\w+=\s*\{\s*\(\s*\w*\s*\)\s*=>/g,
    severity: 'medium',
    title: 'Inline function prop in JSX',
    description:
      'An inline arrow function is passed as a prop to a React component. ' +
      'This creates a new function reference on every render, causing child components to re-render unnecessarily when they rely on referential equality.',
    recommendation:
      'Extract the handler to a module-level function or use useCallback to memoize it, then pass the stable reference as the prop.',
    fixability: 'auto-safe',
  },
  {
    kind: 'useeffect-missing-deps',
    regex: /useEffect\s*\(.*?,\s*\[\s*\]/g,
    severity: 'medium',
    title: 'useEffect with empty dependency array',
    description:
      'A useEffect with an empty dependency array runs only on mount and unmount. ' +
      'If the effect reads props or state, it will use stale values, which can cause subtle bugs and unnecessary re-renders.',
    recommendation:
      'Declare all reactive values used inside the effect in its dependency array, or use a ref if the value should not trigger re-runs.',
    fixability: 'manual-only',
  },
  {
    kind: 'state-mutation',
    regex: /\bstate\s*\.\s*[a-zA-Z]+\s*=/g,
    severity: 'high',
    title: 'Direct state mutation',
    description:
      'State is mutated directly instead of using a setter function. ' +
      'React cannot detect the change, so the component will not re-render, leading to stale UI and unpredictable behavior.',
    recommendation:
      'Use the state setter function (e.g. setState) or an immutable update pattern instead of mutating state directly.',
    fixability: 'manual-only',
  },
]);

export class ReactPerformanceAnalyzer implements Analyzer {
  public readonly id = REACT_PERF_ID;
  public readonly name = REACT_PERF_NAME;

  public applicability(
    project: ProjectInfo,
  ): { kind: 'applicable' } | { kind: 'not-applicable'; reason: string } {
    if (!project.frameworks.includes('React')) {
      return {
        kind: 'not-applicable',
        reason: 'Project does not use React.',
      };
    }
    if (!project.files.some((file) => isTypeScriptFile(file))) {
      return {
        kind: 'not-applicable',
        reason: 'No TypeScript sources to analyze for React patterns.',
      };
    }
    return { kind: 'applicable' };
  }

  public async analyze(project: ProjectInfo): Promise<readonly Issue[]> {
    const files = lintableFiles(project.files).filter((file) =>
      isTypeScriptFile(file),
    );
    const issues: Issue[] = [];

    for (const file of files) {
      const fileIssues = await this.scanFile(project, file);
      issues.push(...fileIssues);
    }

    return issues;
  }

  private async scanFile(project: ProjectInfo, file: string): Promise<Issue[]> {
    let content: string;
    try {
      content = await readFile(path.join(project.root, ...file.split('/')), 'utf8');
    } catch {
      return [];
    }

    const issues: Issue[] = [];
    const lines = content.split(/\r?\n/u);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      if (line === undefined) {
        continue;
      }
      const startLine = lineIndex + 1;

      for (const pattern of REACT_PATTERNS) {
        pattern.regex.lastIndex = 0;
        while (pattern.regex.exec(line) !== null) {
          issues.push(
            buildIssue({
              category: 'performance',
              severity: pattern.severity,
              title: pattern.title,
              description: pattern.description,
              file,
              startLine,
              endLine: startLine,
              recommendation: pattern.recommendation,
              fixability: pattern.fixability,
              source: REACT_PERF_ID,
              evidence: makeEvidence(
                pattern.kind,
                line.trim(),
                { kind: pattern.kind },
              ),
            }),
          );
        }
      }
    }

    return issues;
  }
}
