import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Issue, IssueEvidence, Severity } from '@closed-door/core';
import { compareSeverity, isLintableFile, toPosix } from '@closed-door/core';

import type { FileCache } from './file-cache.js';

/**
 * Deterministic content-derived issue identifiers for Phase 2. Stable
 * across scans of unchanged code; the unified issue engine (Phase 5) may
 * mint its own canonical scheme later, which is additive — never a
 * source-code-side secret scheme.
 */
export function mintIssueId(parts: readonly string[]): string {
  const digest = createHash('sha256').update(parts.join('\u001f'), 'utf8').digest('hex');
  return `vg-${digest.slice(0, 16)}`;
}

/**
 * Sorts findings by the shared severity order, then deterministically by
 * file, line, column and rule so identical scans always produce
 * identical ordering.
 */
export function sortIssues(issues: readonly Issue[]): readonly Issue[] {
  return [...issues].sort((a, b) => {
    const bySeverity = compareSeverity(a.severity, b.severity);
    if (bySeverity !== 0) {
      return bySeverity;
    }
    return (
      a.location.file.localeCompare(b.location.file) ||
      a.location.startLine - b.location.startLine ||
      a.location.endLine - b.location.endLine ||
      (a.location.startColumn ?? 0) - (b.location.startColumn ?? 0) ||
      a.evidence[0]?.ruleId.localeCompare(b.evidence[0]?.ruleId ?? '') ||
      0
    );
  });
}

/**
 * Reads a source file relative to the project root, honoring the per-scan
 * cache when one was supplied. Returns `undefined` for missing or
 * unreadable files; analyzer reads must never fail a scan.
 */
export async function readProjectSource(
  root: string,
  relativeFile: string,
  cache?: FileCache,
): Promise<string | undefined> {
  const absolute = path.join(root, ...relativeFile.split('/'));
  if (cache !== undefined) {
    return cache.readText(absolute);
  }
  try {
    return await readFile(absolute, 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * Source line for evidence, capped. Only file-index (non-sensitive) files
 * are read. When a shared cache is provided the file is read and split at
 * most once per scan, regardless of how many findings point at it.
 */
export async function captureSnippet(
  root: string,
  relativeFile: string,
  line: number,
  cache?: FileCache,
): Promise<string | undefined> {
  const absolute = path.join(root, ...relativeFile.split('/'));
  let lineText: string | undefined;

  if (cache !== undefined) {
    const lines = await cache.readLines(absolute);
    lineText = lines?.[line - 1];
  } else {
    const content = await readProjectSource(root, relativeFile);
    if (content === undefined) {
      return undefined;
    }
    lineText = content.split(/\r?\n/u)[line - 1];
  }

  const trimmed = (lineText ?? '').trim();
  if (trimmed === '') {
    return undefined;
  }
  return trimmed.length > 200 ? `${trimmed.slice(0, 197)}…` : trimmed;
}

export function makeEvidence(
  ruleId: string,
  snippet: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): readonly IssueEvidence[] {
  const evidence: IssueEvidence = {
    ruleId,
    ...(snippet !== undefined ? { snippet } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
  return [evidence];
}

/**
 * Converts a diagnostic/finding origin to POSIX-relative path against a
 * project root, normalizing OS separators and Windows drive casing.
 */
export function relativePosix(root: string, candidate: string): string {
  const rel = path.isAbsolute(candidate) ? path.relative(root, candidate) : candidate;
  return toPosix(rel);
}

/** Files this engine may apply to, in deterministic order, de-duplicated. */
export function lintableFiles(files: readonly string[]): readonly string[] {
  return [...new Set(files)].filter((entry) => isLintableFile(entry)).sort();
}

/**
 * Builds a complete, immutable {@link Issue} from engine findings with
 * all required contract fields; status always starts 'open' at capture.
 */
export interface IssueDraft {
  readonly category: Issue['category'];
  readonly severity: Severity;
  readonly confidence?: Issue['confidence'];
  readonly title: string;
  readonly description: string;
  readonly file: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly startColumn?: number;
  readonly endColumn?: number;
  readonly recommendation: string;
  readonly fixability: Issue['fixability'];
  readonly source: string;
  readonly evidence: readonly IssueEvidence[];
}

export function buildIssue(draft: IssueDraft): Issue {
  return Object.freeze({
    id: mintIssueId([
      draft.source,
      draft.evidence[0]?.ruleId ?? '',
      draft.file,
      String(draft.startLine),
      String(draft.startColumn ?? ''),
      draft.title,
    ]),
    category: draft.category,
    severity: draft.severity,
    // Heuristic engines opt into 'suspected'; deterministic engines default to confirmed.
    confidence: draft.confidence ?? 'confirmed',
    title: draft.title,
    description: draft.description,
    location: {
      file: draft.file,
      startLine: draft.startLine,
      endLine: draft.endLine,
      ...(draft.startColumn !== undefined ? { startColumn: draft.startColumn } : {}),
      ...(draft.endColumn !== undefined ? { endColumn: draft.endColumn } : {}),
    },
    evidence: draft.evidence,
    recommendation: draft.recommendation,
    fixability: draft.fixability,
    status: 'open',
    source: draft.source,
  } satisfies Issue);
}
