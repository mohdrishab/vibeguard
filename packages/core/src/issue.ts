import type { Severity } from './severity.js';

/**
 * Broad classification of an issue. Drives which analyzer produced it and
 * how reports group findings.
 */
export type IssueCategory = 'bug' | 'security' | 'performance' | 'code-quality' | 'architecture';

/**
 * How confident the detecting engine is that this is a genuine problem.
 * 'confirmed' must only be used when backed by deterministic evidence
 * (a failing check, a compiler error, a vulnerable dependency version).
 * 'suspected' marks heuristic/AST-pattern findings that need review.
 */
export type IssueConfidence = 'confirmed' | 'suspected';

/**
 * Whether the engine believes it can repair the issue automatically, and
 * at what risk level. Safety levels gate the autonomous repair engine
 * (later phase): DANGEROUS repairs always require explicit human approval.
 */
export type Fixability = 'auto-safe' | 'auto-moderate' | 'ai-suggested' | 'manual-only';

/**
 * Lifecycle state of an issue relative to a project scan.
 */
export type IssueStatus = 'open' | 'fixed' | 'fix-failed' | 'acknowledged';

/**
 * A precise, line-level location within the scanned project.
 */
export interface IssueLocation {
  /** Path relative to the project root, always POSIX-style ('src/app.ts'). */
  readonly file: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly startColumn?: number;
  readonly endColumn?: number;
}

/**
 * Machine-readable evidence backing a finding. Never contains secret
 * values — sensitive material is redacted at capture time.
 */
export interface IssueEvidence {
  /** Verbatim source excerpt surrounding the finding (redacted). */
  readonly snippet?: string;
  /** Identifier of the check/rule that produced the finding. */
  readonly ruleId: string;
  /** Extra structured data specific to the analyzer (versions, call graphs…). */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * The normalized issue contract shared by every analyzer, the AI reasoning
 * engine, the repair engine, and all report formats.
 */
export interface Issue {
  /** Stable, content-derived identifier (Phase 5 will mint these). */
  readonly id: string;
  readonly category: IssueCategory;
  readonly severity: Severity;
  readonly confidence: IssueConfidence;
  readonly title: string;
  readonly description: string;
  readonly location: IssueLocation;
  readonly evidence: readonly IssueEvidence[];
  /** Root-cause explanation; filled in by the AI reasoning engine. */
  readonly rootCause?: string;
  readonly recommendation: string;
  readonly fixability: Fixability;
  readonly status: IssueStatus;
  /** Name of the analyzer that produced this issue (e.g. 'eslint'). */
  readonly source: string;
}
