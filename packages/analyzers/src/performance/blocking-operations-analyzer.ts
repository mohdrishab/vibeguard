import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Issue, ProjectInfo, Severity } from '@closed-door/core';

import type { Analyzer } from '../analyzer.js';
import { buildIssue, lintableFiles, makeEvidence } from '../issues.js';

const BLOCKING_ID = 'blocking-operations';
const BLOCKING_NAME = 'Blocking Operations Analyzer';

interface BlockingPattern {
  readonly kind: string;
  readonly regex: RegExp;
  readonly severity: Severity;
  readonly title: string;
  readonly description: string;
  readonly recommendation: string;
  readonly fixability: Issue['fixability'];
}

const BLOCKING_PATTERNS: readonly BlockingPattern[] = Object.freeze([
  {
    kind: 'blocking-sync-fs-read',
    regex: /\bfs\.readFileSync\s*\(/g,
    severity: 'high',
    title: 'Blocking synchronous file read',
    description:
      'fs.readFileSync blocks the Node.js event loop until the file is fully read. ' +
      'In a server context, this blocks all concurrent requests and degrades throughput.',
    recommendation:
      'Use fs.readFile or fs.promises.readFile instead, and await the result to keep the event loop non-blocking.',
    fixability: 'manual-only',
  },
  {
    kind: 'blocking-sync-fs-write',
    regex: /\bfs\.writeFileSync\s*\(/g,
    severity: 'high',
    title: 'Blocking synchronous file write',
    description:
      'fs.writeFileSync blocks the Node.js event loop until the file is fully written. ' +
      'In a server context, this blocks all concurrent requests and degrades throughput.',
    recommendation:
      'Use fs.writeFile or fs.promises.writeFile instead, and await the result to keep the event loop non-blocking.',
    fixability: 'manual-only',
  },
  {
    kind: 'blocking-sync-fs-exists',
    regex: /\bfs\.existsSync\s*\(/g,
    severity: 'medium',
    title: 'Blocking synchronous file existence check',
    description:
      'fs.existsSync blocks the event loop. While fast for a single call, repeated use in hot paths degrades server throughput.',
    recommendation:
      'Use fs.promises.access or attempt the operation directly and handle the error instead of pre-checking with existsSync.',
    fixability: 'manual-only',
  },
  {
    kind: 'blocking-sync-fs-readdir',
    regex: /\bfs\.readdirSync\s*\(/g,
    severity: 'medium',
    title: 'Blocking synchronous directory read',
    description:
      'fs.readdirSync blocks the event loop while reading a directory. ' +
      'Large directories can cause noticeable event-loop latency.',
    recommendation: 'Use fs.readdir or fs.promises.readdir instead, and await the result.',
    fixability: 'manual-only',
  },
  {
    kind: 'expensive-loop-in-request-handler',
    regex: /\b(for|while)\s*\([^)]*\)\s*\{[^}]*\.json\(|res\.json\(|send\(/g,
    severity: 'medium',
    title: 'Potentially expensive loop in request handler',
    description:
      'A loop appears to iterate over data inside a request handler that sends a JSON response. ' +
      'Unbounded iteration in a request path can cause slow API operations and timeout under load.',
    recommendation:
      'Bound the loop (pagination, limit), move heavy computation out of the request path, or stream the response.',
    fixability: 'manual-only',
  },
  {
    kind: 'synchronous-crypto',
    regex: /\bcrypto\.(createHash|createHmac|randomBytes|randomFillSync)\s*\(/g,
    severity: 'medium',
    title: 'Synchronous cryptographic operation',
    description:
      'Synchronous crypto operations block the event loop while computing. ' +
      'For large inputs, this can cause significant request latency.',
    recommendation:
      'Use the asynchronous variants (crypto.createHash().update().digest(), crypto.randomBytes with callback) for large inputs, or offload to a worker thread.',
    fixability: 'manual-only',
  },
]);

export class BlockingOperationsAnalyzer implements Analyzer {
  public readonly id = BLOCKING_ID;
  public readonly name = BLOCKING_NAME;

  public applicability(
    project: ProjectInfo,
  ): { kind: 'applicable' } | { kind: 'not-applicable'; reason: string } {
    const usesNode =
      project.frameworks.includes('Node.js') ||
      Object.values(project.scripts).some((cmd) => /\bnode\b/u.test(cmd));
    if (!usesNode) {
      return {
        kind: 'not-applicable',
        reason: 'Project does not appear to be a Node.js backend.',
      };
    }
    return { kind: 'applicable' };
  }

  public async analyze(project: ProjectInfo): Promise<readonly Issue[]> {
    const files = lintableFiles(project.files);
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

      for (const pattern of BLOCKING_PATTERNS) {
        pattern.regex.lastIndex = 0;
        while (pattern.regex.exec(line) !== null) {
          issues.push(
            buildIssue({
              category: 'performance',
              severity: pattern.severity,
              confidence: 'suspected',
              title: pattern.title,
              description: pattern.description,
              file,
              startLine,
              endLine: startLine,
              recommendation: pattern.recommendation,
              fixability: pattern.fixability,
              source: BLOCKING_ID,
              evidence: makeEvidence(pattern.kind, line.trim(), { kind: pattern.kind }),
            }),
          );
        }
      }
    }

    return issues;
  }
}
