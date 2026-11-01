import type { Issue } from '@vibeguard/core';

import type { Analyzer } from './analyzer.js';

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
}
