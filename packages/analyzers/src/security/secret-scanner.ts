import type { Issue, IssueCategory, ProjectInfo, Severity } from '@closed-door/core';

import type { Analyzer, AnalyzerContext } from '../analyzer.js';
import { buildIssue, lintableFiles, makeEvidence, readProjectSource } from '../issues.js';

const SECRET_ID = 'secret-scanner';
const SECRET_NAME = 'Secret Scanner';

export interface SecretPattern {
  readonly kind: string;
  readonly regex: RegExp;
  /** Index of the capture group holding the actual secret value (0 = full match). */
  readonly redactGroup: number;
  readonly severity: Severity;
  readonly category: IssueCategory;
  readonly recommendation: string;
}

const SECRET_PATTERNS: readonly SecretPattern[] = Object.freeze([
  {
    kind: 'aws-access-key-id',
    regex: /AKIA[0-9A-Z]{16}/g,
    redactGroup: 0,
    severity: 'critical',
    category: 'security',
    recommendation:
      'Rotate the exposed AWS access key immediately; never commit credentials to source control.',
  },
  {
    kind: 'github-token',
    regex: /ghp_[A-Za-z0-9]{36}/g,
    redactGroup: 0,
    severity: 'critical',
    category: 'security',
    recommendation:
      'Revoke the exposed GitHub personal access token; use a fine-grained token with scoped access.',
  },
  {
    kind: 'openai-api-key',
    regex: /sk-[A-Za-z0-9]{20,}/g,
    redactGroup: 0,
    severity: 'critical',
    category: 'security',
    recommendation:
      'Rotate the exposed OpenAI API key; store it in an environment variable or secrets manager.',
  },
  {
    kind: 'generic-api-key',
    regex: /(api[_-]?key|apikey)\s*[:=]\s*['"]?([A-Za-z0-9_-]{16,})['"]?/gi,
    redactGroup: 2,
    severity: 'high',
    category: 'security',
    recommendation:
      'Replace the hardcoded API key with a reference to an environment variable or secrets manager.',
  },
  {
    kind: 'generic-secret',
    regex: /(secret|private[_-]?key|access[_-]?token)\s*[:=]\s*['"]?([A-Za-z0-9_-]{16,})['"]?/gi,
    redactGroup: 2,
    severity: 'high',
    category: 'security',
    recommendation:
      'Replace the hardcoded secret with a reference to an environment variable or secrets manager.',
  },
  {
    kind: 'password-assignment',
    regex: /password\s*[:=]\s*['"]?([^'"\s]{8,})['"]?/gi,
    redactGroup: 1,
    severity: 'high',
    category: 'security',
    recommendation:
      'Remove the hardcoded password; read it from an environment variable at runtime.',
  },
  {
    kind: 'connection-string-with-credentials',
    regex: /(mongodb|postgres|mysql|redis)(\+srv)?:\/\/[^:]+:[^@]+@/gi,
    redactGroup: 0,
    severity: 'critical',
    category: 'security',
    recommendation:
      'Strip credentials from the connection string; use environment variables for username/password.',
  },
]);

function redactSecrets(line: string): string {
  let redacted = line;
  for (const pattern of SECRET_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(line)) !== null) {
      const value = match[pattern.redactGroup] ?? match[0] ?? '';
      if (value !== '') {
        redacted = redacted.split(value).join('[REDACTED]');
      }
    }
  }
  return redacted;
}

export class SecretScanner implements Analyzer {
  public readonly id = SECRET_ID;
  public readonly name = SECRET_NAME;

  public applicability(
    project: ProjectInfo,
  ): { kind: 'applicable' } | { kind: 'not-applicable'; reason: string } {
    if (lintableFiles(project.files).length === 0) {
      return {
        kind: 'not-applicable',
        reason: 'No JavaScript or TypeScript source files are in scope.',
      };
    }
    return { kind: 'applicable' };
  }

  public async analyze(project: ProjectInfo, context?: AnalyzerContext): Promise<readonly Issue[]> {
    const files = lintableFiles(project.files);
    const issues: Issue[] = [];

    for (const file of files) {
      const fileIssues = await this.scanFile(project, file, context);
      issues.push(...fileIssues);
    }

    return issues;
  }

  private async scanFile(
    project: ProjectInfo,
    file: string,
    context?: AnalyzerContext,
  ): Promise<Issue[]> {
    const content = await readProjectSource(project.root, file, context?.files);
    if (content === undefined) {
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
      const redactedLine = redactSecrets(line);

      for (const pattern of SECRET_PATTERNS) {
        let _match: RegExpExecArray | null;
        pattern.regex.lastIndex = 0;
        while ((_match = pattern.regex.exec(line)) !== null) {
          const snippet = redactedLine.trim().length > 0 ? redactedLine.trim() : undefined;

          issues.push(
            buildIssue({
              category: pattern.category,
              severity: pattern.severity,
              confidence: 'suspected',
              title: `Hardcoded ${pattern.kind}`,
              description:
                `A ${pattern.kind} pattern matched source code at ${file}:${startLine}. ` +
                'Verify the match; if it is a real credential, rotate it and remove it from source control.',
              file,
              startLine,
              endLine: startLine,
              recommendation: pattern.recommendation,
              fixability: 'manual-only',
              source: SECRET_ID,
              evidence: makeEvidence(pattern.kind, snippet, {
                kind: pattern.kind,
                matchedValue: '[REDACTED]',
              }),
            }),
          );
        }
      }
    }

    return issues;
  }
}
