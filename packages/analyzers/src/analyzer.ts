import type { Issue, ProjectInfo } from '@closed-door/core';

/**
 * A deterministic analyzer inspects a scanned project and returns issues
 * backed by concrete evidence. Implementations must never fabricate
 * findings — if there is no evidence, there is no issue.
 */
export interface Analyzer {
  /** Unique machine identifier, e.g. 'eslint', 'tsc', 'react-hooks'. */
  readonly id: string;
  /** Human-readable name shown in reports. */
  readonly name: string;
  /** Runs the analyzer against the project. */
  analyze(project: ProjectInfo): Promise<readonly Issue[]>;
  /**
   * Declares whether this engine is meaningful for the given project
   * (e.g. the TypeScript compiler only applies to TS sources). Optional:
   * analyzers without this hook are always considered applicable.
   */
  applicability?(
    project: ProjectInfo,
  ): { kind: 'applicable' } | { kind: 'not-applicable'; reason: string };
}

/**
 * Per-analyzer execution summary produced by
 * {@link AnalyzerRegistry.runAllDetailed}: engine applicability plus its
 * real issue output.
 */
export interface AnalyzerRunDetail {
  readonly id: string;
  readonly name: string;
  readonly applicable: boolean;
  readonly status: 'passed' | 'failed' | 'skipped';
  /** Why an engine was skipped (empty for applicable engines). */
  readonly inapplicableReason: string;
  /** Safe, concise error text when the analyzer could not complete. */
  readonly error?: string;
  readonly issues: readonly Issue[];
}
