import type { Issue, ProjectInfo } from '@vibeguard/core';

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
}
