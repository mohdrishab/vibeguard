import { readFile } from 'node:fs/promises';

/** Reads a file as UTF-8. Must reject when the file is missing or unreadable. */
export type FileReader = (absolutePath: string) => Promise<string>;

export interface FileCacheStats {
  /** Cache hits (a file that was already read or is being read). */
  readonly hits: number;
  /** Physical read attempts, including failed reads. */
  readonly misses: number;
  /** Distinct paths tracked by the cache. */
  readonly size: number;
}

/**
 * Per-scan, in-memory UTF-8 file cache shared by every analyzer.
 *
 * - Concurrent requests for the same path await one in-flight read.
 * - A failed read is remembered as `undefined` for the rest of the scan, so
 *   a missing or unreadable file is never retried by each analyzer.
 * - Line arrays are derived once per file, so snippet capture does not
 *   re-split whole files for every finding.
 *
 * The cache is deliberately scoped to a single scan: it must not survive a
 * scan, because files may change between invocations.
 */
export class FileCache {
  readonly #reader: FileReader;
  readonly #contents = new Map<string, Promise<string | undefined>>();
  readonly #lines = new Map<string, readonly string[]>();
  #hits = 0;
  #misses = 0;

  constructor(reader: FileReader = (absolutePath) => readFile(absolutePath, 'utf8')) {
    this.#reader = reader;
  }

  /**
   * Returns the UTF-8 contents of `absolutePath`, or `undefined` when the
   * file is missing or unreadable. Never throws.
   */
  readText(absolutePath: string): Promise<string | undefined> {
    const cached = this.#contents.get(absolutePath);
    if (cached !== undefined) {
      this.#hits += 1;
      return cached;
    }

    this.#misses += 1;
    const pending = Promise.resolve()
      .then(() => this.#reader(absolutePath))
      .then(
        (content) => content,
        () => undefined,
      );
    this.#contents.set(absolutePath, pending);
    return pending;
  }

  /**
   * Returns the newline-split lines of `absolutePath`, or `undefined` when
   * the file is missing or unreadable. The split is performed once and
   * shared by every later snippet capture.
   */
  async readLines(absolutePath: string): Promise<readonly string[] | undefined> {
    const cached = this.#lines.get(absolutePath);
    if (cached !== undefined) {
      return cached;
    }

    const content = await this.readText(absolutePath);
    if (content === undefined) {
      return undefined;
    }

    const lines = Object.freeze(content.split(/\r?\n/u));
    this.#lines.set(absolutePath, lines);
    return lines;
  }

  get stats(): FileCacheStats {
    return {
      hits: this.#hits,
      misses: this.#misses,
      size: this.#contents.size,
    };
  }
}
