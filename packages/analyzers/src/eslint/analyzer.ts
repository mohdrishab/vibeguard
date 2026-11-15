import { ESLint } from 'eslint';
import type { Linter } from 'eslint';

import { isTypeScriptFile } from '@closed-door/core';
import type { Issue, IssueCategory, IssueEvidence, ProjectInfo, Severity } from '@closed-door/core';

import type { Analyzer } from '../analyzer.js';
import {
  buildIssue,
  captureSnippet,
  lintableFiles,
  makeEvidence,
  relativePosix,
} from '../issues.js';
import { buildOverrideConfig } from './config.js';
import { clampSeverityForLint, fixabilityFromMessage, ruleDocUrl, ruleMeta } from './mapping.js';

const ESLINT_ID = 'eslint';
const ESLINT_NAME = 'ESLint (bundled recommended)';

export class EslintAnalyzer implements Analyzer {
  public readonly id = ESLINT_ID;
  public readonly name = ESLINT_NAME;

  /**
   * The lint engine applies whenever the scan indexed at least one
   * JavaScript or TypeScript source file.
   */
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

  public async analyze(project: ProjectInfo): Promise<readonly Issue[]> {
    const files = lintableFiles(project.files);
    if (files.length === 0) {
      return [];
    }

    // overrideConfigFile: true — VibeGuard never loads (or depends on) the
    // scanned project's own eslint configuration; the bundled ruleset is
    // deterministic on projects that ship none at all.
    const eslint = new ESLint({
      cwd: project.root,
      overrideConfigFile: true,
      overrideConfig: buildOverrideConfig(project.files.some(isTypeScriptFile)),
    });

    const lintResults = await eslint.lintFiles([...files]);
    const issues: Issue[] = [];
    for (const result of lintResults) {
      if (result.messages.length === 0) {
        continue;
      }
      const file = relativePosix(project.root, result.filePath);
      for (const message of result.messages) {
        issues.push(await this.toIssue(project, file, message));
      }
    }
    return issues;
  }

  /**
   * Maps one ESLint `LintMessage` to the shared issue contract. Parse
   * errors (fatal without a rule) are surfaced explicitly instead of
   * dropping the file silently.
   */
  private async toIssue(
    project: ProjectInfo,
    file: string,
    message: Linter.LintMessage,
  ): Promise<Issue> {
    const fatal = message.fatal === true;
    const ruleId = message.ruleId ?? 'parse-error';
    const meta = fatal
      ? {
          severity: 'high' as Severity,
          category: 'bug' as IssueCategory,
          recommendation: 'Fix the syntax error so the file can be parsed and analysed.',
        }
      : ruleMeta(ruleId);

    const severity = clampSeverityForLint(meta.severity);
    const docUrl = fatal ? undefined : ruleDocUrl(ruleId);
    const snippet = await captureSnippet(project.root, file, message.line);

    const evidence: readonly IssueEvidence[] = makeEvidence(
      ruleId,
      snippet,
      docUrl === undefined
        ? { eslintSeverity: message.severity === 1 ? 'warning' : 'error' }
        : { docUrl, eslintSeverity: message.severity === 1 ? 'warning' : 'error' },
    );

    const lines = reportLines(message);

    return buildIssue({
      category: meta.category,
      severity,
      title: message.message,
      description: fatal
        ? `The bundled lint ruleset could not parse ${file}:${lines.start}. ` +
          "Everything in scope around this file is reported, but this file's own analysis stops at the first syntax error."
        : `The bundled ESLint ruleset flagged this line with rule "${ruleId}". ` +
          "The rule's own wording is used as the title; the rule documentation explains the checked invariant.",
      file,
      startLine: lines.start,
      endLine: lines.end,
      ...(message.column === undefined ? {} : { startColumn: message.column }),
      ...(message.endColumn === undefined ? {} : { endColumn: message.endColumn }),
      recommendation:
        meta.recommendation ??
        `Review the "${ruleId}" rule documentation (${docUrl ?? ruleDocUrl(ruleId)}) and fix every flagged occurrence.`,
      fixability: fatal ? 'manual-only' : fixabilityFromMessage(message.fix !== undefined),
      source: ESLINT_ID,
      evidence,
    });
  }
}

/** 1-based line/column windows from the ESLint message, with fallbacks. */
function reportLines(message: Linter.LintMessage): { start: number; end: number } {
  return { start: message.line, end: message.endLine ?? message.line };
}
