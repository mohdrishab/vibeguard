import type { Issue, ProjectInfo } from '@closed-door/core';

import type { Analyzer, AnalyzerRunDetail } from './analyzer.js';

/**
 * Ordered registry of analyzers. Registration is validated eagerly so a
 * duplicate or malformed analyzer fails fast at wiring time rather than
 * silently shadowing another analyzer's findings.
 */
export class AnalyzerRegistry {
  readonly #analyzers = new Map<string, Analyzer>();

  /**
   * @throws {Error} If an analyzer with the same id is already registered,
   *                 or the analyzer has an empty id.
   */
  register(analyzer: Analyzer): void {
    if (analyzer.id.trim() === '') {
      throw new Error('Analyzer id must be a non-empty string');
    }
    if (this.#analyzers.has(analyzer.id)) {
      throw new Error(`Analyzer "${analyzer.id}" is already registered`);
    }
    this.#analyzers.set(analyzer.id, analyzer);
  }

  get(id: string): Analyzer | undefined {
    return this.#analyzers.get(id);
  }

  list(): readonly Analyzer[] {
    return [...this.#analyzers.values()];
  }

  get size(): number {
    return this.#analyzers.size;
  }

  /** Runs every registered analyzer and concatenates their findings. */
  async runAll(parameters: Parameters<Analyzer['analyze']>[0]): Promise<readonly Issue[]> {
    const results = await Promise.all(this.list().map((analyzer) => analyzer.analyze(parameters)));
    return results.flat();
  }

  /**
   * Runs every registered analyzer and reports per-engine applicability
   * plus real output. Inapplicable engines are skipped (their `analyze`
   * is not invoked) and surfaced with the concrete reason, so the CLI can
   * state honestly why an engine produced nothing.
   */
  async runAllDetailed(project: ProjectInfo): Promise<readonly AnalyzerRunDetail[]> {
    const details = await Promise.all(
      this.list().map(async (analyzer) => {
        const applicability = analyzer.applicability?.(project) ?? { kind: 'applicable' as const };
        if (applicability.kind === 'not-applicable') {
          return {
            id: analyzer.id,
            name: analyzer.name,
            applicable: false,
            status: 'skipped' as const,
            inapplicableReason: applicability.reason,
            issues: [],
          };
        }
        try {
          const issues = await analyzer.analyze(project);
          return {
            id: analyzer.id,
            name: analyzer.name,
            applicable: true,
            status: 'passed' as const,
            inapplicableReason: '',
            issues,
          };
        } catch (error: unknown) {
          return {
            id: analyzer.id,
            name: analyzer.name,
            applicable: true,
            status: 'failed' as const,
            inapplicableReason: '',
            error: error instanceof Error ? error.message : String(error),
            issues: [],
          };
        }
      }),
    );
    return details;
  }
}
